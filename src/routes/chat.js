const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;

router.use(authenticate);

/**
 * POST /api/chat
 *
 * Body:
 *   messages  — array of { role: 'user'|'assistant', content: string }
 *   system    — optional system prompt string
 *   stream    — boolean (default false); when true, streams SSE chunks
 */
router.post('/', async (req, res) => {
  const { messages, system, stream = false } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required and must not be empty.' });
  }

  // Basic message shape validation
  for (const msg of messages) {
    if (!['user', 'assistant'].includes(msg.role) || typeof msg.content !== 'string') {
      return res.status(400).json({ error: 'Each message must have a role ("user"|"assistant") and a string content.' });
    }
  }

  if (stream) {
    // ── Streaming response (SSE) ──────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const streamParams = {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages,
      };
      if (system) streamParams.system = system;

      const anthropicStream = await client.messages.stream(streamParams);

      for await (const event of anthropicStream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  } else {
    // ── Non-streaming response ────────────────────────────────────────────────
    try {
      const params = {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages,
      };
      if (system) params.system = system;

      const response = await client.messages.create(params);

      return res.json({
        id: response.id,
        role: response.role,
        content: response.content,
        model: response.model,
        stop_reason: response.stop_reason,
        usage: response.usage,
      });
    } catch (err) {
      return res.status(502).json({ error: `Anthropic API error: ${err.message}` });
    }
  }
});

/**
 * POST /api/chat/body-scan
 *
 * Body:
 *   image — base64 data URL (data:image/jpeg;base64,...)
 *
 * Uses Claude vision to estimate body composition from a photo.
 */
router.post('/body-scan', async (req, res) => {
  const { image } = req.body;

  if (!image || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: 'A valid base64 image data URL is required.' });
  }

  // Extract media type and base64 data
  const match = image.match(/^data:(image\/[a-z]+);base64,(.+)$/i);
  if (!match) {
    return res.status(400).json({ error: 'Invalid image format.' });
  }
  const mediaType = match[1];
  const base64Data = match[2];

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: 'You are analyzing a body composition photo for fitness tracking purposes.\n\nPlease analyze this photo and provide estimates for:\n1. Body fat percentage (provide a specific number range e.g. "15-18%")\n2. Muscle definition level (rate 1-10 where 1=no visible muscle, 10=competition ready)\n3. Overall physique assessment (2-3 sentences)\n4. Visible muscle groups (list what is visible)\n5. Recommendations for the user\'s protocol\n\nIMPORTANT: Always provide specific numbers for body fat % and muscle definition score even if approximate. Never say "cannot be estimated" - always give a range.\n\nFormat your response as JSON:\n{"bodyFat": "15-18%", "muscleDefinition": 6, "assessment": "...", "visibleMuscles": ["chest", "arms"], "recommendations": "..."}\n\nRespond ONLY with the JSON object, no other text.',
            },
          ],
        },
      ],
    });

    const text = response.content?.[0]?.text || '';
    return res.json({ analysis: text, usage: response.usage });
  } catch (err) {
    return res.status(502).json({ error: `Analysis failed: ${err.message}` });
  }
});

module.exports = router;
