const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All stack routes require authentication
router.use(authenticate);

// GET /api/stack — list all stack items for the authenticated user
router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('stacks')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  return res.json(data);
});

// POST /api/stack — add a new stack item
router.post('/', async (req, res) => {
  const { name, compound, dose, unit, frequency, notes } = req.body;

  if (!name || !compound) {
    return res.status(400).json({ error: 'name and compound are required.' });
  }

  const { data, error } = await supabaseAdmin
    .from('stacks')
    .insert({
      user_id: req.user.id,
      name,
      compound,
      dose: dose ?? null,
      unit: unit ?? null,
      frequency: frequency ?? null,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// PUT /api/stack/:id — update a stack item
router.put('/:id', async (req, res) => {
  const { name, compound, dose, unit, frequency, notes } = req.body;

  const { data, error } = await supabaseAdmin
    .from('stacks')
    .update({ name, compound, dose, unit, frequency, notes })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Stack item not found.' });
  return res.json(data);
});

// POST /api/stack/dose-log — log a dose taken
router.post('/dose-log', async (req, res) => {
  const { stack_id, compound, dose, unit, taken_at } = req.body;
  if (!compound) return res.status(400).json({ error: 'compound is required.' });

  const { data, error } = await supabaseAdmin
    .from('dose_logs')
    .insert({
      user_id: req.user.id,
      stack_id: stack_id ?? null,
      compound,
      dose: dose ?? null,
      unit: unit ?? null,
      taken_at: taken_at || new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// GET /api/stack/dose-logs — get dose logs for a date range
router.get('/dose-logs', async (req, res) => {
  const { from, to } = req.query;
  let query = supabaseAdmin
    .from('dose_logs')
    .select('*')
    .eq('user_id', req.user.id)
    .order('taken_at', { ascending: false });

  if (from) query = query.gte('taken_at', from);
  if (to)   query = query.lte('taken_at', to);

  const { data, error } = await query.limit(200);
  if (error) return res.status(400).json({ error: error.message });
  return res.json(data);
});

// POST /api/stack/injection-log — log an injection at a specific site
router.post('/injection-log', async (req, res) => {
  const { site, compound, dose, unit, notes, injected_at } = req.body;
  if (!site || !compound) return res.status(400).json({ error: 'site and compound are required.' });

  const { data, error } = await supabaseAdmin
    .from('injection_logs')
    .insert({
      user_id: req.user.id,
      site,
      compound,
      dose: dose ?? null,
      unit: unit ?? null,
      notes: notes ?? null,
      injected_at: injected_at || new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// POST /api/stack/daily-log — log daily wellness check-in
router.post('/daily-log', async (req, res) => {
  const { date, energy, mood, libido, sleep_quality, joint_pain, notes } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required.' });

  const { data, error } = await supabaseAdmin
    .from('daily_logs')
    .upsert({
      user_id: req.user.id,
      date,
      energy: energy ?? null,
      mood: mood ?? null,
      libido: libido ?? null,
      sleep_quality: sleep_quality ?? null,
      joint_pain: joint_pain ?? null,
      notes: notes ?? null,
    }, { onConflict: 'user_id,date' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// DELETE /api/stack/:id — remove a stack item
router.delete('/:id', async (req, res) => {
  const { error, count } = await supabaseAdmin
    .from('stacks')
    .delete({ count: 'exact' })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Stack item not found.' });
  return res.json({ message: 'Stack item deleted.' });
});

module.exports = router;
