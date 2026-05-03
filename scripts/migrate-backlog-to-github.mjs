#!/usr/bin/env node
/**
 * Backlog migration: legacy per-epic/per-story markdown -> GitHub issues (canonical bodies).
 *
 * Prerequisites: gh authenticated (`gh auth login` or GH_TOKEN).
 *
 * Usage:
 *   node scripts/migrate-backlog-to-github.mjs map       # resolve issue numbers by title -> tmp/migration/mapping.json
 *   node scripts/migrate-backlog-to-github.mjs render   # write tmp/migration/bodies/<id>.md (needs mapping.json)
 *   node scripts/migrate-backlog-to-github.mjs apply    # snapshot, edit/create, sub-issues, deps, project fields, comment
 *   node scripts/migrate-backlog-to-github.mjs all      # map -> render -> apply
 *   node scripts/migrate-backlog-to-github.mjs local-map # mapping.json with to_create only (no gh; then render)
 *
 * Env:
 *   GH_BIN          path to gh executable (default: gh on PATH, or Windows Program Files path)
 *   MIGRATION_DATE  ISO date for sentinel (default: today UTC)
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const execFileP = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const TMP = path.join(REPO_ROOT, 'tmp', 'migration')
const EPICS_DIR = path.join(REPO_ROOT, 'docs', 'epics')
const STORIES_DIR = path.join(REPO_ROOT, 'docs', 'stories')
const REPO = 'benvdbergh/workflows'
/** For Project #4 field sync via `gh project item-edit` (IDs from `gh project field-list 4 --owner benvdbergh`). */
const PROJECT_NUMBER = 4
const BLOB_BASE = 'https://github.com/benvdbergh/workflows/blob/master'

const DEFAULT_WIN_GH = 'C:\\Program Files\\GitHub CLI\\gh.exe'

function ghBin() {
  if (process.env.GH_BIN) return process.env.GH_BIN
  if (process.platform === 'win32') return DEFAULT_WIN_GH
  return 'gh'
}

const MIGRATION_DATE = process.env.MIGRATION_DATE || new Date().toISOString().slice(0, 10)

/** GitHub milestone titles (must exist on repo). POC / alpha delivery items use Future Prospects per operating model seeds. */
const EPIC_MILESTONE = {
  'EPIC-1': 'Future Prospects',
  'EPIC-2': 'Future Prospects',
  'EPIC-3': 'Future Prospects',
  'EPIC-4': 'Future Prospects',
  'EPIC-5': 'Future Prospects',
  'EPIC-6': 'Future Prospects',
  'EPIC-7': 'Future Prospects',
}

async function gh(argv) {
  const bin = ghBin()
  try {
    const { stdout, stderr } = await execFileP(bin, argv, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    if (stderr) process.stderr.write(stderr)
    return stdout.trim()
  } catch (e) {
    e.message += `\n  (gh ${argv.join(' ')})`
    throw e
  }
}

/** Pass full gh args including trailing `--json fields` for JSON stdout. */
async function ghJson(argv) {
  const out = await gh(argv)
  return JSON.parse(out || '[]')
}

/** POST JSON so numeric fields are integers. Uses a temp file (Windows stdin from `input` can break JSON parsing on `gh api`). */
async function ghApiPostJson(route, bodyObj) {
  const bin = ghBin()
  await fs.mkdir(TMP, { recursive: true })
  const tmp = path.join(TMP, `.gh-body-${process.pid}-${Date.now()}.json`)
  await fs.writeFile(tmp, JSON.stringify(bodyObj), 'utf8')
  try {
    const { stdout, stderr } = await execFileP(bin, ['api', '-X', 'POST', route, '--input', tmp], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    if (stderr) process.stderr.write(stderr)
    return stdout.trim()
  } finally {
    await fs.unlink(tmp).catch(() => {})
  }
}

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) throw new Error('missing frontmatter')
  const data = YAML.parse(m[1])
  const body = content.slice(m[0].length).trimStart()
  return { data, body }
}

