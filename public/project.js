// Portfolio — Project Detail Page (Layout B)
// Renders INFO, OBJECTIVE, CHANGELOG, BACKLOG tabs with compact expandable rows

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function getProjectId() {
  return new URLSearchParams(window.location.search).get('id')
}

let currentProject = null
let editingItemId  = null

// ── TOOLTIP ─────────────────────────────────────────────────────────────────
const tt       = document.getElementById('tt')
const ttTitle  = document.getElementById('ttTitle')
const ttBody   = document.getElementById('ttBody')
const ttFooter = document.getElementById('ttFooter')
let   ttTarget = null

document.addEventListener('mousemove', ev => {
  if (tt.style.display === 'none') return
  const x = ev.clientX + 14, y = ev.clientY + 14
  const w = tt.offsetWidth, h = tt.offsetHeight
  tt.style.left = (x + w > window.innerWidth  ? ev.clientX - w - 10 : x) + 'px'
  tt.style.top  = (y + h > window.innerHeight ? ev.clientY - h - 10 : y) + 'px'
})

function showTooltip(el) {
  const title = el.dataset.ttTitle || ''
  const body  = el.dataset.ttBody  || ''
  const foot  = el.dataset.ttFoot  || ''
  if (!title && !body) return
  ttTitle.textContent = title
  ttBody.textContent  = body
  ttFooter.textContent = foot
  ttFooter.style.display = foot ? 'block' : 'none'
  tt.style.display = 'block'
  ttTarget = el
}

function hideTooltip() {
  tt.style.display = 'none'
  ttTarget = null
}

// ── THEME TOGGLE ─────────────────────────────────────────────────────────────
document.getElementById('themeToggle').addEventListener('click', () => {
  const html = document.documentElement
  const newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  html.setAttribute('data-theme', newTheme)
  localStorage.setItem('portfolio-theme', newTheme)
})

// ── TABS ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.pj-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pj-tab-btn').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.pj-tab').forEach(t => t.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active')
    hideTooltip()
  })
})

// ── EXPANDABLE ROWS + TOOLTIP (event delegation on .pj-content) ──────────────
const pjContent = document.querySelector('.pj-content')

pjContent.addEventListener('click', ev => {
  if (ev.target.closest('button') || ev.target.closest('input')) return
  const row = ev.target.closest('[data-expandable]')
  if (row) row.classList.toggle('expanded')
})

pjContent.addEventListener('mouseover', ev => {
  const item = ev.target.closest('[data-expandable]')
  if (item && item !== ttTarget) showTooltip(item)
})

pjContent.addEventListener('mouseout', ev => {
  const item = ev.target.closest('[data-expandable]')
  if (item && !item.contains(ev.relatedTarget)) hideTooltip()
})

