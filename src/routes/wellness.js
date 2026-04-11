const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All wellness routes require authentication
router.use(authenticate);

// ── Sleep logs ───────────────────────────────────────────────────────────────

// POST /api/wellness/sleep — save a sleep log (upsert by date)
router.post('/sleep', async (req, res) => {
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

// GET /api/wellness/sleep — get all sleep logs for user
router.get('/sleep', async (req, res) => {
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

// DELETE /api/wellness/sleep/:id — delete a sleep log
router.delete('/sleep/:id', async (req, res) => {
  const { error, count } = await supabaseAdmin
    .from('sleep_logs')
    .delete({ count: 'exact' })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Sleep log not found.' });
  return res.json({ message: 'Sleep log deleted.' });
});

// ── Side effect logs ─────────────────────────────────────────────────────────

// POST /api/wellness/side-effects — save a side effect log
router.post('/side-effects', async (req, res) => {
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

// GET /api/wellness/side-effects — get all side effect logs for user
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

module.exports = router;