function extractSection(md, heading) {
  const lines = md.split(/\r?\n/)
  const h = `## ${heading}`
  let i = lines.findIndex((l) => l.trim() === h)
  if (i === -1) return ''
  const out = []
  for (let j = i + 1; j < lines.length; j++) {
    if (/^## /.test(lines[j])) break
    out.push(lines[j])
  }
  return out.join('\n').trim()
}

function firstParaFromDescription(md) {
  const desc = extractSection(md, 'Description')
  if (!desc) return ''
  const block = desc.split(/\n\n+/).find((x) => x.trim() && !x.trim().startsWith('#'))
  return block ? block.replace(/\s+/g, ' ').trim() : ''
}

function blobUrl(repoPath, anchor) {
  const u = `${BLOB_BASE}/${repoPath.replace(/^\/+/, '')}`
  return anchor ? `${u}#${anchor.replace(/^#/, '')}` : u
}

function resolveRepoPath(link, fromFile) {
  if (/^https?:\/\//i.test(link) || link.startsWith('#') || link.startsWith('mailto:')) return null
  const clean = link.split('#')[0]
  const anchor = link.includes('#') ? link.slice(link.indexOf('#') + 1) : ''
  const base = path.dirname(fromFile)
  const abs = path.normalize(path.join(base, clean))
  const rel = path.relative(REPO_ROOT, abs).replace(/\\/g, '/')
  if (rel.startsWith('..')) return null
  return { path: rel, anchor }
}

function rewriteMarkdownLinks(md, fromFile) {
  return md.replace(/\]\(([^)]+)\)/g, (full, inner) => {
    const resolved = resolveRepoPath(inner.trim(), fromFile)
    if (!resolved) return full
    return `](${blobUrl(resolved.path, resolved.anchor)})`
  })
}

