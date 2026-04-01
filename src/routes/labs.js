const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

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

module.exports = router;