// ── RENDER: INFO TAB ─────────────────────────────────────────────────────────
function renderInfo(project) {
  const info = project.info || {}
  const container = document.getElementById('tab-info')

  // Stats / metadata table (always shown if any fields present)
  const stats = []
  if (project.lang)    stats.push(['Language', project.lang])
  if (project.port)    stats.push(['Port', ':' + project.port])
  if (project.status)  stats.push(['Status', project.status])
  if (project.started) stats.push(['Started', project.started])

  const statsHtml = stats.length > 0
    ? `<table class="pj-info-tbl" style="margin-bottom:16px">
        ${stats.map(([k,v]) => `<tr><td style="color:var(--text-muted);width:90px">${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`).join('')}
       </table>`
    : ''

  const overviewHtml = info.overview
    ? `<h2>Overview</h2><p>${escHtml(info.overview)}</p>`
    : (!stats.length ? '<p class="pj-empty">No project info added yet. Edit data.json to add overview, tech stack, and objectives.</p>' : '')

  const techHtml = (info.techStack || []).length > 0
    ? `<h2>Tech Stack</h2>
       <table class="pj-info-tbl">
         <tr><th>Component</th><th>Technology</th></tr>
         ${info.techStack.map(r => `<tr><td>${escHtml(r.component)}</td><td><code>${escHtml(r.technology)}</code></td></tr>`).join('')}
       </table>`
    : ''

  const featuresHtml = (info.features || []).length > 0
    ? `<h2>Key Features</h2><ul>${info.features.map(f => `<li>${escHtml(f)}</li>`).join('')}</ul>`
    : ''

  const relatedHtml = (info.relatedProjects || []).length > 0
    ? `<h2>Related Projects</h2>
       <div class="pj-rel-cards">
         ${info.relatedProjects.map(r => `
           <div class="pj-rel-card">
             <div class="pj-rel-card-title">${escHtml(r.name)}</div>
             <div class="pj-rel-card-desc">${escHtml(r.desc)}</div>
           </div>`).join('')}
       </div>`
    : ''

  container.innerHTML = `<div class="pj-info-doc">${statsHtml}${overviewHtml}${techHtml}${featuresHtml}${relatedHtml}</div>`
}

// ── RENDER: OBJECTIVE TAB ────────────────────────────────────────────────────
function renderObjectives(project) {
  const objs = project.objectives || []
  const container = document.getElementById('tab-objective')

  if (objs.length === 0) {
    container.innerHTML = '<div class="pj-empty">No objectives defined yet. Add them to data.json under "objectives".</div>'
    return
  }

  const badgeClass = { Core: 'pj-obj-core', Planned: 'pj-obj-planned', Ongoing: 'pj-obj-ongoing' }

  container.innerHTML = '<div class="pj-obj-list">' +
    objs.map(o => `
      <div class="pj-row-item pj-obj-item" data-expandable
           data-tt-title="${escHtml(o.title)}"
           data-tt-body="${escHtml(o.detail || '')}"
           data-tt-foot="${escHtml('Priority: ' + (o.priority || 'Core'))}">
        <div class="pj-row-compact">
          <span class="pj-obj-badge ${badgeClass[o.priority] || 'pj-obj-core'}">${escHtml(o.priority || 'Core')}</span>
          <span class="pj-obj-title">${escHtml(o.title)}</span>
          <span class="pj-row-chevron">&#8250;</span>
        </div>
        <div class="pj-row-expand">
          <div class="pj-row-detail">${escHtml(o.detail || 'No details provided.')}</div>
        </div>
      </div>`).join('') +
    '</div>'
}

// ── RENDER: CHANGELOG TAB ────────────────────────────────────────────────────
function renderChangelog(project) {
  const items = project.changelog || []
  const container = document.getElementById('tab-changelog')

  if (items.length === 0) {
    container.innerHTML = '<div class="pj-empty">No changelog entries yet.</div>'
    return
  }

  container.innerHTML = '<div class="pj-cl-list">' +
    items.map(en => {
      const dateLine = en.pushedAt || en.dateCompleted || en.dateInserted || ''
      const hasDetail = !!(en.detail)
      return `
        <div class="pj-row-item pj-cl-item${hasDetail ? '' : ' pj-no-expand'}" ${hasDetail ? 'data-expandable' : ''}
             data-tt-title="${escHtml((en.version ? en.version + ' \u2014 ' : '') + en.title)}"
             data-tt-body="${escHtml(en.detail || '')}"
             data-tt-foot="${escHtml(dateLine ? 'Completed: ' + dateLine : '')}">
          <div class="pj-row-compact">
            ${en.version ? `<span class="pj-cl-ver">${escHtml(en.version)}</span>` : ''}
            <span class="pj-cl-title">${escHtml(en.title)}</span>
            ${dateLine ? `<span class="pj-cl-date">${escHtml(dateLine)}</span>` : ''}
            ${hasDetail ? `<span class="pj-row-chevron">&#8250;</span>` : ''}
          </div>
          ${hasDetail ? `
          <div class="pj-row-expand">
            <div class="pj-row-detail">${escHtml(en.detail)}</div>
            ${dateLine ? `<div class="pj-row-meta">Completed: ${escHtml(dateLine)}</div>` : ''}
          </div>` : ''}
        </div>`
    }).join('') +
    '</div>'
}

// ── RENDER: BACKLOG TAB ──────────────────────────────────────────────────────
function renderBacklog(project) {
  const items = project.backlog || []
  const container = document.getElementById('backlogList')

  if (items.length === 0) {
    container.innerHTML = '<div class="pj-empty">No backlog items yet. Use the form above to add one.</div>'
    return
  }

  container.innerHTML = '<div class="pj-bl-list">' +
    items.map(b => {
      const hasDetail = !!(b.detail || b.description)
      return `
        <div class="pj-row-item pj-bl-item${b.status === 'done' ? ' pj-bl-done' : ''}${hasDetail ? '' : ' pj-no-expand'}" ${hasDetail ? 'data-expandable' : ''}
             data-tt-title="${escHtml(b.title)}"
             data-tt-body="${escHtml(b.detail || b.description || '')}"
             data-tt-foot="">
          <div class="pj-row-compact">
            <input type="checkbox" class="pj-bl-cb" ${b.status === 'done' ? 'checked' : ''} data-id="${escHtml(b.id)}">
            <div class="pj-bl-title-row">
              <span class="pj-bl-title">${escHtml(b.title)}</span>
              ${b.summary ? `<span class="pj-bl-sep">&#183;</span><span class="pj-bl-summary">${escHtml(b.summary)}</span>` : ''}
            </div>
            <div class="pj-bl-acts">
              <button class="pj-btn-edit" data-id="${escHtml(b.id)}">EDIT</button>
              <button class="pj-btn-del"  data-id="${escHtml(b.id)}">DEL</button>
            </div>
            ${hasDetail ? `<span class="pj-row-chevron">&#8250;</span>` : ''}
          </div>
          ${hasDetail ? `
          <div class="pj-row-expand">
            <div class="pj-row-detail">${escHtml(b.detail || b.description)}</div>
          </div>` : ''}
        </div>`
    }).join('') +
    '</div>'

  // Checkbox handlers
  container.querySelectorAll('.pj-bl-cb').forEach(cb => {
    cb.addEventListener('change', e => {
      const id = e.target.dataset.id
      const status = e.target.checked ? 'done' : 'pending'
      const item = currentProject.backlog.find(b => b.id === id)
      if (item) item.status = status
      updateBacklogItem(id, { status })
      e.target.closest('.pj-bl-item').classList.toggle('pj-bl-done', e.target.checked)
    })
  })

  // Edit buttons
  container.querySelectorAll('.pj-btn-edit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const item = currentProject.backlog.find(b => b.id === btn.dataset.id)
      if (item) openEdit(item)
    })
  })

  // Delete buttons
  container.querySelectorAll('.pj-btn-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const item = currentProject.backlog.find(b => b.id === btn.dataset.id)
      if (item) confirmDelete(item.id, item.title)
    })
  })
}

// ── HEADER STATS ─────────────────────────────────────────────────────────────
function updateHeaderStats() {
  document.getElementById('statChangelog').textContent  = (currentProject.changelog  || []).length
  document.getElementById('statBacklog').textContent    = (currentProject.backlog    || []).length
  document.getElementById('statObjectives').textContent = (currentProject.objectives || []).length
}

// ── LOAD PROJECT ─────────────────────────────────────────────────────────────
async function loadProject() {
  const projectId = getProjectId()
  if (!projectId) { window.location.href = 'index.html'; return }

  try {
    const res = await fetch(`/api/projects/${projectId}`)
    currentProject = await res.json()

    // Header
    document.getElementById('projName').textContent = currentProject.name || '—'

    const verEl = document.getElementById('projVer')
    if (currentProject.version) {
      verEl.textContent = currentProject.version
      verEl.style.display = ''
    }

    document.getElementById('projDesc').textContent = currentProject.description || ''

    const ghLink = document.getElementById('ghLink')
    if (currentProject.github) {
      ghLink.href = currentProject.github
      ghLink.style.display = ''
    }

    updateHeaderStats()

    // Render all tabs
    renderInfo(currentProject)
    renderObjectives(currentProject)
    renderChangelog(currentProject)
    renderBacklog(currentProject)

  } catch (err) {
    console.error('Failed to load project:', err)
    window.location.href = 'index.html'
  }
}

// ── ADD BACKLOG ITEM ─────────────────────────────────────────────────────────
document.getElementById('addBacklogBtn').addEventListener('click', async () => {
  const title       = document.getElementById('blTitle').value.trim()
  const summary     = document.getElementById('blSummary').value.trim()
  const description = document.getElementById('blDescription').value.trim()
  if (!title) { document.getElementById('blTitle').focus(); return }

  try {
    const res = await fetch(`/api/projects/${currentProject.id}/backlog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, summary, description })
    })
    const newItem = await res.json()
    currentProject.backlog.push(newItem)
    document.getElementById('blTitle').value       = ''
    document.getElementById('blSummary').value     = ''
    document.getElementById('blDescription').value = ''
    renderBacklog(currentProject)
    updateHeaderStats()
  } catch (err) {
    console.error('Failed to add backlog item:', err)
  }
})

