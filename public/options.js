// Options Strategies — Frontend

// Theme toggle
document.getElementById('themeToggle').addEventListener('click', () => {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('portfolio-theme', next);
});

document.getElementById('urlInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') analyze();
});

let currentStrategyId = null;

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Status / Banner helpers ──────────────────────────────────────────────────

function showStatus(msg) {
  const el = document.getElementById('statusMsg');
  document.getElementById('statusText').textContent = msg;
  el.style.display = msg ? 'flex' : 'none';
}

function showError(msg) {
  document.getElementById('errorMsg').textContent = msg;
  document.getElementById('errorBanner').style.display = 'flex';
  document.getElementById('quotaBanner').style.display = 'none';
}
function hideError() { document.getElementById('errorBanner').style.display = 'none'; }

function showQuota(msg) {
  document.getElementById('quotaMsg').textContent = msg;
  document.getElementById('quotaBanner').style.display = 'flex';
  document.getElementById('errorBanner').style.display = 'none';
}
function hideQuota() { document.getElementById('quotaBanner').style.display = 'none'; }

function showPaste() { document.getElementById('pasteSection').style.display = 'block'; }
function hidePaste() {
  document.getElementById('pasteSection').style.display = 'none';
  document.getElementById('transcriptPaste').value = '';
}

// ── Analyze ──────────────────────────────────────────────────────────────────

async function analyze() {
  const url       = document.getElementById('urlInput').value.trim();
  const transcript = document.getElementById('transcriptPaste').value.trim();
  if (!url) return;

  hideError(); hideQuota();
  showStatus('Fetching transcript…');
  document.getElementById('analyzeBtn').disabled = true;
  document.getElementById('resultCard').style.display = 'none';

  try {
    const res  = await fetch('/api/options/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, transcript }),
    });
    const data = await res.json();

    if (!res.ok) {
      if (data.error === 'TRANSCRIPT_UNAVAILABLE') {
        showPaste();
        showError('Auto-fetch failed — paste the transcript in the box below, then click Analyze again.');
      } else if (data.error === 'QUOTA_EXCEEDED') {
        showQuota(data.message);
      } else if (data.error === 'API_KEY_MISSING') {
        showError(
          'Gemini API key not set. ' +
          'Open Portfolio/.env, set GEMINI_API_KEY=<your key>, then restart the server. ' +
          'Get a free key at: aistudio.google.com/app/apikey'
        );
      } else {
        showError(data.message || 'Analysis failed. Check the server log for details.');
      }
      return;
    }

    hidePaste();
    currentStrategyId = data.strategy.id;
    renderResult(data.strategy);
    loadStrategies();
  } catch (err) {
    showError('Connection error: ' + err.message);
  } finally {
    showStatus('');
    document.getElementById('analyzeBtn').disabled = false;
  }
}

// ── Render result ─────────────────────────────────────────────────────────────

function dirClass(dir) {
  if (!dir) return 'badge-neutral';
  const d = dir.toLowerCase();
  if (d.includes('bull')) return 'badge-bullish';
  if (d.includes('bear')) return 'badge-bearish';
  if (d.includes('var'))  return 'badge-variable';
  return 'badge-neutral';
}

function renderBadges(s) {
  return [
    s.type       ? `<span class="badge badge-type">${esc(s.type)}</span>`                      : '',
    s.direction  ? `<span class="badge ${dirClass(s.direction)}">${esc(s.direction)}</span>`   : '',
    s.underlying ? `<span class="badge badge-underlying">${esc(s.underlying)}</span>`          : '',
    s.timeframe  ? `<span class="badge badge-timeframe">${esc(s.timeframe)}</span>`            : '',
  ].filter(Boolean).join('');
}

function ruleList(arr) {
  if (!arr?.length) return '';
  return `<ul class="rule-list">${arr.map(r => `<li class="rule-item">${esc(r)}</li>`).join('')}</ul>`;
}

