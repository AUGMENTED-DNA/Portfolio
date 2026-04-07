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

let currentProject = null;
let editingItemId = null;

async function loadProject() {
  const projectId = getProjectId();
  if (!projectId) { window.location.href = 'index.html'; return; }

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

// ── CHANGELOG ─────────────────────────────────────────────────────────────
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

// ── BACKLOG RENDER ─────────────────────────────────────────────────────────
function renderBacklog() {
  const list = document.getElementById('backlogList');
  list.innerHTML = '';

  currentProject.backlog.forEach(item => {
    const template = document.getElementById('backlogItem');
    const clone = template.content.cloneNode(true);
    const el = clone.querySelector('.backlog-item');

    clone.querySelector('.bl-title').textContent = item.title || '';
    clone.querySelector('.bl-summary').textContent = item.summary || '';
    clone.querySelector('.bl-description').textContent = item.description || '';

    if (!item.summary) clone.querySelector('.bl-summary').style.display = 'none';
    if (!item.description) clone.querySelector('.bl-description').style.display = 'none';

    const checkbox = clone.querySelector('.item-checkbox');
    checkbox.checked = item.status === 'done';
    if (item.status === 'done') clone.querySelector('.backlog-item').classList.add('done');

    checkbox.addEventListener('change', (e) => {
      const status = e.target.checked ? 'done' : 'pending';
      updateBacklogItem(item.id, { status });
      const row = e.target.closest('.backlog-item');
      row.classList.toggle('done', e.target.checked);
    });

    clone.querySelector('.btn-edit').addEventListener('click', () => openEdit(item));
    clone.querySelector('.btn-delete').addEventListener('click', () => confirmDelete(item.id, item.title));

    list.appendChild(clone);
  });
}

// ── ADD ITEM ───────────────────────────────────────────────────────────────
document.getElementById('addBacklogBtn').addEventListener('click', async () => {
  const title = document.getElementById('blTitle').value.trim();
  const summary = document.getElementById('blSummary').value.trim();
  const description = document.getElementById('blDescription').value.trim();

  if (!title) { document.getElementById('blTitle').focus(); return; }

  try {
    const response = await fetch(`/api/projects/${currentProject.id}/backlog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, summary, description })
    });
    const newItem = await response.json();
    currentProject.backlog.push(newItem);
    document.getElementById('blTitle').value = '';
    document.getElementById('blSummary').value = '';
    document.getElementById('blDescription').value = '';
    renderBacklog();
  } catch (err) {
    console.error('Failed to add backlog item:', err);
  }
});

document.getElementById('clearBacklogBtn').addEventListener('click', () => {
  document.getElementById('blTitle').value = '';
  document.getElementById('blSummary').value = '';
  document.getElementById('blDescription').value = '';
});

// ── EDIT ITEM ──────────────────────────────────────────────────────────────
function openEdit(item) {
  editingItemId = item.id;
  document.getElementById('editTitle').value = item.title || '';
  document.getElementById('editSummary').value = item.summary || '';
  document.getElementById('editDescription').value = item.description || '';
  document.getElementById('editOverlay').classList.remove('hidden');
}

function closeEdit() {
  editingItemId = null;
  document.getElementById('editOverlay').classList.add('hidden');
}

document.getElementById('editSaveBtn').addEventListener('click', async () => {
  if (!editingItemId) return;
  const title = document.getElementById('editTitle').value.trim();
  const summary = document.getElementById('editSummary').value.trim();
  const description = document.getElementById('editDescription').value.trim();

  try {
    await updateBacklogItem(editingItemId, { title, summary, description });
    const item = currentProject.backlog.find(b => b.id === editingItemId);
    if (item) { item.title = title; item.summary = summary; item.description = description; }
    closeEdit();
    renderBacklog();
  } catch (err) {
    console.error('Failed to save backlog item:', err);
  }
});

document.getElementById('editCancelBtn').addEventListener('click', closeEdit);
document.getElementById('editCancelBtn2').addEventListener('click', closeEdit);
document.getElementById('editOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('editOverlay')) closeEdit();
});

// ── DELETE ITEM ────────────────────────────────────────────────────────────
function confirmDelete(itemId, title) {
  if (!confirm(`Delete backlog item: "${title}"?`)) return;
  deleteBacklogItem(itemId);
}

async function deleteBacklogItem(itemId) {
  try {
    await fetch(`/api/projects/${currentProject.id}/backlog/${itemId}`, { method: 'DELETE' });
    currentProject.backlog = currentProject.backlog.filter(b => b.id !== itemId);
    renderBacklog();
  } catch (err) {
    console.error('Failed to delete backlog item:', err);
  }
}

// ── UPDATE ITEM ────────────────────────────────────────────────────────────
async function updateBacklogItem(itemId, updates) {
  await fetch(`/api/projects/${currentProject.id}/backlog/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
}

// ── TABS ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(tabName).classList.add('active');
  });
});

// ── INIT ───────────────────────────────────────────────────────────────────
loadProject();
