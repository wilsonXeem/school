const express = require('express');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

const WANDBOX_API = 'https://wandbox.org/api/compile.json';

// Map from course/language slug to Wandbox compiler name
const COMPILER_MAP = {
  python:     'cpython-3.12.7',
  django:     'cpython-3.12.7',
  dsa:        'cpython-3.12.7',
  javascript: 'nodejs-18.20.4',
  nodejs:     'nodejs-18.20.4',
  react:      'nodejs-18.20.4',
  angularjs:  'nodejs-18.20.4',
  java:       'openjdk-jdk-21+35',
  sql:        'sqlite-3.46.1',
  cpp:        'gcc-13.2.0',
  c:          'gcc-13.2.0-c',
  php:        'php-8.2.24',
  ruby:       'ruby-3.4.9',
};

const resolveCompiler = (lang) => {
  const key = String(lang || '').toLowerCase().trim();
  return COMPILER_MAP[key] || null;
};

// Rate limit: 20 executions per user per minute (in-memory)
const rateLimitMap = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 1000;

const checkRateLimit = (key) => {
  const now = Date.now();
  const entry = rateLimitMap.get(key) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  rateLimitMap.set(key, entry);
  return entry.count <= RATE_LIMIT;
};

// POST /execute
router.post('/', optionalAuth, async (req, res) => {
  const { code, language, stdin = '' } = req.body;

  if (!code || !code.trim()) {
    return res.status(400).json({ message: 'No code provided.' });
  }
  if (!language) {
    return res.status(400).json({ message: 'No language specified.' });
  }

  const compiler = resolveCompiler(language);
  if (!compiler) {
    return res.status(400).json({
      message: `Language "${language}" is not supported for execution.`,
      supported: Object.keys(COMPILER_MAP),
    });
  }

  const rateLimitKey = req.user ? String(req.user._id) : req.ip;
  if (!checkRateLimit(rateLimitKey)) {
    return res.status(429).json({ message: 'Too many executions. Please wait a moment.' });
  }

  try {
    const body = { compiler, code };
    if (stdin) body.stdin = stdin;

    const wandboxRes = await fetch(WANDBOX_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!wandboxRes.ok) {
      const errText = await wandboxRes.text();
      return res.status(502).json({ message: 'Execution service error.', detail: errText });
    }

    const result = await wandboxRes.json();

    const stdout = result.program_output || '';
    const stderr = result.program_error || result.compiler_error || '';
    const exitCode = Number(result.status ?? 0);

    return res.json({ stdout, stderr, exitCode, language, compiler });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      return res.status(504).json({ message: 'Execution timed out.' });
    }
    return res.status(502).json({ message: 'Could not reach execution service.', detail: error.message });
  }
});

// GET /execute/languages — returns supported languages
router.get('/languages', (req, res) => {
  res.json({
    supported: Object.keys(COMPILER_MAP).map((slug) => ({
      slug,
      compiler: COMPILER_MAP[slug],
    })),
  });
});

module.exports = router;
