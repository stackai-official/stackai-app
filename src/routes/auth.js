const express = require('express');
const { supabase, supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: name || '' },
    },
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({
    message: 'Signup successful. Check your email to confirm your account.',
    user: {
      id: data.user?.id,
      email: data.user?.email,
      name: data.user?.user_metadata?.name,
    },
    session: data.session,
  });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  // Look up admin flag from server-side profiles table (never trust user_metadata)
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', data.user.id)
    .single();

  return res.json({
    user: {
      id:       data.user.id,
      email:    data.user.email,
      name:     data.user.user_metadata?.name,
      is_admin: profile?.is_admin ?? false,
    },
    session: data.session,
  });
});

// POST /api/auth/refresh — exchange a refresh token for a new session
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token is required.' });
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  return res.json({
    access_token:  data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at:    data.session.expires_at,
  });
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  // admin.signOut requires the service-role client and takes a userId
  const { error } = await supabaseAdmin.auth.admin.signOut(req.user.id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const [userResult, profileResult] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(req.user.id),
    supabaseAdmin.from('profiles').select('is_admin').eq('id', req.user.id).single(),
  ]);

  if (userResult.error) {
    return res.status(400).json({ error: userResult.error.message });
  }

  const user = userResult.data.user;
  return res.json({
    id:         user.id,
    email:      user.email,
    name:       user.user_metadata?.name,
    is_admin:   profileResult.data?.is_admin ?? false,
    created_at: user.created_at,
  });
});

module.exports = router;
