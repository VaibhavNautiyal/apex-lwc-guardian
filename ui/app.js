// Guardian dashboard. Plain browser JavaScript, no build step; talks to the JSON API in src/ui/server.ts.

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]

const SEVERITIES = ['error', 'warning', 'info']
const SEVERITY_LABEL = {error: 'Errors', warning: 'Warnings', info: 'Info'}

const state = {
  scope: 'changed',
  project: null,
  filters: {error: true, warning: true, info: true},
  query: '',
  last: null, // {kind, data}
  sources: new Map(),
}

// ---------- helpers ----------

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const icons = {
  check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  cross: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  shieldOk:
    '<svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.4 8.6 8 9.9 4.6-1.3 8-4.9 8-9.9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
}

function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(`guardian.${key}`)
    localStorage.setItem(`guardian.${key}`, value)
  } catch {
    // Storage blocked; settings simply are not remembered.
  }
  return null
}

let toastTimer
function toast(message) {
  const el = $('#toast')
  el.textContent = message
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (el.hidden = true), 2400)
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? {'Content-Type': 'application/json'} : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({error: {message: `HTTP ${response.status}`}}))
  if (!response.ok || data.error) {
    const error = new Error(data.error?.message ?? `HTTP ${response.status}`)
    error.info = data.error
    throw error
  }
  return data
}

function cwd() {
  return $('#cwd').value.trim()
}

function query(params) {
  return new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
}

function errorBox(error, title = 'Could not run Guardian') {
  const code = error.info?.exitCode
  const hint =
    code === 3
      ? 'Environment problem: check that the folder is a git repository with commits and that the base branch exists.'
      : code === 2
        ? 'Input or config problem: check the fields above and guardian.config.yml.'
        : ''
  return `<div class="alert error"><strong>${esc(title)}</strong>${hint ? `${esc(hint)}` : ''}<pre>${esc(error.message)}</pre></div>`
}

function loading(message) {
  return `<div class="loading"><div class="spinner"></div>${esc(message)}</div>`
}

function splitPath(path) {
  const i = path.lastIndexOf('/')
  return i < 0 ? ['', path] : [path.slice(0, i + 1), path.slice(i + 1)]
}

function languageOf(path) {
  return /\/lwc\//.test(path) ? 'lwc' : 'apex'
}

function shortSha(sha) {
  return sha ? sha.slice(0, 8) : 'n/a'
}

function formatTime(iso) {
  const d = new Date(iso)
  return isNaN(d) ? iso : d.toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'})
}

// ---------- theme and navigation ----------

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme
  else delete document.documentElement.dataset.theme
}

$('#theme-toggle').addEventListener('click', () => {
  const current =
    document.documentElement.dataset.theme ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const next = current === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  storage('theme', next)
})

function showView(view) {
  for (const btn of $$('.nav-item')) btn.classList.toggle('active', btn.dataset.view === view)
  for (const section of $$('.view')) section.hidden = section.id !== `view-${view}`
  storage('view', view)
  if (view === 'audit') loadAudit()
  if (view === 'rules') renderRules()
}

for (const btn of $$('.nav-item')) btn.addEventListener('click', () => showView(btn.dataset.view))

// ---------- project ----------

async function loadProject() {
  const status = $('#project-status')
  status.innerHTML = '<span>Loading project...</span>'
  try {
    const project = await api(`/api/project?${query({cwd: cwd()})}`)
    state.project = project
    $('#base').placeholder = project.config.baseBranch
    const chip = $('#branch-chip')
    chip.hidden = !project.branch
    $('#branch-name').textContent = project.branch ?? ''
    if (!$('#story').value && project.branch) {
      const story = /([A-Z][A-Z0-9]*-\d+)/.exec(project.branch)
      if (story) $('#story').value = story[1]
    }
    const enabled = project.rules.filter((r) => r.enabled).length
    status.innerHTML = [
      `<span>Repository: <code>${esc(project.root)}</code></span>`,
      project.isGitRepository
        ? ''
        : '<span class="bad">Not a git repository: use All files or Specific files</span>',
      `<span>Config: ${project.configPath ? `<code>${esc(project.configPath)}</code>` : 'defaults (no guardian.config.yml)'}</span>`,
      `<span>${enabled} of ${project.rules.length} rules on, fail on ${esc(project.config.thresholds.failOn)}</span>`,
    ].join('')
  } catch (error) {
    state.project = null
    $('#branch-chip').hidden = true
    status.innerHTML = `<span class="bad">${esc(error.message)}</span>`
  }
  if (!$('#view-rules').hidden) renderRules()
  if (!$('#view-audit').hidden) loadAudit()
}

