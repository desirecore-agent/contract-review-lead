import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const coverage = ["parties","definitions","clause_tree","monetary_terms","payment_terms","temporal_terms","termination_grounds","dispute_resolution","governing_law","liability_cap","indirect_damages_excluded","breach_remedies","grace_period","subcontracting","audit_right","force_majeure","data_export","attachment_manifest","attachment_references"]
const schemaSha = 'a5ffb1525f027f878ab9c89adaf6a4fc8d3255d5bd47f0d25b807df83c46c671'
const catalogSha = '858036a26dfce0f08048884f8580e0dd74b8ae180aff42371ccbc6d470b10b78'
const rulesSha = 'c515bd9b4f6873a1e7acb071e1e991f29f12a076253c85bf7e8581c6d6590ef7'

async function json(path) { return JSON.parse(await readFile(new URL(path, root), 'utf8')) }
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

test('single-main-contract Compose policy is source-only and pins captured schema/rules inputs', async () => {
  const [pins, rules] = await Promise.all([
    json('compose-contracts/clause-v21-single-main-contract.pins.json'),
    json('compose-contracts/clause-v21-single-main-contract.rules.json'),
  ])
  assert.equal(pins.schema.sha256, schemaSha)
  assert.equal(pins.method_catalog.sha256, catalogSha)
  assert.deepEqual(pins.rules, { source_name: 'rules', relative_source: 'review-orchestration/compose-contracts/clause-v21-single-main-contract.rules.json', sha256: rulesSha, format: 'json', line_endings: 'LF', note: 'The caller compares this release-owned pin with receipt.binding.rules_source.sha256 before relying on receipt.ok.' })
  const ruleBytes = await readFile(new URL('compose-contracts/clause-v21-single-main-contract.rules.json', root))
  assert.equal(sha256(ruleBytes), pins.rules.sha256)
  assert.equal(ruleBytes.includes(0x0d), false, 'rules source must remain LF-only to preserve its byte pin')
  assert.deepEqual(pins.captures, { schema_source: 'pinned_schema', schema_target: 'artifact', rules_source: 'rules', baseline: 'baseline', delivered_sources: [{ name: 'part_0', object_index: 0, part_id: 'body' }] })
  assert.equal(Object.hasOwn(rules, 'schemaJson'), false)
  assert.equal(Object.hasOwn(rules, 'schemaTarget'), false)
  assert.equal(Object.hasOwn(rules, 'paths'), false)
  assert.ok(rules.assertions.length <= pins.c01_limits.max_assertions)
  assert.ok(rules.literalSelectors.length <= pins.c01_limits.max_selectors)
})

test('fixed-index C01 assertions bind artifact, captured source, and existing O0 ledger record', async () => {
  const rules = await json('compose-contracts/clause-v21-single-main-contract.rules.json')
  const equals = rules.assertions.filter((rule) => rule.type === 'equals')
  const pointerPairs = new Set(equals.map((rule) => `${rule.left.file}:${rule.left.pointer}=${rule.right.file}:${rule.right.pointer ?? rule.right.field}`))
  assert.ok(pointerPairs.has('artifact:/clause_extraction/parts/0/source=baseline:/orchestration_ledger/objects/0/canonical_path'))
  assert.ok(pointerPairs.has('artifact:/clause_extraction/parts/0/sha256=baseline:/orchestration_ledger/objects/0/content_digest'))
  assert.ok(pointerPairs.has('artifact:/clause_extraction/parts/0/sha256=part_0:sha256'))
  assert.ok(pointerPairs.has('artifact:/clause_extraction/upstream/frozen_baseline/attachment_manifest_digest=baseline:/orchestration_ledger/manifest_digest'))
  assert.ok(rules.assertions.some((rule) => rule.type === 'count_where_equals' && rule.arrayPointer === '/clause_extraction/parts' && rule.member === 'delivered' && rule.value === true))
  assert.ok(rules.assertions.some((rule) => rule.type === 'array_length_equals' && rule.arrayPointer === '/clause_extraction/frozen_baseline/parts'))
  assert.ok(rules.assertions.some((rule) => rule.type === 'required_set' && rule.arrayPointer === '/clause_extraction/parts' && rule.exact && rule.values.length === 1 && rule.values[0] === 'body'))
  assert.ok(rules.assertions.some((rule) => rule.type === 'required_set' && rule.arrayPointer === '/clause_extraction/frozen_baseline/parts' && rule.exact && rule.values.length === 1 && rule.values[0] === 'body'))
  assert.ok(rules.assertions.some((rule) => rule.type === 'count_where_equals' && rule.file === 'baseline' && rule.arrayPointer === '/orchestration_ledger/objects' && rule.member === 'kind' && rule.value === 'main_contract'))
  assert.ok(rules.assertions.some((rule) => rule.type === 'required_set' && rule.file === 'baseline' && rule.arrayPointer === '/orchestration_ledger/objects' && rule.member === 'kind' && rule.exact && rule.values.length === 1 && rule.values[0] === 'main_contract'))
  assert.ok(pointerPairs.has('artifact:/clause_extraction/object/contract_object_id=baseline:/orchestration_ledger/objects/0/object_id'))
  assert.ok(pointerPairs.has('artifact:/clause_extraction/object/version_label=baseline:/orchestration_ledger/objects/0/version_label'))
  assert.ok(pointerPairs.has('baseline:/orchestration_ledger/objects/0/digest_binding/case_id=baseline:/orchestration_ledger/case_id'))
  assert.ok(pointerPairs.has('baseline:/orchestration_ledger/objects/0/digest_binding/content_digest=baseline:/orchestration_ledger/objects/0/content_digest'))
  assert.ok(pointerPairs.has('artifact:/clause_extraction/parts/0/id=artifact:/clause_extraction/frozen_baseline/parts/0/id'))
  assert.ok(pointerPairs.has('artifact:/clause_extraction/object/content_digest=baseline:/orchestration_ledger/objects/0/content_digest'))
})

