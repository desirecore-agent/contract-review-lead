import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const source = (path) => readFile(new URL(path, root), 'utf8')
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

const schemaPath = 'skills/coverage-matrix/references/coverage-matrix-bucket-summary.schema.json'
const descriptorPath = 'skills/coverage-matrix/references/coverage-matrix-bucket-summary.descriptor.json'
const pointers = {
  total: '/coverage_matrix/summary/total',
  covered: '/coverage_matrix/summary/covered',
  blank: '/coverage_matrix/summary/blank',
  blocked: '/coverage_matrix/summary/blocked',
  deferred: '/coverage_matrix/summary/deferred',
  notApplicable: '/coverage_matrix/summary/not_applicable',
  rate: '/coverage_matrix/summary/coverage_rate',
  result: '/coverage_matrix/summary/mathcalc_receipt/result',
}

test('Lead pins the coverage-matrix bucket-summary resources for every canonical Intake delegate', async () => {
  const [agentText, schemaText, descriptorText, orchestration] = await Promise.all([
    source('agent.json'), source(schemaPath), source(descriptorPath), source('skills/review-orchestration/SKILL.md'),
  ])
  const agent = JSON.parse(agentText)
  const descriptor = JSON.parse(descriptorText)
  const precondition = agent.delegation_preconditions.find((item) => item.targets.length === 1 && item.targets[0] === 'contract-intake')

  assert.deepEqual(precondition, {
    version: 1,
    targets: ['contract-intake'],
    document_path: 'contract-review/coverage-matrix.yaml',
    format: 'yaml',
    aggregate: {
      skill_id: 'coverage-matrix',
      resource_path: 'references/coverage-matrix-bucket-summary.descriptor.json',
      sha256: sha256(descriptorText),
      schema_path: 'references/coverage-matrix-bucket-summary.schema.json',
      schema_sha256: sha256(schemaText),
    },
  })
  assert.equal(descriptor.profile, 'bucket-summary-v1')
  assert.equal(descriptor.rows_pointer, '/coverage_matrix/rows')
  assert.equal(descriptor.bucket_pointer, '/status')
  assert.deepEqual(descriptor.buckets.map(({ label, value }) => [label, value]), [
    ['covered', 'covered'], ['blank', 'blank'], ['blocked', 'blocked'], ['deferred', 'deferred'], ['not_applicable', 'not_applicable'],
  ])
  assert.match(orchestration, /canonical `contract-intake` 的每一次新 `Delegate`/)
  assert.match(orchestration, /不替代上述真实 `MathCalc` 调用/)
})

test('descriptor closes the five counters and has disjoint zero/nonzero arithmetic groups', async () => {
  const descriptor = JSON.parse(await source(descriptorPath))
  const common = descriptor.assertions
  assert.deepEqual(common.map(({ kind, expected_pointer }) => [kind, expected_pointer]), [
    ['total', pointers.total],
    ['count', pointers.covered], ['count', pointers.blank], ['count', pointers.blocked], ['count', pointers.deferred], ['count', pointers.notApplicable],
    ['count', pointers.total],
  ])
  assert.deepEqual(common.at(-1).buckets, ['covered', 'blank', 'blocked', 'deferred', 'not_applicable'])

  const [zero, positive] = descriptor.assertion_groups
  assert.deepEqual(zero.assertions, [{ kind: 'count', buckets: ['covered', 'blank', 'blocked', 'deferred'], equals: 0 }])
  assert.deepEqual(positive.assertions.slice(0, 4).map(({ buckets, expected_pointer }) => [buckets, expected_pointer]), [
    [['covered'], '/coverage_matrix/summary/mathcalc_receipt/scope/covered'],
    [['blank'], '/coverage_matrix/summary/mathcalc_receipt/scope/blank'],
    [['blocked'], '/coverage_matrix/summary/mathcalc_receipt/scope/blocked'],
    [['deferred'], '/coverage_matrix/summary/mathcalc_receipt/scope/deferred'],
  ])
  assert.deepEqual(positive.assertions.slice(4).map(({ expected_pointer, scale, decimal_places }) => [expected_pointer, scale, decimal_places]), [
    [pointers.rate, 100, 2], [pointers.result, 100, 2],
  ])
})

test('static schema limits zero and nonzero receipt declarations without treating them as tool provenance', async () => {
  const schema = JSON.parse(await source(schemaPath))
  const summary = schema.properties.coverage_matrix.properties.summary
  const [nonzero, zero] = summary.oneOf

  assert.deepEqual(nonzero.properties.coverage_rate, { $ref: '#/definitions/percent' })
  assert.deepEqual(nonzero.properties.coverage_rate_reason, { type: 'null' })
  assert.equal(nonzero.properties.mathcalc_receipt.$ref, '#/definitions/nonzeroReceipt')
  assert.deepEqual(zero.properties.coverage_rate, { type: 'null' })
  assert.deepEqual(zero.properties.coverage_rate_reason, { const: 'NO_RATE_DENOMINATOR' })
  assert.equal(zero.properties.mathcalc_receipt.$ref, '#/definitions/zeroReceipt')
  assert.equal(schema.definitions.nonzeroReceipt.properties.called.const, true)
  assert.equal(schema.definitions.zeroReceipt.properties.called.const, false)
  assert.equal(schema.definitions.zeroReceipt.properties.reason.const, 'NO_RATE_DENOMINATOR')
  assert.match(schema.description, /does not prove catalog membership, a historical MathCalc call/)
})