$('#reload-project').addEventListener('click', loadProject)
$('#cwd').addEventListener('keydown', (e) => e.key === 'Enter' && loadProject())
$('#cwd').addEventListener('change', loadProject)

// ---------- scan and gate ----------

for (const btn of $$('[data-scope]')) {
  btn.addEventListener('click', () => {
    state.scope = btn.dataset.scope
    for (const b of $$('[data-scope]')) b.setAttribute('aria-checked', String(b === btn))
    $('#files-field').hidden = state.scope !== 'files'
  })
}

function scanRequest() {
  const files = $('#files')
    .value.split(/[\n,]/)
    .map((f) => f.trim())
    .filter(Boolean)
  return {
    cwd: cwd(),
    base: $('#base').value.trim() || undefined,
    all: state.scope === 'all',
    files: state.scope === 'files' ? files : undefined,
    storyId: $('#story').value.trim() || undefined,
  }
}

async function run(kind) {
  const output = $('#gate-output')
  const buttons = [$('#run-scan'), $('#run-gate')]
  if (state.scope === 'files' && !scanRequest().files.length) {
    output.innerHTML = errorBox(new Error('Enter at least one file to scan.'), 'No files')
    return
  }
  buttons.forEach((b) => (b.disabled = true))
  output.innerHTML = loading(kind === 'gate' ? 'Running the gate...' : 'Scanning...')
  try {
    const data = await api(`/api/${kind}`, scanRequest())
    state.last = {kind, data}
    state.sources.clear()
    renderResult()
    if (kind === 'gate' && !$('#view-audit').hidden) loadAudit()
  } catch (error) {
    output.innerHTML = errorBox(error)
  } finally {
    buttons.forEach((b) => (b.disabled = false))
  }
}

$('#run-scan').addEventListener('click', () => run('scan'))
$('#run-gate').addEventListener('click', () => run('gate'))

function gauge(score, max) {
  const r = 38
  const c = 2 * Math.PI * r
  const color =
    score === 0
      ? 'var(--pass)'
      : score > max || score > 50
        ? 'var(--fail)'
        : score > 20
          ? 'var(--warning)'
          : 'var(--pass)'
  return `<svg class="gauge" viewBox="0 0 92 92" role="img" aria-label="Risk score ${score} of 100">
    <circle class="track" cx="46" cy="46" r="${r}"/>
    <circle cx="46" cy="46" r="${r}" stroke="${color}" stroke-dasharray="${(c * score) / 100} ${c}" transform="rotate(-90 46 46)"/>
    <text x="46" y="42">${score}</text><text class="sub" x="46" y="62">of 100</text></svg>`
}

function riskLevel(score) {
  if (score === 0) return ['None', 'var(--pass)']
  if (score <= 20) return ['Low', 'var(--pass)']
  if (score <= 50) return ['Medium', 'var(--warning)']
  return ['High', 'var(--fail)']
}

