const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const Anthropic = require('@anthropic-ai/sdk');
const { supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// multer: accept PDF in memory only, max 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are accepted.'));
  },
});

router.use(authenticate);

// GET /api/labs — list all lab results for the user
router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('lab_results')
    .select('*')
    .eq('user_id', req.user.id)
    .order('tested_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  return res.json(data);
});

// POST /api/labs — add a lab result
router.post('/', async (req, res) => {
  const { test_name, value, unit, tested_at, notes } = req.body;

  if (!test_name || value === undefined || value === null) {
    return res.status(400).json({ error: 'test_name and value are required.' });
  }

  const { data, error } = await supabaseAdmin
    .from('lab_results')
    .insert({
      user_id: req.user.id,
      test_name,
      value,
      unit: unit ?? null,
      tested_at: tested_at ?? new Date().toISOString(),
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// PUT /api/labs/:id — update a lab result
router.put('/:id', async (req, res) => {
  const { test_name, value, unit, tested_at, notes } = req.body;

  const { data, error } = await supabaseAdmin
    .from('lab_results')
    .update({ test_name, value, unit, tested_at, notes })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Lab result not found.' });
  return res.json(data);
});

// DELETE /api/labs/:id — delete a lab result
router.delete('/:id', async (req, res) => {
  const { error, count } = await supabaseAdmin
    .from('lab_results')
    .delete({ count: 'exact' })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Lab result not found.' });
  return res.json({ message: 'Lab result deleted.' });
});

// POST /api/labs/parse-pdf — upload a PDF lab report, extract results with AI, auto-save
router.post('/parse-pdf', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.' });

  // 1. Extract raw text from the PDF buffer
  let pdfText;
  try {
    const pdfData = await pdfParse(req.file.buffer);
    pdfText = pdfData.text;
  } catch (parseErr) {
    console.error('PDF parse error:', parseErr.message);
    return res.status(400).json({ error: 'Could not read PDF file. Make sure it is a valid PDF.' });
  }

  if (!pdfText || pdfText.trim().length < 20) {
    return res.status(422).json({ error: 'PDF appears to contain no readable text.' });
  }

  // 2. Ask Claude to extract structured lab results
  const systemPrompt = `You are a medical lab report parser. Extract all lab test results from the text provided and return a JSON array. Each element must have:
- "test_name": string (e.g. "Testosterone Total", "Free T4", "HbA1c")
- "value": number (numeric value only, no units)
- "unit": string (e.g. "ng/dL", "%", "mIU/L") or null if not present
- "tested_at": ISO 8601 date string (use the report date if found, otherwise today's date)
- "notes": string with reference range if present (e.g. "Ref: 300-1000 ng/dL"), otherwise null

Return ONLY the raw JSON array, no markdown, no explanation.`;

  let extracted;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: pdfText.slice(0, 12000) }], // cap to avoid token overflow
    });

    const rawJson = message.content[0]?.text?.trim() ?? '[]';
    // Strip markdown code fences if Claude wrapped anyway
    const clean = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    extracted = JSON.parse(clean);

    if (!Array.isArray(extracted)) throw new Error('Response was not an array.');
  } catch (err) {
    return res.status(502).json({ error: `AI extraction failed: ${err.message}` });
  }

  if (extracted.length === 0) {
    return res.json({ saved: 0, message: 'No lab results found in this PDF.' });
  }

  // 3. Insert all extracted results for this user
  const rows = extracted.map(item => ({
    user_id:   req.user.id,
    test_name: String(item.test_name ?? 'Unknown').trim(),
    value:     Number(item.value),
    unit:      item.unit ? String(item.unit).trim() : null,
    tested_at: item.tested_at ?? new Date().toISOString(),
    notes:     item.notes ? String(item.notes).trim() : null,
  })).filter(r => !isNaN(r.value));

  const { error: insertError } = await supabaseAdmin
    .from('lab_results')
    .insert(rows);

  if (insertError) return res.status(400).json({ error: insertError.message });

  return res.json({ saved: rows.length });
});

module.exports = router;
