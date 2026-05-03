#!/usr/bin/env node
/**
 * Sets GitHub native issue `type` (Epic / Story / Task) for benvdbergh/workflows.
 *
 * Rules:
 * - Issues #18–#24 (POC epics): Epic
 * - Issues #25–#57 (POC stories): Story
 * - Issues #1–#17 (roadmap seeds): [EPIC]→Epic, [FEATURE]→Story, [RUNWAY]→Task
 *
 * Usage: node scripts/set-github-issue-types.mjs
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileP = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = 'benvdbergh/workflows'
const TMP = path.join(__dirname, '..', 'tmp', 'migration')

function ghBin() {
  if (process.env.GH_BIN) return process.env.GH_BIN
  if (process.platform === 'win32') return 'C:\\Program Files\\GitHub CLI\\gh.exe'
  return 'gh'
}

async function ghApiPatchIssue(num, bodyObj) {
  const bin = ghBin()
  await fs.mkdir(TMP, { recursive: true })
  const tmp = path.join(TMP, `.type-${num}.json`)
  await fs.writeFile(tmp, JSON.stringify(bodyObj), 'utf8')
  try {
    await execFileP(bin, ['api', '-X', 'PATCH', `repos/${REPO}/issues/${num}`, '--input', tmp], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    })
  } finally {
    await fs.unlink(tmp).catch(() => {})
  }
}

function typeForNumberAndTitle(num, title) {
  if (num >= 18 && num <= 24) return 'Epic'
  if (num >= 25 && num <= 57) return 'Story'
  if (num >= 1 && num <= 17) {
    if (title.startsWith('[EPIC]')) return 'Epic'
    if (title.startsWith('[FEATURE]')) return 'Story'
    if (title.startsWith('[RUNWAY]')) return 'Task'
    return 'Task'
  }
  return null
}

async function setType(num, type) {
  try {
    await ghApiPatchIssue(num, { type })
    console.log(`#${num} → ${type}`)
  } catch (e) {
    console.error(`#${num} → ${type} FAILED: ${e.stderr || e.message}`)
  }
}

const bin = ghBin()
const { stdout } = await execFileP(
  bin,
  ['issue', 'list', '--repo', REPO, '--state', 'all', '--limit', '100', '--json', 'number,title'],
  { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
)
const rows = JSON.parse(stdout || '[]')

for (const row of rows.sort((a, b) => a.number - b.number)) {
  const ty = typeForNumberAndTitle(row.number, row.title)
  if (ty) await setType(row.number, ty)
}

console.log('Done.')
