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

test('coverage policy publishes every fixed catalog ID with its authoritative source, correct precedence, and no INV-001 row', async () => {
  const policy = policyFrom(await source(policyFile))
  const fixedCatalog = Object.fromEntries(Object.entries(policy.catalog)
    .filter(([, entry]) => Array.isArray(entry.ids))
    .map(([name, entry]) => [name, { source: entry.source, ids: entry.ids }]))
  assert.deepEqual(policy.allowed_statuses, ['covered', 'blank', 'blocked', 'deferred', 'not_applicable'])
  assert.deepEqual(policy.status_precedence, ['not_applicable', 'deferred', 'blocked', 'blank', 'covered'])
  assert.deepEqual(policy.row_identity, ['check_id', 'check_source'])
  assert.deepEqual(fixedCatalog, {
    intake: { source: 'review-orchestration#O1 intake_gate_coverage', ids: ['CHK-INTAKE-S1-SCOPE', 'CHK-INTAKE-S2-MASTER-VERSION', 'CHK-INTAKE-S3-PAGE-RANGE', 'CHK-INTAKE-S4-ATTACHMENT-MANIFEST', 'CHK-INTAKE-S5-EXECUTION-STATUS', 'CHK-INTAKE-S6-PLACEHOLDER', 'CHK-INTAKE-S7-PARTY-AND-AMOUNT', 'CHK-INTAKE-S8-VERSION-MATRIX'] },
    missing_clauses: { source: 'base/missing-clauses.yaml', ids: ['liability-cap', 'breach-remedy', 'grace-period', 'termination-convenience', 'subcontracting', 'audit-right', 'dispute-resolution', 'force-majeure', 'data-export'] },
    market_benchmarks: { source: 'base/market-benchmarks.yaml', ids: ['liability-cap-months', 'renewal-notice-days', 'non-compete-years', 'data-export-window-days'] },
    closure: { source: 'blueprint#section-15', ids: ['CLOSURE-COMPLETENESS', 'CLOSURE-CONSISTENCY', 'CLOSURE-BLOCKING-RISK', 'CLOSURE-SUBSTANTIVE-TERMS', 'CLOSURE-DOCUMENT'] },
  })
  const fixedIds = Object.values(fixedCatalog).flatMap(({ ids }) => ids)
  assert.equal(new Set(fixedIds).size, 26, 'all 26 fixed IDs must be unique')
  assert.deepEqual(policy.jurisdiction_context, {
    resolved: 'one candidate_basis with an already-read pinned supported pack; generate each applicable jurisdiction rule row',
    clarification_required: 'undetermined or conflicting review-context; generate no jurisdiction rule row, preserve typed pending, and do not treat it as a source failure',
  })
  assert.deepEqual(policy.catalog.jurisdiction, { source: '<resolved-jurisdiction>/rules.yaml', ids: 'each applicable rule id after successful resolved preflight; none in clarification_required mode' })
  assert.deepEqual(policy.catalog.custom, { source: 'custom/rules.yaml', ids: 'each loaded rule id; optional-absent emits only CUSTOM-LAYER-ABSENT' })
  assert.deepEqual(policy.forbidden_row_ids, ['INV-001-MAIN-CONTRACT'])
  assert.match(policy.deferred_requires, /contract-intake receipt SCOPE-\*/) 
  assert.ok(policy.pre_dispatch_failures.includes('RULE_SOURCE_UNAVAILABLE'))
  assert.ok(policy.pre_dispatch_failures.includes('CUSTOM_RULE_SOURCE_REQUIRED'))
  assert.deepEqual(policy.mathcalc, {
    expression: 'covered / (covered + blank + blocked + deferred) * 100',
    scope_keys: ['covered', 'blank', 'blocked', 'deferred'],
    zero_denominator: { coverage_rate: null, coverage_rate_reason: 'NO_RATE_DENOMINATOR', mathcalc_receipt: { called: false, reason: 'NO_RATE_DENOMINATOR' } },
  })
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
    if (item.denominator === 0) assert.deepEqual(item.expected_zero_denominator, {
      coverage_rate: null,
      coverage_rate_reason: 'NO_RATE_DENOMINATOR',
      mathcalc_receipt: { called: false, reason: 'NO_RATE_DENOMINATOR' },
    }, `${name}: zero denominator records a no-call receipt`)
  }
})