function metricsHtml(km) {
  if (!km) return '';
  const chips = [
    km.deltaTarget         ? { k:'Delta Target',      v: km.deltaTarget }         : null,
    km.ivRank              ? { k:'IV Rank',            v: km.ivRank }             : null,
    km.probabilityOfProfit ? { k:'Prob. of Profit',   v: km.probabilityOfProfit } : null,
  ].filter(Boolean);
  if (!chips.length) return '';
  return `<div class="section-label">Key Metrics</div>
    <div class="metrics-row">${chips.map(c =>
      `<div class="metric-chip"><div class="metric-key">${esc(c.k)}</div><div class="metric-val">${esc(c.v)}</div></div>`
    ).join('')}</div>`;
}

function renderResult(s) {
  document.getElementById('resultName').textContent   = s.name || 'Unknown Strategy';
  document.getElementById('resultBadges').innerHTML  = renderBadges(s);

  // Overview
  document.getElementById('tabOverview').innerHTML = `
    ${s.summary ? `<p class="summary-text">${esc(s.summary)}</p>` : ''}
    ${s.idealMarketConditions
      ? `<div class="section-label">Ideal Market Conditions</div>
         <ul class="rule-list"><li class="rule-item" style="border-color:var(--success)">${esc(s.idealMarketConditions)}</li></ul>`
      : ''}
    ${s.keyRules?.length ? `<div class="section-label">Key Rules</div>${ruleList(s.keyRules)}` : ''}
  `;

  // Entry
  const legsHtml = s.legs?.length
    ? `<div class="section-label">Legs</div>
       <table class="legs-table">
         <thead><tr><th>Position</th><th>Instrument</th><th>Strike</th><th>Expiration</th></tr></thead>
         <tbody>${s.legs.map(l =>
           `<tr><td>${esc(l.position)}</td><td>${esc(l.instrument)}</td><td>${esc(l.strike)}</td><td>${esc(l.expiration)}</td></tr>`
         ).join('')}</tbody>
       </table>`
    : '';
  document.getElementById('tabEntry').innerHTML = `
    ${s.entryConditions?.length
      ? `<div class="section-label">Entry Conditions</div>${ruleList(s.entryConditions)}`
      : '<p class="summary-text" style="opacity:.5">No entry conditions extracted.</p>'}
    ${legsHtml}
    ${metricsHtml(s.keyMetrics)}
  `;

  // Exit
  document.getElementById('tabExit').innerHTML = s.exitConditions?.length
    ? `<div class="section-label">Exit Conditions</div>${ruleList(s.exitConditions)}`
    : '<p class="summary-text" style="opacity:.5">No exit conditions extracted.</p>';

  // Risk
  const rm = s.riskManagement || {};
  document.getElementById('tabRisk').innerHTML = `
    <div class="risk-grid">
      ${rm.maxLoss       ? `<div class="risk-item"><div class="risk-label">Max Loss</div><div class="risk-value" style="color:#f87171">${esc(rm.maxLoss)}</div></div>` : ''}
      ${rm.maxGain       ? `<div class="risk-item"><div class="risk-label">Max Gain</div><div class="risk-value" style="color:#4ade80">${esc(rm.maxGain)}</div></div>` : ''}
      ${rm.stopLoss      ? `<div class="risk-item"><div class="risk-label">Stop Loss</div><div class="risk-value">${esc(rm.stopLoss)}</div></div>` : ''}
      ${rm.takeProfit    ? `<div class="risk-item"><div class="risk-label">Take Profit</div><div class="risk-value">${esc(rm.takeProfit)}</div></div>` : ''}
      ${rm.positionSizing ? `<div class="risk-item" style="grid-column:1/-1"><div class="risk-label">Position Sizing</div><div class="risk-value">${esc(rm.positionSizing)}</div></div>` : ''}
    </div>
  `;

  // Backtest
  document.getElementById('tabBacktest').innerHTML = s.backtestNotes
    ? `<div class="section-label">Backtestable Parameters</div><div class="backtest-notes">${esc(s.backtestNotes)}</div>`
    : '<p class="summary-text" style="opacity:.5">No backtest parameters extracted.</p>';

  // Footer
  document.getElementById('footerMeta').textContent =
    `Consumed: ${s.source?.consumedDate || '—'} | Transcript: ${s.source?.transcriptSource === 'auto' ? 'Auto-fetched' : 'Pasted'}`;
  const lnk = document.getElementById('footerLink');
  lnk.href = s.source?.url || '#';
  lnk.textContent = (s.source?.videoTitle ? esc(s.source.videoTitle) : 'View Video') + ' →';

  document.getElementById('deleteResultBtn').dataset.id = s.id;
  document.getElementById('resultCard').style.display = 'block';

  switchTab('overview', document.querySelector('.result-tab'));
}