function renderResult() {
  const {kind, data} = state.last
  const r = data.result
  const gate = r.gate
  const verdictClass = gate ? (gate.passed ? 'pass' : 'fail') : 'scan'
  const title = gate ? (gate.passed ? 'Gate passed' : 'Gate failed') : 'Scan complete'
  const total = r.findings.length
  const sub = gate
    ? gate.passed
      ? `No blocking findings. Ready for <code>agentia cicd work submit</code>.`
      : `${gate.blockingCount} blocking finding${gate.blockingCount === 1 ? '' : 's'} (fail on ${esc(gate.failOn)} or higher)` +
        (r.riskScore > gate.maxRiskScore ? `, risk score above the maximum of ${gate.maxRiskScore}` : '') +
        '. Fix them and run the gate again.'
    : `${total} finding${total === 1 ? '' : 's'} in ${r.filesScanned} file${r.filesScanned === 1 ? '' : 's'}. Run the gate to apply the thresholds.`
  const refs =
    r.baseRef === 'none'
      ? `Compared: ${state.scope === 'all' ? 'all files' : 'selected files'} in the working tree`
      : `Compared <code>${esc(r.baseRef)}</code> ${esc(shortSha(r.baseSha))} with <code>${esc(r.headRef)}</code> ${esc(shortSha(r.headSha))} plus uncommitted changes`
  const extra = []
  if (kind === 'gate' && data.auditPath) extra.push('Recorded in the audit log.')
  if (data.auditError) extra.push(`Audit log not written: ${esc(data.auditError)}`)
  if (data.slackNotified) extra.push('Slack notified.')
  const [level, levelColor] = riskLevel(r.riskScore)
  const max = gate?.maxRiskScore ?? 100

  const kpis = SEVERITIES.map(
    (s) =>
      `<div class="card kpi"><div class="kpi-label"><span class="dot ${s}"></span>${SEVERITY_LABEL[s]}</div><div class="kpi-value">${r.counts[s]}</div></div>`,
  ).join('')

  $('#gate-output').innerHTML = `
    <div class="summary">
      <div class="verdict ${verdictClass}">
        <div class="verdict-icon">${gate ? (gate.passed ? icons.check : icons.cross) : icons.scan}</div>
        <div>
          <h2>${title}</h2>
          <p>${sub}</p>
          <div class="refs">${refs}${extra.length ? `<br>${extra.join(' ')}` : ''}</div>
        </div>
      </div>
      <div class="card risk">
        ${gauge(r.riskScore, max)}
        <div>
          <h3>Risk score</h3>
          <div class="risk-level" style="color:${levelColor}">${level}</div>
          <p>Error 10, warning 3, info 1 per finding.${gate ? ` Gate maximum ${gate.maxRiskScore}.` : ''}</p>
        </div>
      </div>
    </div>
    <div class="kpis">${kpis}<div class="card kpi"><div class="kpi-label">Files scanned</div><div class="kpi-value">${r.filesScanned}</div></div></div>
    <div id="findings"></div>
    ${renderFileList(data.files, r.findings)}`
  renderFindings()
}

function renderFileList(files, findings) {
  if (!files.length) return ''
  const counts = new Map()
  for (const f of findings) counts.set(f.file, (counts.get(f.file) ?? 0) + 1)
  const items = files
    .map((file) => {
      const n = counts.get(file) ?? 0
      return `<li><span class="lang ${languageOf(file)}">${languageOf(file)}</span>${esc(file)}<span class="state ${n ? 'bad' : 'ok'}">${n ? `${n} finding${n === 1 ? '' : 's'}` : 'Clean'}</span></li>`
    })
    .join('')
  return `<details class="card"><summary>Scanned files (${files.length})</summary><ul class="files-list">${items}</ul></details>`
}