function tracesToBullets(tracesTo, idToIssue) {
  if (!Array.isArray(tracesTo)) return []
  const lines = []
  for (const t of tracesTo) {
    if (typeof t === 'string') continue
    const p = t.path
    const a = t.anchor ? String(t.anchor).replace(/^#/, '') : ''
    const url = blobUrl(p, a)
    lines.push(`- [${p}](${url})`)
  }
  return lines
}

/** Pull doc paths from narrative; ignore paths embedded in GitHub blob URLs or markdown links. */
function extractDocLinksFromText(text) {
  const scrubbed = text
    .replace(/https:\/\/github\.com\/[^)\s`]+/gi, ' ')
    .replace(/\[([^\]]*)\]\([^)]+\)/g, ' $1 ')
  const found = new Set()
  const re = /\b(docs\/[A-Za-z0-9_./-]+\.md)(?:#([\w-]+))?|\b(ROADMAP\.md)(?:#([\w-]+))?/gi
  let m
  while ((m = re.exec(scrubbed)) !== null) {
    const p = m[1] || m[3]
    const h = m[2] || m[4] || ''
    if (p) found.add(blobUrl(p, h))
  }
  return [...found].sort()
}

function investLines(inv) {
  if (!inv || typeof inv !== 'object') return []
  return Object.entries(inv).map(([k, v]) => `${k}: ${v}`)
}

function idListToIssueLinks(ids, idToIssue, kind) {
  return ids.map((id) => {
    const num = idToIssue[id]
    if (num) return `- **${id}** → blocked by native relationship to [#${num}](https://github.com/${REPO}/issues/${num})`
    return `- **${id}** → [#${id}](https://github.com/${REPO}/issues?q=is%3Aissue+${encodeURIComponent(id)}) (resolve issue number after migration)`
  })
}

function renderBody({ file, data, bodyMd, idToIssue, isEpic }) {
  const id = data.id
  const fromFile = file
  const summary = firstParaFromDescription(bodyMd)
  const userStory = !isEpic ? extractSection(bodyMd, 'User story') : ''
  const criteria = Array.isArray(data.acceptance_criteria)
    ? data.acceptance_criteria.map((c) => `- ${c}`)
    : []
  const scopeHeading = isEpic ? 'Objectives' : 'Technical notes'
  const scopeRaw = extractSection(bodyMd, scopeHeading)
  const scope = rewriteMarkdownLinks(scopeRaw, fromFile)
  const depNarrative = extractSection(bodyMd, 'Dependencies (narrative)')
  const depsNarrative = rewriteMarkdownLinks(depNarrative, fromFile)

  const dependsIds = Array.isArray(data.depends_on) ? data.depends_on : []
  const depsBody = [
    'Native **blocked-by** relationships should mirror the following frontmatter IDs:',
    ...idListToIssueLinks(dependsIds, idToIssue, data.kind),
  ]
  if (depsNarrative) {
    depsBody.push('', '### Narrative', depsNarrative)
  }

  const traceBullets = tracesToBullets(data.traces_to, idToIssue)
  const traceUrls = new Set(
    traceBullets.map((b) => {
      const m = b.match(/\]\(([^)]+)\)/)
      return m ? m[1] : ''
    }),
  )
  const narrativeExtra = extractDocLinksFromText(bodyMd)
  const extraBullets = narrativeExtra
    .filter((u) => u && !traceUrls.has(u))
    .map((u) => `- Related: [docs link](${u})`)

  const statusLines = [
    `- **status:** ${data.status ?? ''}`,
    `- **priority:** ${data.priority ?? ''}`,
    `- **created:** ${data.created ?? ''}`,
    `- **updated:** ${data.updated ?? ''}`,
    `- **slice:** ${data.slice ?? ''}`,
    `- **invest_check:** ${investLines(data.invest_check).join('; ')}`,
  ]

  const baseName = path.basename(file)
  const migrationNote = `Migrated from ${baseName} (former ${isEpic ? 'epic' : 'story'} markdown under docs, removed ${MIGRATION_DATE}). Body is now canonical.`

  const parts = [
    '## Summary',
    summary || `_${data.title}_`,
    '',
  ]
  if (userStory) {
    parts.push('## User story', userStory, '')
  }
  parts.push(
    '## Acceptance criteria',
    ...criteria,
    '',
    '## Scope and approach',
    scope || '_(see legacy file if empty)_',
    '',
    '## Dependencies',
    ...depsBody,
    '',
    '## Traceability',
    ...traceBullets,
    ...extraBullets,
    '',
    '## Status snapshot at migration',
    ...statusLines,
    '',
    '## Migration note',
    migrationNote,
    '',
  )
  return parts.join('\n')
}

async function loadAllItems() {
  const epicFiles = (await fs.readdir(EPICS_DIR))
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(EPICS_DIR, f))
  const storyFiles = (await fs.readdir(STORIES_DIR))
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(STORIES_DIR, f))

  const epics = []
  for (const file of epicFiles) {
    const content = await fs.readFile(file, 'utf8')
    const { data, body } = parseFrontmatter(content)
    epics.push({ file, data, body, isEpic: true })
  }
  epics.sort((a, b) => a.data.id.localeCompare(b.data.id, undefined, { numeric: true }))

  const stories = []
  for (const file of storyFiles) {
    const content = await fs.readFile(file, 'utf8')
    const { data, body } = parseFrontmatter(content)
    stories.push({ file, data, body, isEpic: false })
  }
  stories.sort((a, b) => a.data.id.localeCompare(b.data.id, undefined, { numeric: true }))

  return { epics, stories }
}

async function resolveIssueByTitle(title) {
  const q = `in:title "${title.replace(/"/g, '\\"')}" repo:${REPO}`
  const rows = await ghJson([
    'issue',
    'list',
    '--repo',
    REPO,
    '--state',
    'all',
    '--limit',
    '30',
    '--search',
    q,
    '--json',
    'number,title,state',
  ])
  const exact = rows.filter((r) => r.title === title)
  return exact
}

