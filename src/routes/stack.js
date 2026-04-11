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

// ── Titration schedules ──────────────────────────────────────────────────────

// POST /api/stack/titration — create or update a titration schedule
router.post('/titration', async (req, res) => {
  const { stack_id, compound, starting_dose, target_dose, unit, increase_amount, increase_interval_weeks, phases, status } = req.body;
  if (!compound || !starting_dose || !target_dose) {
    return res.status(400).json({ error: 'compound, starting_dose, and target_dose are required.' });
  }

  const { data, error } = await supabaseAdmin
    .from('titration_schedules')
    .upsert({
      user_id: req.user.id,
      stack_id: stack_id ?? null,
      compound,
      starting_dose,
      target_dose,
      unit: unit ?? 'mg',
      increase_amount: increase_amount ?? null,
      increase_interval_weeks: increase_interval_weeks ?? 4,
      phases: phases ?? [],
      status: status ?? 'active',
    }, { onConflict: 'user_id,compound' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// GET /api/stack/titrations — list titration schedules for user
router.get('/titrations', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('titration_schedules')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  return res.json(data);
});

// PUT /api/stack/titration/:id — update a titration schedule
router.put('/titration/:id', async (req, res) => {
  const { phases, status, current_phase_index } = req.body;
  const updates = {};
  if (phases !== undefined) updates.phases = phases;
  if (status !== undefined) updates.status = status;
  if (current_phase_index !== undefined) updates.current_phase_index = current_phase_index;

  const { data, error } = await supabaseAdmin
    .from('titration_schedules')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Titration schedule not found.' });
  return res.json(data);
});

// DELETE /api/stack/titration/:id — remove a titration schedule
router.delete('/titration/:id', async (req, res) => {
  const { error, count } = await supabaseAdmin
    .from('titration_schedules')
    .delete({ count: 'exact' })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Titration schedule not found.' });
  return res.json({ message: 'Titration schedule deleted.' });
});

// ── Sleep logs ───────────────────────────────────────────────────────────────

// POST /api/stack/sleep-log — log a sleep entry
router.post('/sleep-log', async (req, res) => {
  const { date, bedtime, wake_time, duration_minutes, quality, notes } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required.' });

  const { data, error } = await supabaseAdmin
    .from('sleep_logs')
    .upsert({
      user_id: req.user.id,
      date,
      bedtime: bedtime ?? null,
      wake_time: wake_time ?? null,
      duration_minutes: duration_minutes ?? null,
      quality: quality ?? null,
      notes: notes ?? null,
    }, { onConflict: 'user_id,date' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// GET /api/stack/sleep-logs — get sleep logs
router.get('/sleep-logs', async (req, res) => {
  const { from, to } = req.query;
  let query = supabaseAdmin
    .from('sleep_logs')
    .select('*')
    .eq('user_id', req.user.id)
    .order('date', { ascending: false });

  if (from) query = query.gte('date', from);
  if (to)   query = query.lte('date', to);

  const { data, error } = await query.limit(90);
  if (error) return res.status(400).json({ error: error.message });
  return res.json(data);
});

// ── Side effect logs ─────────────────────────────────────────────────────────

// POST /api/stack/side-effect — log a side effect
router.post('/side-effect', async (req, res) => {
  const { compound, symptom, severity, notes } = req.body;
  if (!compound || !symptom) return res.status(400).json({ error: 'compound and symptom are required.' });

  const { data, error } = await supabaseAdmin
    .from('side_effect_logs')
    .insert({
      user_id: req.user.id,
      compound,
      symptom,
      severity: severity ?? 1,
      notes: notes ?? null,
      logged_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// GET /api/stack/side-effects — get side effect history
router.get('/side-effects', async (req, res) => {
  const { compound, from, to } = req.query;
  let query = supabaseAdmin
    .from('side_effect_logs')
    .select('*')
    .eq('user_id', req.user.id)
    .order('logged_at', { ascending: false });

  if (compound) query = query.eq('compound', compound);
  if (from) query = query.gte('logged_at', from);
  if (to)   query = query.lte('logged_at', to);

  const { data, error } = await query.limit(200);
  if (error) return res.status(400).json({ error: error.message });
  return res.json(data);
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