function switchTab(name, btn) {
  document.querySelectorAll('.result-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('tab' + name.charAt(0).toUpperCase() + name.slice(1));
  if (panel) panel.classList.add('active');
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function deleteCurrentResult() {
  const id = document.getElementById('deleteResultBtn').dataset.id;
  if (!id || !confirm('Delete this strategy? This cannot be undone.')) return;
  try {
    await fetch(`/api/options/strategies/${id}`, { method: 'DELETE' });
    document.getElementById('resultCard').style.display = 'none';
    currentStrategyId = null;
    loadStrategies();
  } catch { /* silent */ }
}

async function deleteStrategy(id) {
  if (!confirm('Delete this strategy? This cannot be undone.')) return;
  try {
    await fetch(`/api/options/strategies/${id}`, { method: 'DELETE' });
    if (currentStrategyId === id) {
      document.getElementById('resultCard').style.display = 'none';
      currentStrategyId = null;
    }
    loadStrategies();
  } catch { /* silent */ }
}

// ── Strategy Library ──────────────────────────────────────────────────────────

async function loadStrategies() {
  const list = document.getElementById('strategiesList');
  try {
    const strategies = await fetch('/api/options/strategies').then(r => r.json());
    const count = strategies.length;
    document.getElementById('libraryCount').textContent = count ? `(${count})` : '';

    if (!count) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          No strategies saved yet.<br>Paste a YouTube URL above to analyze your first strategy.
        </div>`;
      return;
    }

    list.innerHTML = strategies.map(s => `
      <div class="strategy-row" id="row-${esc(s.id)}" onclick="toggleRow('${esc(s.id)}')">
        <div class="row-top">
          <span class="row-name">${esc(s.name)}</span>
          <div class="row-meta">
            ${s.type      ? `<span class="badge badge-type">${esc(s.type)}</span>` : ''}
            ${s.direction ? `<span class="badge ${dirClass(s.direction)}">${esc(s.direction)}</span>` : ''}
            <span class="row-date">${esc(s.source?.consumedDate || '')}</span>
            <span class="row-expand">▶</span>
          </div>
        </div>
        ${s.summary ? `<div class="row-summary">${esc(s.summary)}</div>` : ''}
        <div class="row-detail">
          ${s.keyRules?.length
            ? `<div class="section-label">Key Rules</div>
               <ul class="rule-list">
                 ${s.keyRules.slice(0, 3).map(r => `<li class="rule-item">${esc(r)}</li>`).join('')}
                 ${s.keyRules.length > 3 ? `<li class="rule-item" style="opacity:.6">+${s.keyRules.length - 3} more — click LOAD to view all</li>` : ''}
               </ul>`
            : ''}
          ${s.backtestNotes
            ? `<div class="section-label" style="margin-top:10px">Backtest Notes</div>
               <div class="backtest-notes">${esc(s.backtestNotes)}</div>`
            : ''}
          <div class="row-actions">
            <button class="analyze-btn btn-small"
              onclick="event.stopPropagation(); loadStrategy('${esc(s.id)}')">LOAD</button>
            <button class="delete-btn"
              onclick="event.stopPropagation(); deleteStrategy('${esc(s.id)}')">DELETE</button>
            <a href="${esc(s.source?.url || '#')}" target="_blank" rel="noopener"
              style="text-decoration:none;"
              onclick="event.stopPropagation()">
              <button class="theme-toggle btn-small">VIDEO →</button>
            </a>
          </div>
        </div>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<div class="empty-state">Failed to load strategies. Is the server running?</div>';
  }
}

function toggleRow(id) {
  document.getElementById('row-' + id)?.classList.toggle('expanded');
}

async function loadStrategy(id) {
  try {
    const strategies = await fetch('/api/options/strategies').then(r => r.json());
    const s = strategies.find(x => x.id === id);
    if (!s) return;
    currentStrategyId = s.id;
    renderResult(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch { /* silent */ }
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadStrategies();