test('coverage and nested positive evidence policy use only bounded generic constructs', async () => {
  const rules = await json('compose-contracts/clause-v21-single-main-contract.rules.json')
  const coverageSet = rules.assertions.find((rule) => rule.type === 'required_set' && rule.arrayPointer === '/clause_extraction/coverage')
  assert.deepEqual(coverageSet.values, coverage)
  assert.equal(coverageSet.exact, true)
  assert.deepEqual(rules.literalSelectors.map(({ id, childArrayPointers, sourceBindings, positionMember, positionMode, skipNullLiteral }) => ({ id, childArrayPointers, sourceBindings, positionMember, positionMode, skipNullLiteral })), [
    { id: 'payloadEvidence', childArrayPointers: ['/records', '/evidence'], sourceBindings: [{ value: 'body', sourceName: 'part_0' }], positionMember: 'utf16_offsets', positionMode: 'claimed_array', skipNullLiteral: true },
    { id: 'coverageEvidence', childArrayPointers: ['/evidence'], sourceBindings: [{ value: 'body', sourceName: 'part_0' }], positionMember: 'utf16_offsets', positionMode: 'claimed_array', skipNullLiteral: true },
    { id: 'ambiguityEv', childArrayPointers: ['/candidate_evidence'], sourceBindings: [{ value: 'body', sourceName: 'part_0' }], positionMember: 'utf16_offsets', positionMode: 'claimed_array', skipNullLiteral: false },
  ])
  assert.ok(rules.literalSelectors.every((selector) => selector.requiredSourceNames.length === 0 && selector.exhaustiveNegative === false))
})

test('policy declares multi-part and semantic relations outside current generic Compose capability', async () => {
  const pins = await json('compose-contracts/clause-v21-single-main-contract.pins.json')
  assert.deepEqual(pins.non_goals, ['dynamic multi-part joins', 'object identity from digest alone', 'semantic absence proof', 'Delegate work-context validation', 'Human Gate or legal conclusions'])
})


test('O2 consumes only the public Compose envelope for the fixed single-main-contract policy', async () => {
  const [skill, agent] = await Promise.all([
    readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8'),
    json('agent.json'),
  ])
  const skillVersion = skill.match(/^version: (1\.0\.\d+)$/m)?.[1]
  const metadataVersion = skill.match(/metadata:\s+author: DesireCore\s+version: (1\.0\.\d+)\s+updated_at: '2026-09-11'/s)?.[1]
  assert.ok(skillVersion, 'skill frontmatter must retain a 1.0.x version')
  assert.equal(metadataVersion, skillVersion, 'skill metadata version must track the published skill version')
  assert.ok(agent.tool_permissions.allowed.includes('StructuredFileValidateCompose'))
  assert.equal(agent.tool_permissions.denied.includes('StructuredFileValidateCompose'), false)
  assert.deepEqual(agent.default_enabled.tools, [])
  assert.match(skill, /ToolExecutionResult\.success: true/)
  assert.match(skill, /唯一 text `content` 能严格 JSON parse 为 receipt/)
  assert.match(skill, /不得读取或引用 worker 内部 `source-bound-receipt`/)
  assert.match(skill, /name: artifact, path: <final-receipt\.artifact_path>, format: yaml/)
  assert.match(skill, /name: baseline, path: <current Lead O0 ledger absolute path>, format: yaml/)
  assert.match(skill, /name: pinned_schema, path: <published AgentFS clause-extractor schema path>, format: json/)
  assert.match(skill, /name: rules, path: <published AgentFS review-orchestration rules path>, format: json/)
  assert.match(skill, /name: part_0, path: <O0 objects\[0\]\.canonical_path>, format: text/)
  assert.match(skill, /schema_source: pinned_schema/)
  assert.match(skill, /schema_target: artifact/)
  assert.match(skill, /rules_source: rules/)
  assert.match(skill, new RegExp(schemaSha))
  assert.match(skill, new RegExp(rulesSha))
  assert.match(skill, /assertion_count `38`/)
  assert.match(skill, /payloadEvidence.*coverageEvidence.*ambiguityEv/s)
  assert.match(skill, /O2_CLAUSE_V21_SINGLE_PART_BASELINE_UNAVAILABLE/)
  assert.match(skill, /O2_CLAUSE_V2_COMPOSE_UNAVAILABLE/)
  assert.match(skill, /不得因此提前更新 coverage、替代 RC-1\.\.RC-6、弱化 Human Gate/)
  assert.match(skill, /不得.*多 part\/C13/)
})