/** Offline: write tmp/migration/mapping.json with issue_number null (for inspecting bodies via render). */
async function cmdLocalMap() {
  await fs.mkdir(TMP, { recursive: true })
  const { epics, stories } = await loadAllItems()
  const mapping = { generated: new Date().toISOString(), items: [], note: 'local-map: run `map` before apply' }
  for (const row of [...epics, ...stories]) {
    mapping.items.push({
      id: row.data.id,
      kind: row.data.kind,
      source: path.relative(REPO_ROOT, row.file).replace(/\\/g, '/'),
      title: row.data.title,
      status: row.data.status,
      parent: row.data.parent ?? '',
      depends_on: row.data.depends_on ?? [],
      issue_number: null,
      to_create: true,
      ambiguous_matches: null,
    })
  }
  await fs.writeFile(path.join(TMP, 'mapping.json'), JSON.stringify(mapping, null, 2), 'utf8')
  console.log(`Wrote ${path.join(TMP, 'mapping.json')} (${mapping.items.length} items, no GitHub resolution)`)
}

async function cmdMap() {
  await fs.mkdir(TMP, { recursive: true })
  const { epics, stories } = await loadAllItems()
  const mapping = { generated: new Date().toISOString(), items: [] }

  for (const row of [...epics, ...stories]) {
    const title = row.data.title
    const matches = await resolveIssueByTitle(title)
    let issue_number = null
    let to_create = true
    let ambiguous = null
    if (matches.length === 1) {
      issue_number = matches[0].number
      to_create = false
    } else if (matches.length > 1) {
      ambiguous = matches.map((m) => m.number)
    }

    mapping.items.push({
      id: row.data.id,
      kind: row.data.kind,
      source: path.relative(REPO_ROOT, row.file).replace(/\\/g, '/'),
      title,
      status: row.data.status,
      parent: row.data.parent ?? '',
      depends_on: row.data.depends_on ?? [],
      issue_number,
      to_create,
      ambiguous_matches: ambiguous,
    })
  }

  const bad = mapping.items.filter((x) => x.ambiguous_matches)
  if (bad.length) {
    console.error('Ambiguous title matches — resolve manually before apply:', JSON.stringify(bad, null, 2))
    process.exitCode = 1
  }

  await fs.writeFile(path.join(TMP, 'mapping.json'), JSON.stringify(mapping, null, 2), 'utf8')
  console.log(`Wrote ${path.join(TMP, 'mapping.json')} (${mapping.items.length} items)`)
}

function buildIdToIssue(mapping) {
  const idToIssue = {}
  for (const it of mapping.items) {
    if (it.issue_number) idToIssue[it.id] = it.issue_number
  }
  return idToIssue
}

async function cmdRender() {
  const mapPath = path.join(TMP, 'mapping.json')
  const raw = await fs.readFile(mapPath, 'utf8')
  const mapping = JSON.parse(raw)
  const idToIssue = buildIdToIssue(mapping)

  const { epics, stories } = await loadAllItems()
  const bodiesDir = path.join(TMP, 'bodies')
  await fs.mkdir(bodiesDir, { recursive: true })

  for (const row of [...epics, ...stories]) {
    const md = renderBody({
      file: row.file,
      data: row.data,
      bodyMd: row.body,
      idToIssue,
      isEpic: row.isEpic,
    })
    await fs.writeFile(path.join(bodiesDir, `${row.data.id}.md`), md, 'utf8')
  }
  console.log(`Rendered ${epics.length + stories.length} bodies to ${bodiesDir}`)
}

async function getIssueDbId(num) {
  const out = await gh(['api', `repos/${REPO}/issues/${num}`, '--jq', '.id'])
  return Number(out.trim())
}

async function addSubIssue(parentNum, childNum) {
  const subId = await getIssueDbId(childNum)
  await ghApiPostJson(`repos/${REPO}/issues/${parentNum}/sub_issues`, { sub_issue_id: subId })
}