function renderFindings() {
  const r = state.last.data.result
  const host = $('#findings')
  if (!host) return
  if (r.findings.length === 0) {
    host.innerHTML = `<div class="card clean">${icons.shieldOk}<div><strong>No findings.</strong><br>${
      r.filesScanned
        ? 'Every scanned Apex and LWC file passed all enabled rules.'
        : 'No Apex or LWC files changed compared with the base branch. Try All files to scan the whole project.'
    }</div></div>`
    return
  }
  const q = state.query.toLowerCase()
  const visible = r.findings.filter(
    (f) =>
      state.filters[f.severity] &&
      (!q || [f.ruleId, f.file, f.message, f.suggestion].some((t) => t.toLowerCase().includes(q))),
  )
  const groups = new Map()
  for (const f of visible) {
    if (!groups.has(f.file)) groups.set(f.file, [])
    groups.get(f.file).push(f)
  }
  const filterButtons = SEVERITIES.map(
    (s) =>
      `<button type="button" class="filter" data-sev="${s}" aria-pressed="${state.filters[s]}"><span class="dot ${s}"></span>${SEVERITY_LABEL[s]} ${r.counts[s]}</button>`,
  ).join('')

  const body = [...groups]
    .map(([file, list]) => {
      const [dir, name] = splitPath(file)
      const rows = list
        .map((f) => {
          const index = r.findings.indexOf(f)
          return `<div class="finding" data-index="${index}">
            <button type="button" class="finding-row" aria-expanded="false">
              <span class="sev ${f.severity}">${f.severity}</span>
              <span class="rule">${esc(f.ruleId)}</span>
              <span class="line">Line ${f.line}</span>
              <span>${esc(f.message)}</span>
              ${icons.chev}
            </button>
            <div class="finding-detail" hidden></div>
          </div>`
        })
        .join('')
      return `<div class="card file-group">
        <div class="file-head"><span class="lang ${languageOf(file)}">${languageOf(file)}</span>
          <span class="path" title="${esc(file)}"><span>${esc(dir)}</span><b>${esc(name)}</b></span>
          <span class="count">${list.length} finding${list.length === 1 ? '' : 's'}</span></div>
        ${rows}</div>`
    })
    .join('')

  host.innerHTML = `
    <div class="section-head">
      <h2>Findings</h2>
      <div class="filters">${filterButtons}<input type="text" id="finding-search" placeholder="Filter by rule, file or text" value="${esc(state.query)}"></div>
    </div>
    <div class="view">${body || '<div class="empty"><p>No findings match the filters.</p></div>'}</div>`

  for (const btn of host.querySelectorAll('.filter')) {
    btn.addEventListener('click', () => {
      state.filters[btn.dataset.sev] = !state.filters[btn.dataset.sev]
      renderFindings()
    })
  }
  const search = $('#finding-search')
  search.addEventListener('input', () => {
    state.query = search.value
    const pos = search.selectionStart
    renderFindings()
    const next = $('#finding-search')
    next.focus()
    next.setSelectionRange(pos, pos)
  })
  for (const row of host.querySelectorAll('.finding-row'))
    row.addEventListener('click', () => toggleFinding(row))
}

async function toggleFinding(row) {
  const item = row.parentElement
  const detail = item.querySelector('.finding-detail')
  const open = !item.classList.contains('open')
  item.classList.toggle('open', open)
  row.setAttribute('aria-expanded', String(open))
  detail.hidden = !open
  if (!open || detail.dataset.ready) return
  detail.dataset.ready = '1'
  const f = state.last.data.result.findings[Number(item.dataset.index)]
  detail.innerHTML = `
    <div><h4>Why it matters</h4><p>${inline(f.explanation)}</p></div>
    <div><h4>How to fix</h4><p class="fix">${inline(f.suggestion)}</p></div>
    <div class="code-wrap"><h4 class="code-title">${esc(f.file)}:${f.line}</h4><div class="code-slot">${loading('Loading source...')}</div></div>`
  const slot = detail.querySelector('.code-slot')
  try {
    if (!state.sources.has(f.file)) {
      const src = await api(`/api/source?${query({cwd: cwd(), file: f.file})}`)
      state.sources.set(f.file, src.content.split(/\r?\n/))
    }
    const lines = state.sources.get(f.file)
    const from = Math.max(1, f.line - 4)
    const to = Math.min(lines.length, f.line + 4)
    let html = ''
    for (let n = from; n <= to; n++) {
      html += `<span class="ln${n === f.line ? ' hit' : ''}" data-n="${n}">${esc(lines[n - 1]) || ' '}</span>`
    }
    slot.innerHTML = `<pre class="code">${html}</pre>`
  } catch (error) {
    slot.innerHTML = `<p>${esc(error.message)}</p>`
  }
}

// ---------- brief ----------

