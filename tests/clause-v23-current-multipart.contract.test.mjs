import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import Ajv from 'ajv'

const root = new URL('..', import.meta.url)
const schemaSha = 'fc5355dfc349bde3ff52e0b05171010f7b6d8db0d5d3811576baf02ae7090d3d'
const pinnedReleaseBytes = {
  'compose-contracts/clause-v21-single-main-contract.rules.json': 'c515bd9b4f6873a1e7acb071e1e991f29f12a076253c85bf7e8581c6d6590ef7',
  'compose-contracts/clause-v21-single-main-contract.pins.json': 'a1cd7f95d67fe840d79c74e87a0d55aa80b9c4023e8712cb2c56bcc4e3a80b99',
  'compose-contracts/clause-v22-single-main-contract.rules.json': '4ca27f8d9e8566a2e9ae989d18377d864f646eeb91cd0aece8c93170f9b63fb8',
  'compose-contracts/clause-v22-single-main-contract.pins.json': 'd8a2eb3bc05451cc5bf3ee4de77ffafb4e5ec2e63e14c4ef932e5169a39276cb',
}
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const clone = value => JSON.parse(JSON.stringify(value))
const setPointer = (value, pointer, replacement) => {
  const tokens = pointer.slice(1).split('/').map(token => token.replaceAll('~1', '/').replaceAll('~0', '~'))
  const last = tokens.pop()
  let current = value
  for (const token of tokens) current = Array.isArray(current) ? current[Number(token)] : current[token]
  current[last] = replacement
}

test('v23 pins the current Clause v22 schema and an unchanged LF-only multipart rule source', async () => {
  const pins = await readJson('compose-contracts/clause-v23-current-multipart.pins.json')
  const bytes = await readFile(new URL('compose-contracts/clause-v23-current-multipart.rules.json', root))
  const rules = JSON.parse(bytes)
  assert.equal(pins.schema.sha256, schemaSha)
  assert.equal(pins.rules.sha256, digest(bytes))
  assert.equal(bytes.includes(0x0d), false)
  assert.equal(pins.c01_limits.max_delivered_sources, 28)
  assert.equal(rules.assertions.length, 24)
  assert.equal(rules.literalSelectors.length, 3)
  const skill = await readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8')
  assert.match(skill, new RegExp(pins.rules.sha256))
  assert.match(skill, /明确选择\*\*本节具名的 `v2\.3 current multipart` 分支/)
  assert.match(skill, /当前实际安装团队.*当前 read scope/s)
  assert.match(skill, /`shared\/resources\/compose-contracts\/`/)
  assert.match(skill, /Compose 的 `pinned_schema` 与 `rules` 分别使用这两个已解析的绝对路径/)
  assert.match(skill, /不得从 `\$\{SKILL_DIR\}`、Lead workspace、成员 workspace 或其他 AgentFS 复制、换根或替代/)
  assert.match(skill, /member-owned `members\/clause-extractor\/<case_id>\/<extraction_id>\/artifact\/` 子树/)
  assert.match(skill, /只可消费最终回执原样返回、且在当前团队 read scope 中可 `Read` 的绝对路径/)

})

test('v23 preserves v21 and both rule sources while the authorized v22 pin tracks Clause 1.0.13', async () => {
  for (const [path, expected] of Object.entries(pinnedReleaseBytes)) {
    assert.equal(digest(await readFile(new URL(path, root))), expected, path)
  }
  const [v21, v22] = await Promise.all([
    readJson('compose-contracts/clause-v21-single-main-contract.pins.json'),
    readJson('compose-contracts/clause-v22-single-main-contract.pins.json'),
  ])
  assert.equal(v21.schema.sha256, 'a5ffb1525f027f878ab9c89adaf6a4fc8d3255d5bd47f0d25b807df83c46c671')
  assert.equal(v22.schema.sha256, schemaSha)
})

