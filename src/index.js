require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// Required for express-rate-limit behind Railway's reverse proxy
app.set('trust proxy', 1);

// ── Diagnostic direct route ───────────────────────────────────────────────────
app.get('/test', (_req, res) => {
  res.json({
    message: 'direct route works',
    routes: app._router.stack
      .filter(r => r.route)
      .map(r => ({ path: r.route.path, methods: Object.keys(r.route.methods) })),
  });
});

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS (open for testing — lock down before production) ────────────────────
app.use(cors({
  origin: '*',
  credentials: false,
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '256kb' }));

// ── Global rate limiting ──────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

// ── Chat-specific rate limiting (more restrictive — hits Anthropic API) ───────
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'Chat rate limit exceeded. Please wait a moment.' },
});

// ── Prevent CDN/Fastly caching of API routes ──────────────────────────────────
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  next();
});

app.use((_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex');
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
console.log('About to require auth routes...');
const authRoutes = require('./routes/auth');
console.log('Auth routes required successfully:', typeof authRoutes);
app.use('/api/auth', authRoutes);
console.log('Auth routes mounted at /api/auth');

console.log('About to require stack routes...');
const stackRoutes = require('./routes/stack');
console.log('Stack routes required successfully:', typeof stackRoutes);
app.use('/api/stack', stackRoutes);
console.log('Stack routes mounted at /api/stack');

console.log('About to require labs routes...');
const labsRoutes = require('./routes/labs');
console.log('Labs routes required successfully:', typeof labsRoutes);
app.use('/api/labs', labsRoutes);
console.log('Labs routes mounted at /api/labs');

console.log('About to require cycles routes...');
const cyclesRoutes = require('./routes/cycles');
console.log('Cycles routes required successfully:', typeof cyclesRoutes);
app.use('/api/cycles', cyclesRoutes);
console.log('Cycles routes mounted at /api/cycles');

console.log('About to require chat routes...');
const chatRoutes = require('./routes/chat');
console.log('Chat routes required successfully:', typeof chatRoutes);
app.use('/api/chat', chatLimiter, chatRoutes);
console.log('Chat routes mounted at /api/chat');

console.log('About to require admin routes...');
const adminRoutes = require('./routes/admin');
console.log('Admin routes required successfully:', typeof adminRoutes);
app.use('/api/admin', adminRoutes);
console.log('Admin routes mounted at /api/admin');

console.log('All routes mounted successfully.');

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.1' }));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`StackAI backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down…`);
  server.close(() => {
    console.log('Server closed. Port released.');
    process.exit(0);
  });
}

process.on('SIGINT',  () => shutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM'));  // kill / Docker stop
