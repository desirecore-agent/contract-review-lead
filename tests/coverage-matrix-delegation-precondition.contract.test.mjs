import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { readOrchestrationPolicy } from './helpers/orchestration-policy.mjs'

const root = new URL('..', import.meta.url)
const source = (path) => readFile(new URL(path, root), 'utf8')
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

const schemaPath = 'skills/coverage-matrix/references/coverage-matrix-bucket-summary.schema.json'
const descriptorPath = 'skills/coverage-matrix/references/coverage-matrix-bucket-summary.descriptor.json'
const finalCalculationSchemaPath = 'skills/coverage-matrix/references/coverage-matrix-final-calculation.schema.json'
const pointers = {
  total: '/coverage_matrix/summary/total',
  covered: '/coverage_matrix/summary/covered',
  blank: '/coverage_matrix/summary/blank',
  blocked: '/coverage_matrix/summary/blocked',
  deferred: '/coverage_matrix/summary/deferred',
  notApplicable: '/coverage_matrix/summary/not_applicable',
  denominator: '/coverage_matrix/summary/calculation_candidate/denominator',
  rate: '/coverage_matrix/summary/calculation_candidate/expected_coverage_rate',
}

test('Lead pins the coverage-matrix bucket-summary resources for every canonical Intake delegate', async () => {
  const [agentText, schemaText, descriptorText, orchestration] = await Promise.all([
    source('agent.json'), source(schemaPath), source(descriptorPath), readOrchestrationPolicy(root),
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
  assert.match(orchestration, /启动前的矩阵只含内部 pending 候选/)
  assert.match(orchestration, /成功正文末尾的完整 `\{"verified_preconditions"/)
  assert.match(orchestration, /`child_run_id` 只能从该同一次成功 Delegate 的\s*模型可见正文标记 `\[子会话 runId: <真实值>\]` 原样取得/s)
  assert.match(orchestration, /不能读取 metadata/)
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
  assert.deepEqual(zero.assertions, [{ kind: 'count', buckets: ['covered', 'blank', 'blocked', 'deferred'], expected_pointer: pointers.denominator }])
  assert.deepEqual(positive.assertions.slice(0, 4).map(({ buckets, expected_pointer }) => [buckets, expected_pointer]), [
    [['covered'], '/coverage_matrix/summary/calculation_candidate/scope/covered'],
    [['blank'], '/coverage_matrix/summary/calculation_candidate/scope/blank'],
    [['blocked'], '/coverage_matrix/summary/calculation_candidate/scope/blocked'],
    [['deferred'], '/coverage_matrix/summary/calculation_candidate/scope/deferred'],
  ])
  assert.deepEqual(positive.assertions.slice(4, 5), [{ kind: 'count', buckets: ['covered', 'blank', 'blocked', 'deferred'], expected_pointer: pointers.denominator }])
  assert.deepEqual(positive.assertions.slice(5).map(({ expected_pointer, scale, decimal_places }) => [expected_pointer, scale, decimal_places]), [
    [pointers.rate, 100, 2],
  ])
})

test('static schema limits zero and positive candidates without treating them as tool provenance', async () => {
  const schema = JSON.parse(await source(schemaPath))
  const summary = schema.properties.coverage_matrix.properties.summary
  const [positive, zero] = summary.properties.calculation_candidate.oneOf

  assert.equal(positive.$ref, '#/definitions/positiveCandidate')
  assert.equal(zero.$ref, '#/definitions/zeroCandidate')
  assert.equal(schema.definitions.positiveCandidate.properties.status.const, 'pending_trusted_delegate_proof')
  assert.equal(schema.definitions.positiveCandidate.properties.branch.const, 'positive_denominator')
  assert.equal(schema.definitions.positiveCandidate.properties.expected_coverage_rate.$ref, '#/definitions/percent')
  assert.equal(schema.definitions.positiveCandidate.properties.mathcalc_result, undefined)
  assert.equal(schema.definitions.zeroCandidate.properties.status.const, 'pending_trusted_delegate_proof')
  assert.equal(schema.definitions.zeroCandidate.properties.denominator.const, 0)
  assert.equal(schema.definitions.zeroCandidate.properties.coverage_rate.type, 'null')
  assert.match(schema.description, /does not prove catalog membership, a historical MathCalc call, a successful Delegate/)
})

test('trusted proof sidecar preserves deduplicated proofs and proofIndexes without inventing business names', async () => {
  const [schemaText, skill] = await Promise.all([
    source('skills/coverage-matrix/references/coverage-matrix-trusted-proof.schema.json'),
    source('skills/coverage-matrix/SKILL.md'),
  ])
  const schema = JSON.parse(schemaText)
  const proof = schema.definitions.proof
  assert.deepEqual(schema.required, ['schema_version', 'status', 'child_run_id', 'verified_preconditions'])
  assert.deepEqual(schema.definitions.projection.required, ['preconditions', 'proofs'])
  assert.deepEqual(schema.definitions.precondition.required, ['targetAgentId', 'configSha256', 'proofIndexes'])
  assert.deepEqual(proof.required, ['profile', 'document_sha256', 'schema_sha256', 'contract_sha256', 'report_sha256', 'format', 'rows', 'buckets', 'assertions', 'matched_group'])
  assert.deepEqual(schema.definitions.assertion.required, ['kind', 'actual', 'expected'])
  assert.deepEqual(proof.properties.matched_group.type, ['integer', 'null'])
  assert.equal(proof.properties.coverage_rate, undefined)
  assert.equal(proof.properties.expected_pointer, undefined)
  assert.match(skill, /`proofIndexes: \[0\]`、一个 proof/)
  assert.match(skill, /`matched_group` 必须是 0 或 1.*`actual === expected`/s)
  assert.match(skill, /`GenerateUUID`.*`Write` 必须使用\s*`createOnly: true`/s)
  assert.match(skill, /`child_run_id` 只能从\*\*同一次成功 Delegate 的模型可见正文\*\*/)
  assert.match(skill, /\[子会话 runId: <真实值>\]/)
  assert.doesNotMatch(skill, /metadata\.delegate|metadata.*inputProvenance/s)
})

test('final calculation sidecar binds one unchanged matrix to five MathCalc counts and a closed ratio branch', async () => {
  const [schemaText, skill, registration] = await Promise.all([
    source(finalCalculationSchemaPath),
    source('skills/coverage-matrix/SKILL.md'),
    source('skills/review-registration/SKILL.md'),
  ])
  const schema = JSON.parse(schemaText)

  assert.deepEqual(schema.required, ['schema_version', 'status', 'matrix', 'row_transcription', 'mathcalc'])
  assert.deepEqual(schema.definitions.matrixBinding.required, [
    'absolute_path', 'digest_before_read', 'digest_after_read', 'digest_after_calculation', 'row_count',
  ])
  assert.deepEqual(schema.definitions.rowTranscription.required, ['ordinal', 'check_id', 'check_source', 'status', 'flags'])
  assert.deepEqual(schema.definitions.rowFlags.required, ['covered', 'blank', 'blocked', 'deferred', 'not_applicable'])
  assert.deepEqual(schema.definitions.countCalls.required, ['covered', 'blank', 'blocked', 'deferred', 'not_applicable'])
  assert.equal(schema.definitions.countInput.properties.expression.const, 'sum(flags)')
  assert.equal(schema.definitions.denominatorInput.properties.expression.const, 'covered + blank + blocked + deferred')
  assert.equal(schema.definitions.ratioInput.properties.expression.const, 'covered / denominator * 100')
  assert.equal(schema.definitions.ratioInput.properties.format.const, 'fixed')
  assert.equal(schema.definitions.ratioInput.properties.format_decimals.const, 2)
  assert.equal(schema.definitions.calculationSet.oneOf[0].properties.denominator_call.$ref, '#/definitions/positiveDenominatorCall')
  assert.equal(schema.definitions.calculationSet.oneOf[0].properties.ratio.$ref, '#/definitions/positiveRatio')
  assert.equal(schema.definitions.calculationSet.oneOf[1].properties.denominator_call.$ref, '#/definitions/zeroDenominatorCall')
  assert.equal(schema.definitions.calculationSet.oneOf[1].properties.ratio.$ref, '#/definitions/zeroRatio')
  assert.equal(schema.definitions.zeroDenominatorCall.properties.output.properties.text.const, '0')
  assert.equal(schema.definitions.zeroRatio.properties.ratio_call.type, 'null')
  assert.match(schema.description, /does not authenticate the transcription/)
  assert.match(skill, /每行必须恰有一个 1/)
  assert.match(skill, /每次 MathCalc 的\*\*实际输入和原始成功文本\*\*/)
  assert.match(skill, /该转录是\s*可审计的工具输入准备，不是平台对状态语义的认证/s)
  assert.doesNotMatch(registration, /coverage-matrix-final-calculation|MathCalc/)
})
