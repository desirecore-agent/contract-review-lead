import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const leadRoot = fileURLToPath(new URL('..', import.meta.url))
const platformRoot = process.env.DESIRECORE_PLATFORM_SOURCE_ROOT
const intakeRoot = process.env.DESIRECORE_CONTRACT_INTAKE_SOURCE_ROOT
if (!platformRoot) throw new Error('DESIRECORE_PLATFORM_SOURCE_ROOT_REQUIRED')
if (!intakeRoot) throw new Error('DESIRECORE_CONTRACT_INTAKE_SOURCE_ROOT_REQUIRED')

const records = [
  { id: 'coverage-matrix-baseline-init', command: 'runtime.mjs', file: join(leadRoot, 'tools', 'coverage-matrix-baseline-init', 'TOOL.md') },
  { id: 'lead-contract-intake-deterministic-check', command: 's3-s7.mjs', file: join(leadRoot, 'tools', 'contract-intake-deterministic-check', 'TOOL.md') },
  { id: 'intake-contract-intake-deterministic-check', command: 's3-s7.mjs', file: join(intakeRoot, 'tools', 'contract-intake-deterministic-check', 'TOOL.md') },
]

const assertOwnedTempRoot = (candidate) => {
  const temporaryParent = resolve(tmpdir())
  const resolved = resolve(candidate)
  const rel = relative(temporaryParent, resolved)
  assert.equal(dirname(resolved), temporaryParent, `temporary cleanup root is not a direct tmpdir child: ${resolved}`)
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), `temporary cleanup root escaped tmpdir: ${resolved}`)
  assert.match(basename(resolved), /^dc-script-registration-[^\\/]+$/, `unexpected temporary cleanup basename: ${resolved}`)
  return resolved
}

const probeSource = `
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from '@desirecore/shared/utils/frontmatter'
import { validateToolFrontmatter } from '@desirecore/schemas/agent'
import { listAgentTools } from './packages/agent-service/src/agent/reader'
import { buildTypeBoxParameters } from './packages/agent-service/src/runtime/tool-schema-normalizer'

const records = JSON.parse(process.argv[2])
const root = process.env.DESIRECORE_TEST_ROOT
assert.ok(root)
const agentId = 'script-registration-probe'
for (const record of records) {
  const content = readFileSync(record.file, 'utf8')
  const parsed = parseFrontmatter(content)
  const validated = validateToolFrontmatter(parsed.data)
  assert.equal(validated.success, true, JSON.stringify(validated.errors))
  assert.equal(validated.data?.command, record.command)
  assert.equal(validated.data?.script?.runtime, 'node')
  assert.equal(Object.hasOwn(validated.data?.script ?? {}, 'command'), false)
  const directory = join(root, 'agents', agentId, 'tools', record.id)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'TOOL.md'), content)
}
writeFileSync(join(root, 'agents', agentId, 'agent.json'), JSON.stringify({ version: '1.0.0', name: agentId, description: 'registration contract probe' }))
const registered = listAgentTools(agentId)
for (const record of records) {
  const entry = registered.find((tool) => tool.id === record.id)
  assert.ok(entry, 'reader did not register ' + record.id)
  assert.equal(entry.command, record.command)
  assert.equal(entry.script?.runtime, 'node')
}
const initializer = registered.find((tool) => tool.id === 'coverage-matrix-baseline-init')
assert.ok(initializer)
const projected = buildTypeBoxParameters(initializer) as unknown as { properties?: Record<string, unknown> }
const jurisdiction = projected.properties?.jurisdiction as { type?: unknown, description?: unknown, oneOf?: unknown[] } | undefined
assert.equal(jurisdiction?.type, 'object')
assert.ok(String(jurisdiction?.description).includes('Native JSON object'))
assert.ok(String(jurisdiction?.description).includes('never pass JSON-encoded text'))
assert.equal(jurisdiction?.oneOf?.length, 2)
`

test('three snapshot-v1 tools pass actual platform frontmatter validation and reader registration', () => {
  assert.deepEqual(readFileSync(records[1].file), readFileSync(records[2].file), 'Lead and Intake deterministic descriptors must remain byte-identical')
  const testRoot = assertOwnedTempRoot(mkdtempSync(join(tmpdir(), 'dc-script-registration-')))
  const probePath = join(platformRoot, `.tmp-script-registration-${process.pid}-${Date.now()}.mts`)
  let probeCreated = false
  try {
    writeFileSync(probePath, probeSource, { flag: 'wx' })
    probeCreated = true
    const result = spawnSync(process.execPath, [join(platformRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'), probePath, JSON.stringify(records)], {
      cwd: platformRoot,
      env: { ...process.env, DESIRECORE_TEST_ROOT: testRoot },
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true,
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  } finally {
    if (probeCreated) rmSync(probePath, { force: true })
    rmSync(assertOwnedTempRoot(testRoot), { recursive: true, force: true })
  }
})