document.getElementById('clearBacklogBtn').addEventListener('click', () => {
  document.getElementById('blTitle').value       = ''
  document.getElementById('blSummary').value     = ''
  document.getElementById('blDescription').value = ''
})

// ── EDIT BACKLOG ITEM ─────────────────────────────────────────────────────────
function openEdit(item) {
  editingItemId = item.id
  document.getElementById('editTitle').value       = item.title       || ''
  document.getElementById('editSummary').value     = item.summary     || ''
  document.getElementById('editDescription').value = item.description || ''
  document.getElementById('editOverlay').classList.remove('hidden')
}

function closeEdit() {
  editingItemId = null
  document.getElementById('editOverlay').classList.add('hidden')
}

document.getElementById('editSaveBtn').addEventListener('click', async () => {
  if (!editingItemId) return
  const title       = document.getElementById('editTitle').value.trim()
  const summary     = document.getElementById('editSummary').value.trim()
  const description = document.getElementById('editDescription').value.trim()

  try {
    await updateBacklogItem(editingItemId, { title, summary, description })
    const item = currentProject.backlog.find(b => b.id === editingItemId)
    if (item) { item.title = title; item.summary = summary; item.description = description }
    closeEdit()
    renderBacklog(currentProject)
  } catch (err) {
    console.error('Failed to save backlog item:', err)
  }
})

document.getElementById('editCancelBtn').addEventListener('click',  closeEdit)
document.getElementById('editCancelBtn2').addEventListener('click', closeEdit)
document.getElementById('editOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('editOverlay')) closeEdit()
})

// ── DELETE BACKLOG ITEM ───────────────────────────────────────────────────────
function confirmDelete(itemId, title) {
  if (!confirm(`Delete backlog item: "${title}"?`)) return
  deleteBacklogItem(itemId)
}

async function deleteBacklogItem(itemId) {
  try {
    await fetch(`/api/projects/${currentProject.id}/backlog/${itemId}`, { method: 'DELETE' })
    currentProject.backlog = currentProject.backlog.filter(b => b.id !== itemId)
    renderBacklog(currentProject)
    updateHeaderStats()
  } catch (err) {
    console.error('Failed to delete backlog item:', err)
  }
}

async function updateBacklogItem(itemId, updates) {
  await fetch(`/api/projects/${currentProject.id}/backlog/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  })
}

// ── INIT ─────────────────────────────────────────────────────────────────────
loadProject()
