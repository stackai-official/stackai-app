const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/community/report — submit an anonymous community report
// Requires auth to prevent spam, but user_id is NOT stored in the report
router.post('/report', authenticate, async (req, res) => {
  const { compound, dosage, duration_weeks, rating, benefit, side_effects, recommend } = req.body;

  if (!compound || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'compound and rating (1-5) are required.' });
  }

  const { data, error } = await supabaseAdmin
    .from('community_reports')
    .insert({
      compound:       compound.trim(),
      dosage:         dosage ?? null,
      duration_weeks: duration_weeks ?? null,
      rating:         Math.round(rating),
      benefit:        benefit ?? null,
      side_effects:   side_effects ?? null,
      recommend:      recommend ?? true,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// GET /api/community/reports/:compound — get aggregate community data for a compound
router.get('/reports/:compound', async (req, res) => {
  const compound = decodeURIComponent(req.params.compound);

  const { data, error } = await supabaseAdmin
    .from('community_reports')
    .select('rating, benefit, side_effects, recommend')
    .ilike('compound', compound);

  if (error) return res.status(400).json({ error: error.message });
  if (!data || data.length === 0) return res.json({ count: 0 });

  const count = data.length;
  const avg_rating = data.reduce((sum, r) => sum + r.rating, 0) / count;
  const recommend_pct = Math.round((data.filter(r => r.recommend).length / count) * 100);

  // Most common benefit
  const benefitCounts = {};
  data.forEach(r => {
    if (r.benefit) benefitCounts[r.benefit] = (benefitCounts[r.benefit] || 0) + 1;
  });
  const top_benefit = Object.entries(benefitCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Most common side effect (from free text — take first non-empty)
  const sideEffects = data.map(r => r.side_effects).filter(Boolean);
  const top_side_effect = sideEffects.length > 0 ? sideEffects[0] : null;

  return res.json({ count, avg_rating, recommend_pct, top_benefit, top_side_effect });
});

module.exports = router;