/** `blockedIssueNum` is the dependent issue; `blockingIssueNum` is the blocker (satisfies depends_on). */
async function addBlockedBy(blockedIssueNum, blockingIssueNum) {
  const blockingDbId = await getIssueDbId(blockingIssueNum)
  await ghApiPostJson(`repos/${REPO}/issues/${blockedIssueNum}/dependencies/blocked_by`, {
    issue_id: blockingDbId,
  })
}

async function tryAddBlockedBy(blockedNum, blockingNum) {
  try {
    await addBlockedBy(blockedNum, blockingNum)
  } catch (e) {
    console.warn(`blocked-by ${blockedNum} <- ${blockingNum} failed (set in UI or update script): ${e.message}`)
  }
}

async function snapshotIssue(num) {
  const snapDir = path.join(TMP, 'snapshots')
  await fs.mkdir(snapDir, { recursive: true })
  const out = await gh(['issue', 'view', String(num), '--repo', REPO, '--json', 'body'])
  const body = JSON.parse(out).body
  await fs.writeFile(path.join(snapDir, `${num}.before.md`), body ?? '', 'utf8')
}

async function postMigrationComment(num) {
  const line = `Migration: body replaced from legacy markdown (${MIGRATION_DATE}). Sentinel is in the issue description.`
  await gh(['issue', 'comment', String(num), '--repo', REPO, '--body', line])
}

async function cmdApply() {
  const mapPath = path.join(TMP, 'mapping.json')
  const mapping = JSON.parse(await fs.readFile(mapPath, 'utf8'))
  const bodiesDir = path.join(TMP, 'bodies')
  const logPath = path.join(TMP, 'log.md')
  await fs.mkdir(TMP, { recursive: true })
  let log = await fs.readFile(logPath, 'utf8').catch(() => '# migration log\n\n')

  const { epics, stories } = await loadAllItems()
  const byId = Object.fromEntries(mapping.items.map((x) => [x.id, x]))

  async function ensureIssue(row) {
    const m = byId[row.data.id]
    const bodyFile = path.join(bodiesDir, `${row.data.id}.md`)
    const title = row.data.title
    const label = row.isEpic ? 'type:epic' : 'type:feature'
    const milestone = row.isEpic ? EPIC_MILESTONE[row.data.id] : EPIC_MILESTONE[row.data.parent]

    if (m.issue_number) {
      await snapshotIssue(m.issue_number)
      await gh(['issue', 'edit', String(m.issue_number), '--repo', REPO, '--body-file', bodyFile])
      await gh(['issue', 'edit', String(m.issue_number), '--repo', REPO, '--add-label', label]).catch(() => {})
      if (milestone) {
        await gh(['issue', 'edit', String(m.issue_number), '--repo', REPO, '--milestone', milestone]).catch(() => {})
      }
      return m.issue_number
    }

    const args = [
      'issue',
      'create',
      '--repo',
      REPO,
      '--title',
      title,
      '--body-file',
      bodyFile,
      '--label',
      label,
    ]
    if (milestone) args.push('--milestone', milestone)
    const out = await gh(args)
    const created = out.match(/issues\/(\d+)/)
    const num = created ? Number(created[1]) : null
    if (!num) throw new Error(`could not parse issue number from: ${out}`)
    m.issue_number = num
    m.to_create = false
    return num
  }

  for (const row of epics) {
    const num = await ensureIssue(row)
    log += `- ${row.data.id} -> #${num} epic OK\n`
    console.log(`${row.data.id} -> #${num}`)
  }

  for (const row of stories) {
    const num = await ensureIssue(row)
    const parentId = row.data.parent
    const parentNum = byId[parentId]?.issue_number
    if (parentNum) {
      try {
        await addSubIssue(parentNum, num)
      } catch (e) {
        console.warn(`sub-issue ${parentNum} -> ${num}: ${e.message}`)
      }
    }
    log += `- ${row.data.id} -> #${num} story parent=#${parentNum ?? '?'}\n`
    console.log(`${row.data.id} -> #${num}`)
  }

  const blockedPairs = new Set()
  for (const row of [...epics, ...stories]) {
    const m = byId[row.data.id]
    const selfNum = m.issue_number
    const deps = row.data.depends_on ?? []
    for (const depId of deps) {
      const blocker = byId[depId]?.issue_number
      if (!blocker || !selfNum) continue
      const key = `${selfNum}<-${blocker}`
      if (blockedPairs.has(key)) continue
      blockedPairs.add(key)
      await tryAddBlockedBy(selfNum, blocker)
    }
  }

  const idToIssueFull = buildIdToIssue(mapping)
  for (const row of [...epics, ...stories]) {
    const md = renderBody({
      file: row.file,
      data: row.data,
      bodyMd: row.body,
      idToIssue: idToIssueFull,
      isEpic: row.isEpic,
    })
    const bf = path.join(bodiesDir, `${row.data.id}.md`)
    await fs.writeFile(bf, md, 'utf8')
    const num = byId[row.data.id].issue_number
    await gh(['issue', 'edit', String(num), '--repo', REPO, '--body-file', bf])
  }

  for (const row of [...epics, ...stories]) {
    const num = byId[row.data.id].issue_number
    try {
      await postMigrationComment(num)
    } catch (e) {
      console.warn(`comment #${num}: ${e.message}`)
    }
  }

  await fs.writeFile(mapPath, JSON.stringify(mapping, null, 2), 'utf8')
  await fs.writeFile(logPath, log, 'utf8')
  console.log(
    `Apply phase done. Sync Project #${PROJECT_NUMBER} fields (Type, Release, Horizon, Commitment, Runway, Area, Blocked) via UI or \`gh project item-edit\` if needed.`,
  )
}