function inline(text) {
  const codes = []
  let html = esc(text).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${c}</code>`)
    return `${codes.length - 1}`
  })
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,:;]|$)/g, '$1<em>$2</em>')
  return html.replace(/(\d+)/g, (_, i) => codes[Number(i)])
}

function tableCells(line) {
  const cells = []
  let current = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '\\' && i + 1 < line.length) {
      current += line[++i]
    } else if (ch === '|') {
      cells.push(current.trim())
      current = ''
    } else current += ch
  }
  cells.push(current.trim())
  return cells.slice(1, -1)
}

const LIST_ITEM = /^(\s*)(-|\d+\.) (.*)$/

function renderList(items) {
  const ordered = /\d/.test(items[0].marker)
  let html = ordered ? '<ol>' : '<ul>'
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const children = []
    while (i + 1 < items.length && items[i + 1].indent > item.indent) children.push(items[++i])
    html += `<li>${inline(item.text)}${children.length ? renderList(children) : ''}</li>`
  }
  return html + (ordered ? '</ol>' : '</ul>')
}

/** Renders the Markdown subset that the release brief uses. */
function markdown(text) {
  const lines = text.split(/\r?\n/)
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    let m
    if (!line.trim()) {
      i++
    } else if ((m = /^(#{1,4}) (.*)$/.exec(line))) {
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`)
      i++
    } else if (line.trimStart().startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trimStart().startsWith('|')) rows.push(lines[i++])
      const [head, , ...rest] = rows
      out.push(
        `<table><thead><tr>${tableCells(head)
          .map((c) => `<th>${inline(c)}</th>`)
          .join('')}</tr></thead><tbody>${rest
          .map(
            (r) =>
              `<tr>${tableCells(r)
                .map((c) => `<td>${inline(c)}</td>`)
                .join('')}</tr>`,
          )
          .join('')}</tbody></table>`,
      )
    } else if (LIST_ITEM.test(line)) {
      const items = []
      while (i < lines.length && (m = LIST_ITEM.exec(lines[i]))) {
        items.push({indent: m[1].length, marker: m[2], text: m[3]})
        i++
      }
      out.push(renderList(items))
    } else {
      const para = []
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{1,4} |\s*\|)/.test(lines[i]) &&
        !LIST_ITEM.test(lines[i])
      ) {
        para.push(lines[i++])
      }
      out.push(`<p>${inline(para.join(' '))}</p>`)
    }
  }
  return out.join('\n')
}

async function runBrief() {
  const output = $('#brief-output')
  const story = $('#story').value.trim()
  if (!story) {
    output.innerHTML = errorBox(
      new Error('Enter the user story ID at the top of the page.'),
      'User story needed',
    )
    $('#story').focus()
    return
  }
  const button = $('#run-brief')
  button.disabled = true
  output.innerHTML = loading('Writing the release brief...')
  try {
    const data = await api('/api/brief', {
      cwd: cwd(),
      base: $('#base').value.trim() || undefined,
      storyId: story,
      testResults: $('#test-results').value.trim() || undefined,
      ai: $('#brief-ai').checked,
      attach: $('#brief-attach').checked,
    })
    const g = data.gate
    const attached =
      data.attached === null
        ? ''
        : data.attached
          ? '<span class="result pass">Attached to story</span>'
          : '<span class="result fail">Not attached</span>'
    output.innerHTML = `
      ${data.warnings.length ? `<div class="alert warn"><strong>Warnings</strong>${data.warnings.map(esc).join('<br>')}</div>` : ''}
      <div class="card brief-meta">
        <span class="result ${g.passed ? 'pass' : 'fail'}">${g.passed ? 'Gate passed' : 'Gate failed'}</span>
        <span class="chip muted">Risk ${g.riskScore}/100</span>
        <span class="chip muted">${data.summarySource === 'ai' ? 'AI summary' : 'Template summary'}</span>
        ${attached}
        <span class="path">${esc(data.path)}</span>
        <span class="actions">
          <button class="btn small" type="button" id="brief-copy">Copy Markdown</button>
          <button class="btn small" type="button" id="brief-download">Download .md</button>
        </span>
      </div>
      <article class="card markdown">${markdown(data.markdown)}</article>`
    $('#brief-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(data.markdown)
        toast('Markdown copied')
      } catch {
        toast('Copy is blocked in this browser')
      }
    })
    $('#brief-download').addEventListener('click', () => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([data.markdown], {type: 'text/markdown'}))
      a.download = `${story.replace(/[^A-Za-z0-9._-]/g, '_')}.md`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    })
  } catch (error) {
    output.innerHTML = errorBox(error, 'Could not write the brief')
  } finally {
    button.disabled = false
  }
}

