const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

// All admin routes require a valid JWT AND admin flag
router.use(authenticate, requireAdmin);

/**
 * GET /api/admin/stats
 * Returns aggregate counts across all users.
 */
router.get('/stats', async (req, res) => {
  // Run all four counts in parallel
  const [usersResult, stacksResult, labsResult, cyclesResult] = await Promise.all([
    // Total users = rows in profiles (one per auth user, via trigger)
    supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true }),

    supabaseAdmin
      .from('stacks')
      .select('*', { count: 'exact', head: true }),

    supabaseAdmin
      .from('lab_results')
      .select('*', { count: 'exact', head: true }),

    supabaseAdmin
      .from('cycles')
      .select('*', { count: 'exact', head: true }),
  ]);

  // Surface any DB errors
  const dbError =
    usersResult.error  ||
    stacksResult.error ||
    labsResult.error   ||
    cyclesResult.error;

  if (dbError) {
    return res.status(500).json({ error: dbError.message });
  }

  return res.json({
    total_users:   usersResult.count  ?? 0,
    total_stacks:  stacksResult.count ?? 0,
    total_labs:    labsResult.count   ?? 0,
    total_cycles:  cyclesResult.count ?? 0,
  });
});

module.exports = router;