/** Re-run only sub-issue parent links and blocked-by deps (e.g. after fixing JSON POST). Idempotent where API allows. */
async function cmdWire() {
  const mapPath = path.join(TMP, 'mapping.json')
  const mapping = JSON.parse(await fs.readFile(mapPath, 'utf8'))
  const { epics, stories } = await loadAllItems()
  const byId = Object.fromEntries(mapping.items.map((x) => [x.id, x]))

  for (const row of stories) {
    const m = byId[row.data.id]
    const parentNum = byId[row.data.parent]?.issue_number
    if (!parentNum || !m?.issue_number) continue
    try {
      await addSubIssue(parentNum, m.issue_number)
      console.log(`sub-issue OK #${parentNum} -> #${m.issue_number}`)
    } catch (e) {
      console.warn(`sub-issue #${parentNum} -> #${m.issue_number}: ${e.message}`)
    }
  }

  const blockedPairs = new Set()
  for (const row of [...epics, ...stories]) {
    const m = byId[row.data.id]
    const selfNum = m.issue_number
    const deps = row.data.depends_on ?? []
    for (const depId of deps) {
      const blocker = byId[depId]?.issue_number
      if (!blocker || !selfNum) continue
      const key = `${selfNum}<-${blocker}`
      if (blockedPairs.has(key)) continue
      blockedPairs.add(key)
      await tryAddBlockedBy(selfNum, blocker)
    }
  }
  console.log('wire: sub-issues and blocked-by pass complete')
}

const cmd = process.argv[2] || 'help'
try {
  if (cmd === 'map') await cmdMap()
  else if (cmd === 'local-map') await cmdLocalMap()
  else if (cmd === 'render') await cmdRender()
  else if (cmd === 'apply') await cmdApply()
  else if (cmd === 'wire') await cmdWire()
  else if (cmd === 'all') {
    await cmdMap()
    if (process.exitCode) process.exit(process.exitCode)
    await cmdRender()
    await cmdApply()
  } else {
    console.log(`Commands: local-map | map | render | apply | wire | all`)
  }
} catch (e) {
  console.error(e)
  process.exit(1)
}
