import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const schemaSha = '0349796015a208240887dc772795edde76c42552fbf61fc788769d07fad5c24f'
const rulesSha = '4ca27f8d9e8566a2e9ae989d18377d864f646eeb91cd0aece8c93170f9b63fb8'
const catalogSha = '858036a26dfce0f08048884f8580e0dd74b8ae180aff42371ccbc6d470b10b78'
const coverage = ['parties','definitions','clause_tree','monetary_terms','payment_terms','temporal_terms','termination_grounds','dispute_resolution','governing_law','liability_cap','indirect_damages_excluded','breach_remedies','grace_period','subcontracting','audit_right','force_majeure','data_export','attachment_manifest','attachment_references']
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const operandKey = (operand) => operand.kind === 'derived_source'
  ? `derived:${operand.sourceName}:${operand.field}`
  : `${operand.file}:${operand.pointer ?? operand.field}`

test('v2.2 source-only pins bind the strict DOCX schema and LF release rules', async () => {
  const [pins, rules] = await Promise.all([
    json('compose-contracts/clause-v22-single-main-contract.pins.json'),
    json('compose-contracts/clause-v22-single-main-contract.rules.json'),
  ])
  assert.equal(pins.schema.sha256, schemaSha)
  assert.equal(pins.method_catalog.sha256, catalogSha)
  assert.deepEqual(pins.captures.delivered_sources, [{ name: 'part_0', object_index: 0, part_id: 'body', capture_format: 'docx' }])
  assert.equal(pins.rules.sha256, rulesSha)
  const ruleBytes = await readFile(new URL('compose-contracts/clause-v22-single-main-contract.rules.json', root))
  assert.equal(sha256(ruleBytes), rulesSha)
  assert.equal(ruleBytes.includes(0x0d), false, 'v2.2 rules must remain LF-only to preserve their release pin')
  const attributes = await readFile(new URL('.gitattributes', root), 'utf8')
  assert.match(attributes, /^compose-contracts\/clause-v22-single-main-contract\.rules\.json text eol=lf$/m)
  assert.equal(Object.hasOwn(rules, 'schemaJson'), false)
  assert.equal(Object.hasOwn(rules, 'schemaTarget'), false)
  assert.equal(Object.hasOwn(rules, 'paths'), false)
  assert.ok(rules.assertions.length <= pins.c01_limits.max_assertions)
  assert.ok(rules.literalSelectors.length <= pins.c01_limits.max_selectors)
})

test('v2.2 binds every declared DOCX representation to the same capture and immutable derived provenance', async () => {
  const rules = await json('compose-contracts/clause-v22-single-main-contract.rules.json')
  const equals = new Set(rules.assertions.filter((rule) => rule.type === 'equals').map((rule) => `${operandKey(rule.left)}=${operandKey(rule.right)}`))
  const required = (arrayPointer, member, value) => rules.assertions.some((rule) => rule.type === 'required_set' && rule.file === 'artifact' && rule.arrayPointer === arrayPointer && rule.member === member && rule.exact === true && rule.values.length === 1 && rule.values[0] === value)
  assert.ok(required('/clause_extraction/parts', 'format', 'docx'))
  assert.ok(required('/clause_extraction/frozen_baseline/parts', 'format', 'docx'))
  assert.ok(required('/clause_extraction/source_representations', 'part_id', 'body'))
  assert.ok(required('/clause_extraction/source_representations', 'source_name', 'part_0'))
  assert.ok(required('/clause_extraction/source_representations', 'format', 'docx'))
  assert.ok(rules.assertions.some((rule) => rule.type === 'array_length_equals' && rule.file === 'artifact' && rule.arrayPointer === '/clause_extraction/source_representations' && operandKey(rule.expected) === 'artifact:/clause_extraction/part_count'))
  assert.ok(rules.assertions.some((rule) => rule.type === 'unique_keys' && rule.file === 'artifact' && rule.arrayPointer === '/clause_extraction/source_representations' && rule.keys.length === 1 && rule.keys[0] === 'part_id'))
  assert.ok(rules.assertions.some((rule) => rule.type === 'unique_keys' && rule.file === 'artifact' && rule.arrayPointer === '/clause_extraction/source_representations' && rule.keys.length === 1 && rule.keys[0] === 'source_name'))
  for (const [pointer, source] of [
    ['/clause_extraction/source_representations/0/source_sha256', 'derived:part_0:source_sha256'],
    ['/clause_extraction/source_representations/0/source_size_bytes', 'derived:part_0:source_size_bytes'],
    ['/clause_extraction/source_representations/0/representation/derived_text_sha256', 'derived:part_0:derived_text_sha256'],
    ['/clause_extraction/source_representations/0/representation/text_offset_codec', 'derived:part_0:text_offset_codec'],
    ['/clause_extraction/source_representations/0/representation/derived_text_utf16_code_units', 'derived:part_0:derived_text_utf16_code_units'],
  ]) assert.ok(equals.has(`artifact:${pointer}=${source}`))
  assert.ok(equals.has('artifact:/clause_extraction/source_representations/0/format=part_0:format'))
})

test('v2.2 retains bounded generic positive selectors and the fixed 19-group coverage contract', async () => {
  const rules = await json('compose-contracts/clause-v22-single-main-contract.rules.json')
  const coverageSet = rules.assertions.find((rule) => rule.type === 'required_set' && rule.file === 'artifact' && rule.arrayPointer === '/clause_extraction/coverage')
  assert.deepEqual(coverageSet.values, coverage)
  assert.equal(coverageSet.exact, true)
  assert.deepEqual(rules.literalSelectors.map(({ id, childArrayPointers, sourceBindings, positionMember, positionMode, skipNullLiteral }) => ({ id, childArrayPointers, sourceBindings, positionMember, positionMode, skipNullLiteral })), [
    { id: 'payloadEvidence', childArrayPointers: ['/records', '/evidence'], sourceBindings: [{ value: 'body', sourceName: 'part_0' }], positionMember: 'utf16_offsets', positionMode: 'claimed_array', skipNullLiteral: true },
    { id: 'coverageEvidence', childArrayPointers: ['/evidence'], sourceBindings: [{ value: 'body', sourceName: 'part_0' }], positionMember: 'utf16_offsets', positionMode: 'claimed_array', skipNullLiteral: true },
    { id: 'ambiguityEv', childArrayPointers: ['/candidate_evidence'], sourceBindings: [{ value: 'body', sourceName: 'part_0' }], positionMember: 'utf16_offsets', positionMode: 'claimed_array', skipNullLiteral: false },
  ])
})

test('O2 preserves v2.1 and makes v2.2 DOCX admission conditional on the public receipt', async () => {
  const skill = await readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8')
  assert.match(skill, /Clause v2\.1 单主合同自动消费/)
  assert.match(skill, /Clause v2\.2 单主合同 DOCX 自动消费/)
  assert.match(skill, /clause-extraction-artifact-v22\.schema\.json/)
  assert.match(skill, /clause-v22-single-main-contract\.rules\.json/)
  assert.match(skill, new RegExp(schemaSha))
  assert.match(skill, new RegExp(rulesSha))
  assert.match(skill, /name: part_0, path: <O0 objects\[0\]\.canonical_path>, format: docx/)
  assert.match(skill, /derived_sources/)
  assert.match(skill, /不传递 `derived_text_ref`/)
  assert.match(skill, /v2\.2.*DOCX/s)
  assert.match(skill, /text.*v2\.1/s)
  assert.match(skill, /native.*HOLD/s)
})