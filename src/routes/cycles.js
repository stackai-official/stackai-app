const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET /api/cycles — list all cycles for the user
router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('cycles')
    .select('*')
    .eq('user_id', req.user.id)
    .order('start_date', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  return res.json(data);
});

// POST /api/cycles — create a cycle
router.post('/', async (req, res) => {
  const { name, compounds, start_date, end_date, notes } = req.body;

  if (!name || !start_date) {
    return res.status(400).json({ error: 'name and start_date are required.' });
  }

  const { data, error } = await supabaseAdmin
    .from('cycles')
    .insert({
      user_id: req.user.id,
      name,
      compounds: compounds ?? [],
      start_date,
      end_date: end_date ?? null,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// PUT /api/cycles/:id — update a cycle
router.put('/:id', async (req, res) => {
  const { name, compounds, start_date, end_date, notes } = req.body;

  const { data, error } = await supabaseAdmin
    .from('cycles')
    .update({ name, compounds, start_date, end_date, notes })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Cycle not found.' });
  return res.json(data);
});

// DELETE /api/cycles/:id — delete a cycle
router.delete('/:id', async (req, res) => {
  const { error, count } = await supabaseAdmin
    .from('cycles')
    .delete({ count: 'exact' })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Cycle not found.' });
  return res.json({ message: 'Cycle deleted.' });
});

module.exports = router;
