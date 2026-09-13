import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { execFileSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import { parseDocument } from 'yaml'

const root = fileURLToPath(new URL('..', import.meta.url))
const runtime = await import(new URL('../tools/coverage-matrix-baseline-init/runtime.mjs', import.meta.url))
const catalogBytes = await readFile(new URL('../skills/coverage-matrix/references/coverage-matrix-baseline.catalog.json', import.meta.url))
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const snapshot = (bytes, index = 0) => ({ param: 'catalog_paths', index, sha256: hash(bytes), size: bytes.length, encoding: 'base64', content: bytes.toString('base64') })
const catalog = JSON.parse(catalogBytes)
const teamCommit = '8013a3a39aa20f6299f5007828e02facd95b257c'
const teamRoot = process.env.DESIRECORE_CONTRACT_TEAM_SOURCE_ROOT
if (!teamRoot) throw new Error('DESIRECORE_CONTRACT_TEAM_SOURCE_ROOT_REQUIRED')
const teamBlob = (path) => Buffer.from(execFileSync('git', ['-C', resolve(teamRoot), 'show', `${teamCommit}:${path}`]))
const releasedInputs = async (jurisdictionPath) => {
  const paths = [
    'shared/resources/jurisdiction-packs/base/missing-clauses.yaml',
    'shared/resources/jurisdiction-packs/base/market-benchmarks.yaml',
    'shared/resources/jurisdiction-packs/custom/pack.yaml',
    'shared/resources/jurisdiction-packs/custom/redlines.yaml',
  ]
  if (jurisdictionPath) paths.push(jurisdictionPath)
  return [snapshot(catalogBytes, 0), ...paths.map((path, index) => snapshot(teamBlob(path), index + 1))]
}
const releasedCustom = () => ({ mode: 'loaded_zero_enabled', pack_sha256: catalog.sources.custom_pack.sha256, redlines_sha256: catalog.sources.custom_redlines.sha256 })
const releasedEnvelope = async (jurisdiction) => ({ protocol: 'desirecore.script.snapshot.v1', params: { case_id: 'case-12345678-1234-4234-8234-123456789abc', generated_at: '2026-09-13T08:00:00Z', jurisdiction, custom: releasedCustom() }, inputs: await releasedInputs(jurisdiction.mode === 'resolved' ? 'shared/resources/jurisdiction-packs/jurisdiction-cn/rules.yaml' : null) })
const testCatalogBytes = () => {
  const copy = structuredClone(catalog)
  for (const [name, source] of Object.entries(copy.sources)) source.sha256 = hash(Buffer.from(`released-source-${name}`))
  return Buffer.from(JSON.stringify(copy))
}
const baselineInputs = () => {
  const released = JSON.parse(testCatalogBytes())
  return [snapshot(testCatalogBytes(), 0), ...Object.entries(released.sources).map(([name], index) => snapshot(Buffer.from(`released-source-${name}`), index + 1))]
}
const custom = (released = JSON.parse(testCatalogBytes())) => ({ mode: 'loaded_zero_enabled', pack_sha256: released.sources.custom_pack.sha256, redlines_sha256: released.sources.custom_redlines.sha256 })
const envelope = (jurisdiction) => ({ protocol: 'desirecore.script.snapshot.v1', params: { case_id: 'case-12345678-1234-4234-8234-123456789abc', generated_at: '2026-09-13T08:00:00Z', jurisdiction, custom: custom() }, inputs: baselineInputs() })

test('baseline emits all fixed blank rows and closed positive candidate', () => {
  const output = runtime.evaluate(envelope({ mode: 'clarification_required', pending_codes: ['PEND-JURISDICTION'] }), { expectedCatalogHash: hash(testCatalogBytes()) })
  const matrix = output.coverage_matrix
  assert.equal(matrix.rows.length, 26)
  assert.equal(matrix.summary.total, 26)
  assert.equal(matrix.summary.blank, 26)
  assert.equal(matrix.summary.not_applicable, 0)
  assert.equal(matrix.summary.calculation_candidate.expected_coverage_rate, '0.00%')
  assert.deepEqual(matrix.rule_sources.jurisdiction, { mode: 'clarification_required', path: null, version: null, pending_codes: ['PEND-JURISDICTION'] })
})

test('row-summary zero denominator remains a pending null-rate candidate', () => {
  assert.deepEqual(runtime.summarizeRows([]), {
    total: 0, covered: 0, blank: 0, blocked: 0, deferred: 0, not_applicable: 0,
    calculation_candidate: { status: 'pending_trusted_delegate_proof', branch: 'zero_denominator', denominator: 0, coverage_rate: null, coverage_rate_reason: 'NO_RATE_DENOMINATOR' },
  })
})

test('released Team 8013 snapshots use the fixed default catalog and execute through the CLI', async () => {
  const unresolvedInput = await releasedEnvelope({ mode: 'clarification_required', pending_codes: ['PEND-JURISDICTION'] })
  const unresolved = runtime.evaluate(unresolvedInput)
  assert.equal(catalog.source_commit, teamCommit)
  assert.equal(unresolved.coverage_matrix.rows.length, 26)
  assert.equal(unresolved.coverage_matrix.summary.total, 26)
  const cnRules = teamBlob('shared/resources/jurisdiction-packs/jurisdiction-cn/rules.yaml')
  const resolved = runtime.evaluate(await releasedEnvelope({ mode: 'resolved', rules_path: '/team/shared/resources/jurisdiction-packs/jurisdiction-cn/rules.yaml', rules_sha256: hash(cnRules), pack_version: '1.0.0' }))
  assert.equal(resolved.coverage_matrix.rows.length, 50)
  assert.equal(resolved.coverage_matrix.summary.blank, 50)
  assert.equal(resolved.coverage_matrix.rule_sources.custom.mode, 'loaded')
  assert.equal(resolved.coverage_matrix.rule_sources.custom.enabled_count, 0)
  assert.deepEqual(unresolved.coverage_matrix.rule_sources.base, { source_commit: teamCommit, missing_clauses_sha256: catalog.sources.missing_clauses.sha256, market_benchmarks_sha256: catalog.sources.market_benchmarks.sha256 })
  const descriptor = JSON.parse(await readFile(new URL('../skills/coverage-matrix/references/coverage-matrix-bucket-summary.descriptor.json', import.meta.url)))
  const pointer = (value, path) => path.split('/').slice(1).reduce((current, segment) => current?.[segment], value)
  const rows = unresolved.coverage_matrix.rows
  const bucketCount = (buckets) => rows.filter((row) => buckets.includes(row.status)).length
  for (const assertion of descriptor.assertions) assert.equal(pointer(unresolved, assertion.expected_pointer), assertion.kind === 'total' ? rows.length : bucketCount(assertion.buckets))
  const positiveGroup = descriptor.assertion_groups.find((group) => group.assertions.some((assertion) => assertion.kind === 'ratio'))
  for (const assertion of positiveGroup.assertions.filter((assertion) => assertion.kind === 'count')) assert.equal(pointer(unresolved, assertion.expected_pointer), bucketCount(assertion.buckets))
  assert.equal(pointer(unresolved, positiveGroup.assertions.find((assertion) => assertion.kind === 'ratio').expected_pointer), '0.00%')
  const cli = spawnSync(process.execPath, ['tools/coverage-matrix-baseline-init/runtime.mjs'], { cwd: root, input: JSON.stringify(unresolvedInput), encoding: 'utf8', windowsHide: true, timeout: 10000 })
  assert.equal(cli.status, 0, cli.stderr)
  const stdout = JSON.parse(cli.stdout)
  assert.equal(stdout.success, true)
  assert.equal(stdout.output.coverage_matrix.summary.total, 26)
})

test('unknown released source and malformed selection fail closed', () => {
  assert.throws(() => runtime.evaluate(envelope({ mode: 'resolved', rules_path: '/x/rules.yaml', rules_sha256: 'a'.repeat(64), pack_version: 'v1' }), { expectedCatalogHash: hash(testCatalogBytes()) }), /COVERAGE_BASELINE_INPUT_SET_INVALID/)
  assert.throws(() => runtime.evaluate(envelope({ mode: 'clarification_required', pending_codes: [] }), { expectedCatalogHash: hash(testCatalogBytes()) }), /COVERAGE_BASELINE_JURISDICTION_INVALID/)
  const duplicate = envelope({ mode: 'clarification_required', pending_codes: ['PEND-JURISDICTION'] })
  duplicate.inputs.push({ ...duplicate.inputs[1], index: duplicate.inputs.length })
  assert.throws(() => runtime.evaluate(duplicate, { expectedCatalogHash: hash(testCatalogBytes()) }), /COVERAGE_BASELINE_INPUT_SET_INVALID/)
})

test('released input identity, binding and custom policy negatives fail before any baseline output', async () => {
  const unresolved = await releasedEnvelope({ mode: 'clarification_required', pending_codes: ['PEND-JURISDICTION'] })
  const mutatedCatalog = structuredClone(unresolved)
  mutatedCatalog.inputs[0] = snapshot(Buffer.concat([catalogBytes, Buffer.from(' ')]), 0)
  assert.throws(() => runtime.evaluate(mutatedCatalog), /COVERAGE_BASELINE_CATALOG_HASH_MISMATCH/)
  for (let index = 1; index <= 4; index += 1) {
    const mutatedRaw = structuredClone(unresolved)
    mutatedRaw.inputs[index] = snapshot(Buffer.from(`mutated-source-${index}`), index)
    assert.throws(() => runtime.evaluate(mutatedRaw), /COVERAGE_BASELINE_SOURCE_SET_INVALID|COVERAGE_BASELINE_INPUT_SET_INVALID/)
  }
  const missing = structuredClone(unresolved); missing.inputs.pop()
  assert.throws(() => runtime.evaluate(missing), /COVERAGE_BASELINE_INPUT_SET_INVALID/)
  const extra = structuredClone(unresolved); extra.inputs.push(snapshot(Buffer.from('extra'), extra.inputs.length))
  assert.throws(() => runtime.evaluate(extra), /COVERAGE_BASELINE_INPUT_SET_INVALID/)
  const wrongParam = structuredClone(unresolved); wrongParam.inputs[1].param = 'other'
  assert.throws(() => runtime.evaluate(wrongParam), /COVERAGE_BASELINE_INPUT_SET_INVALID/)
  const wrongIndex = structuredClone(unresolved); wrongIndex.inputs[1].index = 9
  assert.throws(() => runtime.evaluate(wrongIndex), /COVERAGE_BASELINE_INPUT_SET_INVALID/)
  const customUnsupported = structuredClone(unresolved); customUnsupported.params.custom.mode = 'optional_absent'
  assert.throws(() => runtime.evaluate(customUnsupported), /COVERAGE_BASELINE_CUSTOM_POLICY_UNAVAILABLE/)
  const customHashMismatch = structuredClone(unresolved); customHashMismatch.params.custom.redlines_sha256 = 'f'.repeat(64)
  assert.throws(() => runtime.evaluate(customHashMismatch), /COVERAGE_BASELINE_CUSTOM_POLICY_UNAVAILABLE/)
  const invalidCase = structuredClone(unresolved); invalidCase.params.case_id = 'case-2026-001'
  assert.throws(() => runtime.evaluate(invalidCase), /COVERAGE_BASELINE_CASE_BINDING_INVALID/)
  const invalidDate = structuredClone(unresolved); invalidDate.params.generated_at = 'not-a-date'
  assert.throws(() => runtime.evaluate(invalidDate), /COVERAGE_BASELINE_GENERATED_AT_INVALID/)
  const malformedCatalog = JSON.parse(testCatalogBytes())
  malformedCatalog.fixed_rows[1].check_id = malformedCatalog.fixed_rows[0].check_id
  const malformedBytes = Buffer.from(JSON.stringify(malformedCatalog))
  const malformed = envelope({ mode: 'clarification_required', pending_codes: ['PEND-JURISDICTION'] })
  malformed.inputs[0] = snapshot(malformedBytes, 0)
  assert.throws(() => runtime.evaluate(malformed, { expectedCatalogHash: hash(malformedBytes) }), /COVERAGE_BASELINE_CATALOG_INVALID/)
})

test('released resolved catalog enumerates every rules and conflicts entry', async () => {
  const rulesBytes = Buffer.from('released-rules-v1')
  const released = JSON.parse(testCatalogBytes())
  const rulesHash = hash(rulesBytes)
  released.jurisdiction_catalogs = [{ sha256: rulesHash, rules: [{ id: 'r-1', title: 'Rule one' }], conflicts: [{ id: 'c-1', title: 'Conflict one' }] }]
  const bytes = Buffer.from(JSON.stringify(released))
  const output = runtime.evaluate({
    protocol: 'desirecore.script.snapshot.v1',
    params: { case_id: 'case-12345678-1234-4234-8234-123456789abc', generated_at: '2026-09-13T08:00:00Z', jurisdiction: { mode: 'resolved', rules_path: '/shared/rules.yaml', rules_sha256: rulesHash, pack_version: 'v1' }, custom: custom(released) },
    inputs: [snapshot(bytes, 0), ...Object.keys(released.sources).map((name, index) => snapshot(Buffer.from(`released-source-${name}`), index + 1)), snapshot(rulesBytes, Object.keys(released.sources).length + 1)],
  }, { expectedCatalogHash: hash(bytes) })
  const rows = output.coverage_matrix.rows.filter((row) => row.owner_agent === 'jurisdiction-auditor')
  assert.deepEqual(rows.map(({ check_id, rule_kind, check_source }) => [check_id, rule_kind, check_source]), [
    ['r-1', 'jurisdiction_rule', '/shared/rules.yaml#rules/r-1'],
    ['c-1', 'jurisdiction_conflict', '/shared/rules.yaml#conflicts/c-1'],
  ])
  assert.equal(output.coverage_matrix.summary.blank, 28)
  const schema = JSON.parse(await readFile(new URL('../skills/coverage-matrix/references/coverage-matrix-bucket-summary.schema.json', import.meta.url)))
  const parsed = parseDocument(JSON.stringify(output), { schema: 'core', strict: true, uniqueKeys: true }).toJSON()
  assert.equal(new Ajv({ allErrors: true, strict: false }).compile(schema)(parsed), true)
  const crossSource = structuredClone(released)
  crossSource.jurisdiction_catalogs[0].rules[0].id = 'CHK-INTAKE-S1-SCOPE'
  const crossSourceBytes = Buffer.from(JSON.stringify(crossSource))
  const crossSourceInput = {
    protocol: 'desirecore.script.snapshot.v1',
    params: { case_id: 'case-12345678-1234-4234-8234-123456789abc', generated_at: '2026-09-13T08:00:00Z', jurisdiction: { mode: 'resolved', rules_path: '/shared/rules.yaml', rules_sha256: rulesHash, pack_version: 'v1' }, custom: custom(crossSource) },
    inputs: [snapshot(crossSourceBytes, 0), ...Object.keys(crossSource.sources).map((name, index) => snapshot(Buffer.from(`released-source-${name}`), index + 1)), snapshot(rulesBytes, Object.keys(crossSource.sources).length + 1)],
  }
  assert.throws(() => runtime.evaluate(crossSourceInput, { expectedCatalogHash: hash(crossSourceBytes) }), /COVERAGE_BASELINE_ROW_IDENTITY_INVALID/)
})

test('tool and controller keep snapshot-only, create-only and post-output gates explicit', async () => {
  const [tool, o0, agent, coverageSkill, orchestrationSkill] = await Promise.all([
    readFile(new URL('../tools/coverage-matrix-baseline-init/TOOL.md', import.meta.url), 'utf8'),
    readFile(new URL('../skills/review-orchestration/references/procedure/o0-registration.md', import.meta.url), 'utf8'),
    readFile(new URL('../agent.json', import.meta.url), 'utf8'),
    readFile(new URL('../skills/coverage-matrix/SKILL.md', import.meta.url), 'utf8'),
    readFile(new URL('../skills/review-orchestration/SKILL.md', import.meta.url), 'utf8'),
  ])
  assert.match(tool, /runtime: node[\s\S]*protocol: snapshot-v1/)
  assert.match(tool, /catalog_paths[\s\S]*minItems: 5[\s\S]*maxItems: 6/)
  const frontmatter = parseDocument(tool.match(/^---\n([\s\S]*?)\n---/)[1], { schema: 'core', strict: true, uniqueKeys: true }).toJSON()
  const toolInputSchema = frontmatter.input_schema
  assert.equal(new Ajv({ allErrors: true, strict: false }).compile(toolInputSchema)({
    catalog_paths: ['/a', '/b', '/c', '/d', '/e'], output_path: '/out', case_id: 'case-12345678-1234-4234-8234-123456789abc', generated_at: '2026-09-13T08:00:00Z', jurisdiction: { mode: 'clarification_required', pending_codes: ['PEND-JURISDICTION'] }, custom: { mode: 'loaded_zero_enabled', pack_sha256: 'a'.repeat(64), redlines_sha256: 'b'.repeat(64), },
  }), true)
  assert.match(o0, /create-only[\s\S]*`Read`[\s\S]*StructuredFileValidate/s)
  assert.match(o0, /未知动态 catalog/)
  assert.match(o0, /\$\{SKILL_DIR\}\/references\/coverage-matrix-baseline\.catalog\.json/)
  assert.doesNotMatch(o0, /\$\{TOOL_DIR\}/)
  assert.equal(JSON.parse(agent).version, '1.0.24')
  assert.match(coverageSkill, /^version: 1\.0\.8$/m)
  assert.match(orchestrationSkill, /^version: 1\.0\.18$/m)
  assert.deepEqual(JSON.parse(agent).tool_permissions.allowed.slice(-2), ['contract-intake-deterministic-check', 'coverage-matrix-baseline-init'])
  assert.equal(catalog.sources.missing_clauses.sha256, '8e644ed5adf6f8b3031b5979655d881ed59e5300b7e582ff01947fb4e558ba11')
  assert.equal(catalog.sources.market_benchmarks.sha256, 'bdb803acb41a01edb3834624040db01a757880b4d20e33bf351e2e66ac93778d')
  assert.equal(catalog.sources.custom_pack.sha256, 'c99cb4ed8a19f7b620bc88dfc4479c79231ee376acd4bf42c10e94138ffeccd6')
  assert.equal(catalog.sources.custom_redlines.sha256, 'ee8f00b048ce54d6434111e019c42551d1906d1d8ba9cae928a406f29437468c')
})
