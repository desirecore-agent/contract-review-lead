import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const policyFile = 'skills/coverage-matrix/SKILL.md'

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
}

function policyFrom(markdown) {
  const match = markdown.match(/```json\n(\{[\s\S]*?\})\n```/)
  assert.ok(match, 'coverage skill must contain one machine-readable policy JSON block')
  return JSON.parse(match[1])
}

function expectedStatus(facts) {
  // This checks the published deterministic policy contract, not an LLM implementation.
  if (facts.rule_source_unavailable) return 'pre_dispatch_failure'
  if (facts.contract_inapplicable) return 'not_applicable'
  if (facts.scope_missing_material) return 'deferred'
  if (facts.owner_terminal_failure) return 'blocked'
  if (facts.receipt !== 'valid' || !facts.quadruplet || !facts.evidence || facts.human_gate_pending) return 'blank'
  return 'covered'
}

test('coverage policy publishes one catalog, correct precedence, and no INV-001 row', async () => {
  const policy = policyFrom(await source(policyFile))
  const catalogIds = Object.values(policy.catalog).flatMap(({ ids }) => Array.isArray(ids) ? ids : [])
  assert.deepEqual(policy.allowed_statuses, ['covered', 'blank', 'blocked', 'deferred', 'not_applicable'])
  assert.deepEqual(policy.status_precedence, ['not_applicable', 'deferred', 'blocked', 'blank', 'covered'])
  assert.deepEqual(policy.row_identity, ['check_id', 'check_source'])
  assert.equal(new Set(catalogIds).size, catalogIds.length, 'catalog IDs must be unique')
  assert.equal(catalogIds.length, 26, 'fixed catalog portions must retain every intake/base/benchmark/closure item')
  assert.deepEqual(policy.forbidden_row_ids, ['INV-001-MAIN-CONTRACT'])
  assert.match(policy.deferred_requires, /contract-intake receipt SCOPE-\*/) 
  assert.ok(policy.pre_dispatch_failures.includes('RULE_SOURCE_UNAVAILABLE'))
  assert.ok(policy.pre_dispatch_failures.includes('CUSTOM_RULE_SOURCE_REQUIRED'))
})

test('authoritative status fixtures protect precedence over a missing receipt', async () => {
  const fixture = JSON.parse(await source('tests/fixtures/coverage-matrix/status-precedence.json'))
  for (const item of fixture.cases) {
    assert.equal(expectedStatus(item.facts), item.expected, item.name)
  }
})

test('authoritative summary fixtures preserve rows, all five counts, denominator, and zero handling', async () => {
  const fixture = JSON.parse(await source('tests/fixtures/coverage-matrix/summary-cases.json'))
  for (const [name, item] of Object.entries(fixture)) {
    if (item.expected_invalid) {
      assert.ok(item.rows.some((row) => row.check_id === 'INV-001-MAIN-CONTRACT'), `${name}: fixture must exercise forbidden inventory row`)
      continue
    }
    const counts = Object.fromEntries(['covered', 'blank', 'blocked', 'deferred', 'not_applicable'].map((status) => [status, item.rows.filter((value) => value === status).length]))
    assert.equal(item.summary.total, item.rows.length, `${name}: total is rows.length`)
    assert.deepEqual(item.summary, { total: item.rows.length, ...counts }, `${name}: all status counts are retained`)
    assert.equal(item.denominator, counts.covered + counts.blank + counts.blocked + counts.deferred, `${name}: denominator excludes only not_applicable`)
    if (item.denominator === 0) assert.equal(item.expected_rate_reason, 'NO_RATE_DENOMINATOR')
  }
})
