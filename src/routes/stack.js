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
