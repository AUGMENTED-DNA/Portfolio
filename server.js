const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

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
      title: req.body.title,
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

    if (req.body.title) item.title = req.body.title;
    if (req.body.status) item.status = req.body.status;

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update backlog item' });
  }
});

app.listen(PORT, () => {
  console.log(`Portfolio server running at http://localhost:${PORT}`);
});
