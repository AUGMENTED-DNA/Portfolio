// Theme toggle
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

themeToggle.addEventListener('click', () => {
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('portfolio-theme', newTheme);
});

// Get project ID from URL
function getProjectId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

// Load project data
let currentProject = null;

async function loadProject() {
  const projectId = getProjectId();
  if (!projectId) {
    window.location.href = 'index.html';
    return;
  }

  try {
    const response = await fetch(`/api/projects/${projectId}`);
    currentProject = await response.json();

    document.getElementById('projectTitle').textContent = currentProject.name;
    renderChangelog();
    renderBacklog();
  } catch (err) {
    console.error('Failed to load project:', err);
    window.location.href = 'index.html';
  }
}

// Render changelog
function renderChangelog() {
  const list = document.getElementById('changelogList');
  list.innerHTML = '';

  currentProject.changelog.forEach(item => {
    const template = document.getElementById('changelogItem');
    const clone = template.content.cloneNode(true);

    clone.querySelector('.item-title').textContent = item.title;
    clone.querySelector('.date-value.inserted').textContent = item.dateInserted;
    clone.querySelector('.date-value.completed').textContent = item.dateCompleted;

    list.appendChild(clone);
  });
}

// Render backlog
function renderBacklog() {
  const list = document.getElementById('backlogList');
  list.innerHTML = '';

  currentProject.backlog.forEach(item => {
    const template = document.getElementById('backlogItem');
    const clone = template.content.cloneNode(true);

    clone.querySelector('.item-title').textContent = item.title;

    const checkbox = clone.querySelector('.item-checkbox');
    checkbox.checked = item.status === 'done';

    const deleteBtn = clone.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', () => deleteBacklogItem(item.id));

    checkbox.addEventListener('change', (e) => {
      updateBacklogItem(item.id, { status: e.target.checked ? 'done' : 'pending' });
    });

    list.appendChild(clone);
  });
}

// Tab switching
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;

    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(t => t.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById(tabName).classList.add('active');
  });
});

// Add backlog item
document.getElementById('addBacklogBtn').addEventListener('click', async () => {
  const input = document.getElementById('newBacklogItem');
  const title = input.value.trim();

  if (!title) return;

  try {
    const response = await fetch(`/api/projects/${currentProject.id}/backlog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });

    const newItem = await response.json();
    currentProject.backlog.push(newItem);
    input.value = '';
    renderBacklog();
  } catch (err) {
    console.error('Failed to add backlog item:', err);
  }
});

// Delete backlog item
async function deleteBacklogItem(itemId) {
  try {
    await fetch(`/api/projects/${currentProject.id}/backlog/${itemId}`, {
      method: 'DELETE'
    });

    currentProject.backlog = currentProject.backlog.filter(item => item.id !== itemId);
    renderBacklog();
  } catch (err) {
    console.error('Failed to delete backlog item:', err);
  }
}

// Update backlog item
async function updateBacklogItem(itemId, updates) {
  try {
    await fetch(`/api/projects/${currentProject.id}/backlog/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  } catch (err) {
    console.error('Failed to update backlog item:', err);
  }
}

// Initialize
loadProject();
