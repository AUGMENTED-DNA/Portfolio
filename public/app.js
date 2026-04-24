// Portfolio — Project Dashboard
// Fetches project list + enriches with live server status from Utilities watchdog

const WATCHDOG_URL = 'http://localhost:9000/api/watchdog'
const EMAIL_STATUS_URL = 'http://localhost:8082/api/email-status'

// Tracks whether the last watchdog fetch succeeded
let watchdogOnline = false

// Portfolio display names → watchdog registered names (lowercase) where they differ
const WATCHDOG_NAME_ALIASES = {
  'ai email agent': 'email agent',
}

// Theme toggle
const themeToggle = document.getElementById('themeToggle')
const html = document.documentElement
themeToggle.addEventListener('click', () => {
  const newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  html.setAttribute('data-theme', newTheme)
  localStorage.setItem('portfolio-theme', newTheme)
})

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// Fetch server status map from Utilities watchdog { name -> 'UP'|'DOWN'|'NO_SERVER' }
async function fetchServerStatus() {
  try {
    const res = await fetch(WATCHDOG_URL, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) { watchdogOnline = false; return {} }
    const data = await res.json()
    watchdogOnline = true
    const map = {}
    for (const p of (data.projects || [])) {
      map[p.name.toLowerCase()] = p.status  // 'UP' | 'DOWN' | 'NO_SERVER'
    }
    return map
  } catch { watchdogOnline = false; return {} }
}

// Fetch email status from Email Agent
async function fetchEmailStatus() {
  try {
    const res = await fetch(EMAIL_STATUS_URL, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    return await res.json()  // expects { loaded: N, expected: N, isComplete: bool, urgentUnread: N }
  } catch { return null }
}

function serverStatusIcon(statusStr) {
  if (statusStr === 'WATCHDOG_OFFLINE') return '<span class="srv-icon" style="color:var(--text-secondary)" title="Watchdog offline — status unknown">?</span>'
  if (!statusStr || statusStr === 'NO_SERVER') return '<span class="srv-icon srv-na" title="No server">—</span>'
  if (statusStr === 'UP') return '<span class="srv-icon srv-up" title="Server UP">↑</span>'
  return '<span class="srv-icon srv-down" title="Server DOWN">↓</span>'
}

function emailStatusIcon(emailStatus) {
  if (!emailStatus) return '<span class="email-icon email-unknown" title="Email status unknown">?</span>'
  if (emailStatus.isComplete) return '<span class="email-icon email-ok" title="All emails loaded">👍</span>'
  return '<span class="email-icon email-bad" title="Emails not fully loaded">👎</span>'
}

function pct(n) {
  if (n == null) return '—'
  return n + '%'
}

async function loadProjects() {
  const container = document.getElementById('projectsContainer')
  container.innerHTML = '<div class="loading-msg">Loading…</div>'

  try {
    const [projectsRes, serverStatus, emailStatus] = await Promise.all([
      fetch('/api/projects'),
      fetchServerStatus(),
      fetchEmailStatus(),
    ])
    const projects = await projectsRes.json()

    const watchdogBanner = watchdogOnline ? '' :
      `<div style="padding:5px 12px;margin-bottom:8px;font-size:11px;letter-spacing:0.06em;color:var(--danger);border:1px solid rgba(220,38,38,0.3);border-radius:3px;background:rgba(220,38,38,0.06)">⚠ WATCHDOG OFFLINE — server status unavailable (port 9000 not responding)</div>`

    container.innerHTML = watchdogBanner + `
      <table class="proj-table">
        <thead>
          <tr>
            <th class="col-name">Project</th>
            <th class="col-srv" title="Server status">Srv</th>
            <th class="col-email" title="Emails loaded (Todoist Agent only)">Mail</th>
            <th class="col-pct" title="Percent complete">Done%</th>
            <th class="col-live" title="Live sessions">Live</th>
            <th class="col-orphan" title="Orphan sessions">Orphan</th>
            <th class="col-urgent" title="Urgent unread emails (last 30 days)">Urgent</th>
            <th class="col-cl" title="Changelog entries">CL</th>
            <th class="col-bl" title="Backlog items">BL</th>
          </tr>
        </thead>
        <tbody id="projBody"></tbody>
      </table>`

    const tbody = document.getElementById('projBody')

    for (const project of projects) {
      const nameKey = project.name.toLowerCase()
      const watchdogKey = WATCHDOG_NAME_ALIASES[nameKey] || nameKey
      const srvStatus = project.port
        ? (watchdogOnline ? (serverStatus[watchdogKey] || 'UNKNOWN') : 'WATCHDOG_OFFLINE')
        : 'NO_SERVER'

      const isTodioist = project.id === 'todoist-agent'
      const emailIcon = isTodioist ? emailStatusIcon(emailStatus) : '<span class="srv-na">—</span>'

      const urgentCount = isTodioist
        ? (emailStatus?.urgentUnread ?? project.urgentUnread ?? '?')
        : (project.urgentUnread != null ? project.urgentUnread : '—')

      const tr = document.createElement('tr')
      tr.className = 'proj-row'
      tr.dataset.id = project.id
      tr.innerHTML = `
        <td class="col-name">
          <span class="proj-name-link" data-id="${escHtml(project.id)}" title="${escHtml(project.description)}">${escHtml(project.name)}</span>
        </td>
        <td class="col-srv">${serverStatusIcon(srvStatus)}</td>
        <td class="col-email">${emailIcon}</td>
        <td class="col-pct">${pct(project.percentComplete)}</td>
        <td class="col-live">${project.liveSessions ?? '—'}</td>
        <td class="col-orphan">${project.orphanSessions ?? '—'}</td>
        <td class="col-urgent">${urgentCount}</td>
        <td class="col-cl">${project.changelog?.length ?? 0}</td>
        <td class="col-bl">${project.backlog?.length ?? 0}</td>
      `
      tbody.appendChild(tr)
    }

    // Project name click → navigate to project detail (options routes to its own page)
    document.querySelectorAll('.proj-name-link').forEach(el => {
      el.addEventListener('click', () => {
        window.location.href = el.dataset.id === 'options'
          ? 'options.html'
          : `project.html?id=${el.dataset.id}`
      })
    })
  } catch (err) {
    container.innerHTML = `<div class="loading-msg" style="color:var(--danger)">Failed to load projects: ${escHtml(err.message)}</div>`
  }
}

loadProjects()