$('#run-brief').addEventListener('click', runBrief)

// ---------- audit ----------

function auditChart(entries, maxRisk, width) {
  const runs = entries.slice(-40)
  const w = Math.max(320, Math.round(width))
  const h = 180
  const pad = {l: 30, r: 8, t: 8, b: 20}
  const iw = w - pad.l - pad.r
  const ih = h - pad.t - pad.b
  const step = iw / Math.max(runs.length, 1)
  const bw = Math.max(3, Math.min(28, step * 0.7))
  const y = (v) => pad.t + ih - (v / 100) * ih
  let svg = ''
  for (const v of [0, 25, 50, 75, 100]) {
    svg += `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pad.l - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`
  }
  runs.forEach((e, i) => {
    const x = pad.l + i * step + (step - bw) / 2
    const top = y(Math.max(e.riskScore, 1))
    svg += `<rect class="bar ${e.result}" x="${x}" y="${top}" width="${bw}" height="${pad.t + ih - top}" rx="2"><title>${esc(
      formatTime(e.timestamp),
    )} | ${esc(e.storyId ?? 'no story')} | risk ${e.riskScore} | ${e.result}</title></rect>`
  })
  if (maxRisk < 100)
    svg += `<line class="limit" x1="${pad.l}" x2="${w - pad.r}" y1="${y(maxRisk)}" y2="${y(maxRisk)}"/>`
  if (runs.length) {
    svg += `<text class="axis" x="${pad.l}" y="${h - 4}">${esc(formatTime(runs[0].timestamp))}</text>`
    svg += `<text class="axis" x="${w - pad.r}" y="${h - 4}" text-anchor="end">${esc(formatTime(runs.at(-1).timestamp))}</text>`
  }
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Risk score per gate run">${svg}</svg>`
}

async function loadAudit() {
  const host = $('#audit-output')
  host.innerHTML = loading('Reading the audit log...')
  try {
    const {path, entries} = await api(`/api/audit?${query({cwd: cwd()})}`)
    if (!entries.length) {
      host.innerHTML = `<div class="empty">${icons.shieldOk}<h2>No gate runs yet</h2><p>Each gate run adds a line to <code>${esc(path)}</code>. Run the gate to start the history.</p></div>`
      return
    }
    const passes = entries.filter((e) => e.result === 'pass').length
    const avg = Math.round(entries.reduce((s, e) => s + e.riskScore, 0) / entries.length)
    const last = entries.at(-1)
    const maxRisk = state.project?.config.thresholds.maxRiskScore ?? 100
    const stat = (label, value, note = '') =>
      `<div class="card kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${note ? `<div class="kpi-note">${note}</div>` : ''}</div>`
    const rows = [...entries]
      .reverse()
      .map(
        (e) => `<tr>
          <td>${esc(formatTime(e.timestamp))}</td>
          <td class="mono">${esc(e.storyId ?? '-')}</td>
          <td>${esc(e.gitUser ?? '-')}</td>
          <td class="mono">${esc(e.baseRef)} <span class="changed">${esc(shortSha(e.baseSha))}..${esc(shortSha(e.headSha))}</span></td>
          <td class="num">${e.filesScanned}</td>
          <td class="num"><span class="sev error">${e.counts.error}</span></td>
          <td class="num"><span class="sev warning">${e.counts.warning}</span></td>
          <td class="num"><span class="sev info">${e.counts.info}</span></td>
          <td class="num"><strong>${e.riskScore}</strong></td>
          <td><span class="result ${e.result}">${e.result === 'pass' ? 'Passed' : 'Failed'}</span></td>
        </tr>`,
      )
      .join('')
    host.innerHTML = `
      <div class="stats">
        ${stat('Gate runs', entries.length)}
        ${stat('Pass rate', `${Math.round((passes / entries.length) * 100)}%`, `${passes} passed, ${entries.length - passes} failed`)}
        ${stat('Average risk', avg)}
        ${stat('Last run', `<span class="result ${last.result}">${last.result === 'pass' ? 'Passed' : 'Failed'}</span>`, esc(formatTime(last.timestamp)))}
      </div>
      <div class="card chart-card">
        <h3>Risk score per gate run</h3>
        <p class="chart-sub">Last ${Math.min(entries.length, 40)} runs, oldest on the left. Hover a bar for details.</p>
        ${auditChart(entries, maxRisk, host.clientWidth - 40)}
        <div class="legend"><span><i class="pass"></i>Passed</span><span><i class="fail"></i>Failed</span>${
          maxRisk < 100 ? `<span><i class="limit"></i>Max risk ${maxRisk}</span>` : ''
        }</div>
      </div>
      <div class="card table-wrap">
        <table class="data">
          <thead><tr><th>When</th><th>Story</th><th>User</th><th>Compared</th><th>Files</th><th>Err</th><th>Warn</th><th>Info</th><th>Risk</th><th>Result</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="changed">Source: <code>${esc(path)}</code></p>`
  } catch (error) {
    host.innerHTML = errorBox(error, 'Could not read the audit log')
  }
}

