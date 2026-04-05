const express = require('express');
const multer = require('multer');
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

// POST /api/labs/body-metrics — log body measurements
router.post('/body-metrics', async (req, res) => {
  const { date, weight, body_fat, waist, chest, arms, legs, unit_system, notes } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required.' });

  const { data, error } = await supabaseAdmin
    .from('body_metrics')
    .insert({
      user_id: req.user.id,
      date,
      weight: weight ?? null,
      body_fat: body_fat ?? null,
      waist: waist ?? null,
      chest: chest ?? null,
      arms: arms ?? null,
      legs: legs ?? null,
      unit_system: unit_system ?? 'imperial',
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// DELETE /api/labs/upload/:uploadId — delete all results from a specific PDF upload
router.delete('/upload/:uploadId', async (req, res) => {
  const { error, count } = await supabaseAdmin
    .from('lab_results')
    .delete({ count: 'exact' })
    .eq('uploaded_from', req.params.uploadId)
    .eq('user_id', req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  return res.json({ deleted: count ?? 0 });
});

// POST /api/labs/parse-pdf — upload a PDF, send directly to Claude for extraction, auto-save
router.post('/parse-pdf', upload.single('pdf'), async (req, res) => {
  try {
    console.log('[parse-pdf] file received:', req.file ? req.file.originalname : 'NO FILE');
    console.log('[parse-pdf] file size:', req.file ? req.file.size : 0);

    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.' });

    const base64Pdf = req.file.buffer.toString('base64');
    console.log('[parse-pdf] base64 length:', base64Pdf.length);

    // Send the PDF natively to Claude using the document content block — no pdf-parse needed
    let extracted;
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Pdf,
              },
            },
            {
              type: 'text',
              text: `Extract every lab test result from this PDF. Return ONLY a raw JSON array — no markdown, no explanation, no text before or after the array. Each object must have exactly these fields:
{"test_name":"string","value":number,"unit":"string or null","tested_at":"ISO8601 date","notes":"ref range string or null"}
Use the report date for tested_at. If no date found use today. Numeric value only (no units in value field).`,
            },
          ],
        }],
      });

      const rawJson = message.content[0]?.text?.trim() ?? '[]';
      console.log('[parse-pdf] Claude raw response (first 300 chars):', rawJson.slice(0, 300));

      // Strip markdown fences if present, then extract the JSON array
      let jsonText = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const startIdx = jsonText.indexOf('[');
      const endIdx   = jsonText.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1) {
        jsonText = jsonText.substring(startIdx, endIdx + 1);
      }
      extracted = JSON.parse(jsonText);

      if (!Array.isArray(extracted)) throw new Error('Response was not an array.');
    } catch (err) {
      console.error('[parse-pdf] Claude extraction error:', err.stack);
      return res.status(502).json({ error: `AI extraction failed: ${err.message}` });
    }

    if (extracted.length === 0) {
      return res.json({ saved: 0, message: 'No lab results found in this PDF.' });
    }

    // Generate upload batch ID from filename + timestamp
    const uploadId = `pdf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filename = req.file.originalname || 'lab_report.pdf';

    // Insert all extracted results for this user, tagged with upload batch
    const rows = extracted.map(item => ({
      user_id:       req.user.id,
      test_name:     String(item.test_name ?? 'Unknown').trim(),
      value:         Number(item.value),
      unit:          item.unit ? String(item.unit).trim() : null,
      tested_at:     item.tested_at ?? new Date().toISOString(),
      notes:         item.notes ? String(item.notes).trim() : null,
      uploaded_from: uploadId,
    })).filter(r => !isNaN(r.value));

    const { error: insertError } = await supabaseAdmin
      .from('lab_results')
      .insert(rows);

    if (insertError) return res.status(400).json({ error: insertError.message });

    return res.json({ saved: rows.length, upload_id: uploadId, filename });
  } catch (err) {
    console.error('[parse-pdf] FULL ERROR:', err.stack);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