test('v23 binds O0 current parts, exactly one main, delivered representations, and trusted metadata', async () => {
  const rules = await readJson('compose-contracts/clause-v23-current-multipart.rules.json')
  const joins = rules.assertions.filter(x => x.type === 'exact_keyed_join')
  assert.ok(joins.some(x => x.left.file === 'baseline' && x.left.arrayPointer === '/current_contract/parts' && x.right.arrayPointer === '/clause_extraction/parts'))
  const main = joins.find(x => x.left.file === 'baseline' && x.left.filter?.member === 'kind' && x.left.filter.values[0] === 'main_contract')
  assert.deepEqual(main.keys, [{ left: 'kind', right: 'kind' }])
  assert.deepEqual(main.fieldPairs, [])
  assert.ok(rules.assertions.some(x => x.type === 'required_set' && x.file === 'baseline' && x.arrayPointer === '/current_contract/parts' && x.member === 'kind' && x.values[0] === 'main_contract' && x.exact === false))
  assert.ok(rules.assertions.some(x => x.type === 'count_where_equals' && x.file === 'baseline' && x.member === 'kind' && x.value === 'main_contract' && x.expected.pointer === '/current_contract/main_contract_count'))
  const digestBinding = joins.find(x => x.left.file === 'baseline' && x.left.arrayPointer === '/current_contract/parts' && x.right.file === 'baseline' && x.right.arrayPointer === '/current_contract/parts' && x.keys[0].left === 'part_id')
  assert.deepEqual(digestBinding.fieldPairs, [
    { leftPointer: '/digest_binding/object_id', rightPointer: '/object_id' },
    { leftPointer: '/digest_binding/version_label', rightPointer: '/version_label' },
    { leftPointer: '/digest_binding/canonical_path', rightPointer: '/canonical_path' },
    { leftPointer: '/digest_binding/content_digest', rightPointer: '/content_digest' },
  ])
  const rowBindings = rules.assertions.filter(x => x.type === 'all_rows_equal')
  assert.deepEqual(rowBindings.map(x => ({ pointer: x.rowPointer, expected: x.expected.pointer, filter: x.source.filter?.values ?? [] })), [
    { pointer: '/digest_binding/case_id', expected: '/case_id', filter: [] },
    { pointer: '/object_id', expected: '/clause_extraction/object/contract_object_id', filter: ['main_contract'] },
    { pointer: '/version_label', expected: '/clause_extraction/object/version_label', filter: ['main_contract'] },
    { pointer: '/content_digest', expected: '/clause_extraction/object/content_digest', filter: ['main_contract'] },
  ])
  assert.ok(joins.some(x => x.left.arrayPointer === '/clause_extraction/parts' && x.right.arrayPointer === '/clause_extraction/source_representations' && x.left.filter?.member === 'delivered'))
  const metadata = rules.assertions.find(x => x.type === 'exact_captured_metadata_join')
  assert.deepEqual(metadata, { type: 'exact_captured_metadata_join', file: 'artifact', arrayPointer: '/clause_extraction/source_representations', sourceNameMember: 'source_name', sourceSha256Member: 'source_sha256', sourceSizeBytesMember: 'source_size_bytes', sourceFormatMember: 'format', excludeSources: ['baseline'], docx: { objectPointer: '/representation', derivedTextSha256Member: 'derived_text_sha256', textOffsetCodecMember: 'text_offset_codec', derivedTextUtf16CodeUnitsMember: 'derived_text_utf16_code_units' } })
})

test('v23 selectors are dynamic-only and preserve the three positive evidence paths', async () => {
  const rules = await readJson('compose-contracts/clause-v23-current-multipart.rules.json')
  for (const selector of rules.literalSelectors) {
    assert.equal(Object.hasOwn(selector, 'sourceNameMember'), false)
    assert.equal(Object.hasOwn(selector, 'sourceBindings'), false)
    assert.deepEqual(selector.requiredSourceNames, [])
    assert.deepEqual(selector.capturedRepresentationPartMap, { arrayPointer: '/clause_extraction/source_representations', evidencePartIdMember: 'part', representationPartIdMember: 'part_id', representationSourceNameMember: 'source_name', representationSourceSha256Member: 'source_sha256' })
  }
  assert.deepEqual(rules.literalSelectors.map(x => x.id), ['payloadEvidence', 'coverageEvidence', 'ambiguityEv'])
})