// ---------- rules ----------

function renderRules() {
  const host = $('#rules-output')
  const project = state.project
  if (!project) {
    host.innerHTML = `<div class="empty"><h2>No project loaded</h2><p>Enter a project folder above and press Load.</p></div>`
    return
  }
  const c = project.config
  const card = (label, value, note) =>
    `<div class="card kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-note">${note}</div></div>`
  const rows = project.rules
    .map(
      (r) => `<tr class="${r.enabled ? '' : 'disabled'}">
        <td class="mono"><strong>${esc(r.id)}</strong></td>
        <td><span class="lang ${r.language}">${r.language}</span></td>
        <td>${esc(r.title)}</td>
        <td><span class="sev ${r.severity}">${r.severity}</span>${r.severity !== r.defaultSeverity ? `<span class="changed">default ${r.defaultSeverity}</span>` : ''}</td>
        <td>${r.enabled ? '<span class="result pass">On</span>' : '<span class="result off">Off</span>'}</td>
      </tr>`,
    )
    .join('')
  host.innerHTML = `
    <div class="config-grid">
      ${card('Base branch', `<code>${esc(c.baseBranch)}</code>`, 'Compared with HEAD')}
      ${card('Fail on', esc(c.thresholds.failOn), 'Severity that blocks the gate')}
      ${card('Max risk score', c.thresholds.maxRiskScore, 'Gate fails above this')}
      ${card('Audit log', c.audit.enabled ? 'On' : 'Off', esc(c.audit.path))}
    </div>
    <div class="card"><div class="kpi-label">Config file</div><div class="kpi-note">${
      project.configPath
        ? `<code>${esc(project.configPath)}</code>`
        : 'No guardian.config.yml; built-in defaults are used.'
    }</div><div class="kpi-label" style="margin-top:10px">Scanned paths</div><div class="kpi-note">Include ${c.include
      .map((p) => `<code>${esc(p)}</code>`)
      .join(' ')}, ignore ${c.ignore.map((p) => `<code>${esc(p)}</code>`).join(' ')}</div></div>
    <div class="card table-wrap">
      <table class="data">
        <thead><tr><th>Rule</th><th>Language</th><th>Detects</th><th>Severity</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="changed">Change severities or switch rules off in <code>guardian.config.yml</code>, then press Load.</p>`
}

// ---------- start ----------

async function start() {
  applyTheme(storage('theme'))
  try {
    const info = await api('/api/info')
    $('#version-chip').textContent = `v${info.tool.version}`
    $('#cwd').value = info.defaultCwd
  } catch (error) {
    $('#gate-output').innerHTML = errorBox(error, 'Could not reach the Guardian server')
    return
  }
  await loadProject()
  const view = storage('view')
  if (view && $(`#view-${view}`)) showView(view)
}

start()
