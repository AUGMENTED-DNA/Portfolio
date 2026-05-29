require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  const initialData = {
    projects: [
      {
        id: 'proj-1',
        name: 'Todoist Agent',
        description: 'AI-powered task management system',
        changelog: [
          { id: 'cl-1', title: 'Habit notes feature', dateInserted: '2026-03-31', dateCompleted: '2026-03-31' },
          { id: 'cl-2', title: 'Book review summaries', dateInserted: '2026-03-31', dateCompleted: '2026-03-31' }
        ],
        backlog: [
          { id: 'bl-1', title: 'Advanced filtering for tasks', status: 'pending' },
          { id: 'bl-2', title: 'Export to CSV', status: 'pending' }
        ]
      }
    ]
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
}

// Get all projects
app.get('/api/projects', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(data.projects);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read projects' });
  }
});

// Get single project
app.get('/api/projects/:id', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const project = data.projects.find(p => p.id === req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read project' });
  }
});

// Add backlog item
app.post('/api/projects/:id/backlog', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const project = data.projects.find(p => p.id === req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const newItem = {
      id: 'bl-' + Date.now(),
      title: req.body.title || '',
      summary: req.body.summary || '',
      description: req.body.description || '',
      status: 'pending'
    };
    project.backlog.push(newItem);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json(newItem);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add backlog item' });
  }
});

// Delete backlog item
app.delete('/api/projects/:id/backlog/:itemId', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const project = data.projects.find(p => p.id === req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    project.backlog = project.backlog.filter(item => item.id !== req.params.itemId);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete backlog item' });
  }
});

// Update backlog item
app.patch('/api/projects/:id/backlog/:itemId', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const project = data.projects.find(p => p.id === req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const item = project.backlog.find(bl => bl.id === req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Backlog item not found' });
    }

    if (req.body.title !== undefined) item.title = req.body.title;
    if (req.body.summary !== undefined) item.summary = req.body.summary;
    if (req.body.description !== undefined) item.description = req.body.description;
    if (req.body.status !== undefined) item.status = req.body.status;

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update backlog item' });
  }
});

// ── Options Strategies ────────────────────────────────────────────────────────

const STRATEGIES_DIR = path.join(__dirname, 'options', 'strategies');
if (!fs.existsSync(STRATEGIES_DIR)) fs.mkdirSync(STRATEGIES_DIR, { recursive: true });

function extractVideoId(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
  return match ? match[1] : null;
}

const ANALYSIS_PROMPT = `You are an expert options trader. Analyze this YouTube video transcript and extract the complete options trading strategy described.

Return ONLY a valid JSON object (no markdown, no extra text):
{
  "name": "specific strategy name",
  "type": "strategy category (e.g. Iron Condor, Covered Call, Cash-Secured Put)",
  "underlying": "specific ticker or 'Any'",
  "direction": "Bullish | Bearish | Neutral | Variable",
  "timeframe": "typical DTE or holding period",
  "summary": "2-3 sentence plain English summary",
  "entryConditions": ["array of specific entry rules"],
  "legs": [{"position": "Buy|Sell", "instrument": "Call|Put|Stock", "strike": "description", "expiration": "description"}],
  "exitConditions": ["array of specific exit rules"],
  "riskManagement": {
    "maxLoss": "description",
    "maxGain": "description",
    "stopLoss": "description or null",
    "takeProfit": "description or null",
    "positionSizing": "description or null"
  },
  "idealMarketConditions": "when this strategy works best",
  "keyRules": ["most important rules from the video"],
  "keyMetrics": {
    "deltaTarget": "target delta or null",
    "ivRank": "IV rank preference or null",
    "probabilityOfProfit": "target POP or null"
  },
  "backtestNotes": "specific backtestable parameters: strike selection, DTE, underlying, adjustment rules",
  "videoTitle": "extract from transcript or null",
  "channelName": "extract from transcript or null"
}

Transcript:
`;

app.post('/api/options/ingest', async (req, res) => {
  const { url, transcript: pastedTranscript } = req.body;
  if (!url) return res.status(400).json({ error: 'INVALID_INPUT', message: 'URL is required' });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: 'INVALID_URL', message: 'Not a valid YouTube URL' });

  let transcriptText = (pastedTranscript || '').trim();
  let transcriptSource = 'pasted';

  if (!transcriptText) {
    try {
      const { YoutubeTranscript } = await import('youtube-transcript');
      const items = await YoutubeTranscript.fetchTranscript(videoId);
      transcriptText = items.map(t => t.text).join(' ');
      transcriptSource = 'auto';
    } catch {
      return res.status(422).json({
        error: 'TRANSCRIPT_UNAVAILABLE',
        message: 'Could not auto-fetch transcript. Please paste it manually below.',
      });
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return res.status(500).json({
      error: 'API_KEY_MISSING',
      message: 'GEMINI_API_KEY not set. Edit the .env file and restart the server.',
    });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  try {
    const result = await model.generateContent(ANALYSIS_PROMPT + transcriptText.slice(0, 900000));
    const raw = result.response.text();
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```\s*$/m, '').trim();

    let analysis = {};
    try { analysis = JSON.parse(cleaned); } catch { analysis = { name: 'Parsed Strategy', summary: raw }; }

    const strategy = {
      id: `strategy-${Date.now()}`,
      source: {
        url,
        videoId,
        videoTitle: analysis.videoTitle || null,
        channelName: analysis.channelName || null,
        consumedDate: new Date().toISOString().split('T')[0],
        transcriptSource,
      },
      name: analysis.name || 'Unknown Strategy',
      type: analysis.type || null,
      underlying: analysis.underlying || null,
      direction: analysis.direction || null,
      timeframe: analysis.timeframe || null,
      summary: analysis.summary || null,
      entryConditions: analysis.entryConditions || [],
      legs: analysis.legs || [],
      exitConditions: analysis.exitConditions || [],
      riskManagement: analysis.riskManagement || {},
      idealMarketConditions: analysis.idealMarketConditions || null,
      keyRules: analysis.keyRules || [],
      keyMetrics: analysis.keyMetrics || {},
      backtestNotes: analysis.backtestNotes || null,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(path.join(STRATEGIES_DIR, `${strategy.id}.json`), JSON.stringify(strategy, null, 2));
    res.json({ success: true, strategy });
  } catch (err) {
    const msg = err.message || '';
    if (err.status === 429 || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
      return res.status(429).json({
        error: 'QUOTA_EXCEEDED',
        message: 'Gemini free tier daily limit reached. Quota resets at midnight Pacific time. Try again tomorrow.',
      });
    }
    res.status(500).json({ error: 'ANALYSIS_FAILED', message: msg || 'Gemini analysis failed' });
  }
});

app.get('/api/options/strategies', (req, res) => {
  try {
    if (!fs.existsSync(STRATEGIES_DIR)) return res.json([]);
    const files = fs.readdirSync(STRATEGIES_DIR).filter(f => f.endsWith('.json'));
    const strategies = files
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(STRATEGIES_DIR, f), 'utf8')); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(strategies);
  } catch { res.status(500).json({ error: 'Failed to read strategies' }); }
});

app.delete('/api/options/strategies/:id', (req, res) => {
  try {
    const filePath = path.join(STRATEGIES_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Strategy not found' });
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to delete strategy' }); }
});

// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Portfolio server running at http://localhost:${PORT}`);
});