test('source-only fixture is valid under the actual O0 and Clause v22 schemas, including every single-scalar identity mutation', async () => {
  const [o0Schema, clauseSchema, fixture] = await Promise.all([
    readJson('inventory/o0-input-inventory.schema.json'),
    readJson('../clause-batch-literals/schemas/clause-extraction-artifact-v22.schema.json'),
    readJson('tests/fixtures/clause-v23-current-multipart/valid-multipart.json'),
  ])
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validateO0 = ajv.compile(o0Schema)
  const validateClause = ajv.compile(clauseSchema)
  assert.equal(validateO0(fixture.inventory), true, JSON.stringify(validateO0.errors))
  assert.equal(validateClause(fixture.artifact), true, JSON.stringify(validateClause.errors))
  assert.equal(digest(Buffer.from(fixture.source_texts.body, 'utf8')), fixture.inventory.current_contract.parts[0].content_digest)
  assert.equal(digest(Buffer.from(fixture.source_texts.annex, 'utf8')), fixture.inventory.current_contract.parts[1].content_digest)
  assert.equal(fixture.artifact.clause_extraction.object.contract_object_id, fixture.inventory.current_contract.parts[0].object_id)
  assert.equal(fixture.artifact.clause_extraction.object.version_label, fixture.inventory.current_contract.parts[0].version_label)
  assert.equal(fixture.artifact.clause_extraction.object.content_digest, fixture.inventory.current_contract.parts[0].content_digest)
  for (const mutation of fixture.identity_mutations) {
    const inventory = clone(fixture.inventory)
    const artifact = clone(fixture.artifact)
    setPointer(mutation.document === 'inventory' ? inventory : artifact, mutation.pointer, mutation.replacement)
    assert.equal(validateO0(inventory), true, `${mutation.id}: ${JSON.stringify(validateO0.errors)}`)
    assert.equal(validateClause(artifact), true, `${mutation.id}: ${JSON.stringify(validateClause.errors)}`)
    assert.ok(Number.isInteger(mutation.expected_assertion_index))
  }
})

test('v23 fixes the source-bound dynamic receipt-manifest consumption contract without claiming worker execution', async () => {
  const fixture = await readJson('tests/fixtures/clause-v23-current-multipart/valid-multipart.json')
  assert.deepEqual(fixture.capture_contract.control_names, ['pinned_schema', 'artifact', 'rules', 'baseline'])
  assert.deepEqual(fixture.capture_contract.delivered_source_names, ['body', 'annex'])
  assert.equal(fixture.capture_contract.max_captured_files, 32)
  assert.equal(fixture.capture_contract.max_delivered_sources, 28)
  assert.deepEqual(fixture.receipt_contract.binding_sources, { schema_source: 'pinned_schema', schema_target: 'artifact', rules_source: 'rules' })
  assert.equal(fixture.receipt_contract.assertion_count, 24)
  for (const selector of fixture.receipt_contract.selectors) {
    assert.deepEqual(Object.keys(selector).sort(), ['exhaustive_negative', 'id', 'required_source_names', 'source_requirement'])
    assert.deepEqual(selector.required_source_names, ['body', 'annex'])
    assert.equal(selector.exhaustive_negative, false)
    assert.equal(selector.source_requirement, 'captured_representation_part')
  }
  for (const literal of fixture.receipt_contract.literals) {
    assert.deepEqual(literal.required_source_names, ['body', 'annex'])
    assert.deepEqual(literal.completed_source_names, ['body', 'annex'])
    assert.deepEqual(literal.failed_source_names, [])
    assert.equal(literal.all_required_sources_completed, true)
  }
})
