const { supabaseAdmin } = require('../config/supabase');

/**
 * Middleware that enforces admin-only access.
 * Must be used AFTER authenticate (relies on req.user being set).
 *
 * Checks the server-side `profiles` table — never trusts client-supplied claims.
 */
async function requireAdmin(req, res, next) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', req.user.id)
    .single();

  if (error || !data?.is_admin) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  next();
}

module.exports = { requireAdmin };
