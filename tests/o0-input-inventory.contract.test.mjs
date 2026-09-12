import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import Ajv from 'ajv'
import { parseDocument } from 'yaml'

const root = new URL('..', import.meta.url)
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const yaml = async (path) => parseDocument(await readFile(new URL(path, root), 'utf8'))
const property = (schema, name) => schema.properties[name]

// This is a source-contract check of declared inventory policy. It is not a runtime
// implementation of O0, Human Gate, Delegate identity, cross-file joins, or Compose admission.
const inventoryPolicyErrors = (inventory) => {
  const errors = []
  const current = inventory.current_contract
  const actualMain = current.parts.filter((part) => part.kind === 'main_contract').length
  if (current.main_contract_count !== actualMain || actualMain !== 1) errors.push('INV-001-MAIN-CONTRACT-COUNT')
  if (current.parts.length !== 1 && inventory.legacy_current_objects_projection.status !== 'unavailable_multi_part_or_unclassified') errors.push('LEGACY-PROJECTION-MULTIPART')
  if (inventory.unclassified_materials.length > 0) {
    errors.push('UNCLASSIFIED-MATERIALS-HOLD')
    if (inventory.legacy_current_objects_projection.status !== 'unavailable_multi_part_or_unclassified' || inventory.legacy_current_objects_projection.objects.length !== 0) errors.push('LEGACY-PROJECTION-UNCLASSIFIED')
  }
  if (current.parts.length === 0 && inventory.unclassified_materials.length === 0) errors.push('UNCLASSIFIED-MATERIAL-REQUIRED')
  for (const set of inventory.historical_contract_sets) {
    if (set.completeness !== 'complete' && set.comparison_conclusion_allowed) errors.push('HISTORICAL-INCOMPLETE-COMPARISON')
  }
  return errors
}

test('O0 inventory schema is Draft-07, self-described, closed, and gives every digest an unambiguous availability state', async () => {
  const schema = await json('inventory/o0-input-inventory.schema.json')
  assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#')
  assert.equal(schema.additionalProperties, false)
  assert.match(schema.description, /not an approval, legal conclusion, or runtime identity/i)
  for (const name of ['submission_inventory', 'current_contract', 'historical_contract_sets', 'reference_materials', 'operator_inputs', 'commercial_rule_sets', 'resume_state_references', 'unclassified_materials', 'legacy_current_objects_projection']) {
    assert.ok(schema.required.includes(name), `${name} must be present in every classified inventory`)
    assert.ok(property(schema, name).description, `${name} needs a data description`)
  }
  for (const subject of [property(schema, 'submission_inventory'), property(schema, 'current_contract')]) {
    assert.equal(subject.oneOf.length, 2)
    assert.equal(subject.oneOf[0].properties.manifest_digest.minLength, 1)
    assert.equal(subject.oneOf[0].properties.manifest_digest_unavailable.const, false)
    assert.equal(subject.oneOf[1].properties.manifest_digest.type, 'null')
    assert.equal(subject.oneOf[1].properties.manifest_digest_unavailable.const, true)
  }
  const historicalDigest = schema.definitions.historicalSet.allOf[0]
  assert.equal(historicalDigest.oneOf.length, 2)
  assert.equal(historicalDigest.oneOf[0].properties.manifest_digest.minLength, 1)
  assert.equal(historicalDigest.oneOf[0].properties.manifest_digest_unavailable.const, false)
  assert.equal(historicalDigest.oneOf[1].properties.manifest_digest.type, 'null')
  assert.equal(historicalDigest.oneOf[1].properties.manifest_digest_unavailable.const, true)
  assert.equal(schema.definitions.historicalSet.allOf[1].oneOf[1].properties.missing_part_reasons.minItems, 1)
  const unclassifiedHold = schema.allOf.find((entry) => entry.if?.properties?.unclassified_materials?.minItems === 1)
  assert.ok(unclassifiedHold)
  assert.equal(unclassifiedHold.then.properties.legacy_current_objects_projection.properties.status.const, 'unavailable_multi_part_or_unclassified')
  assert.equal(unclassifiedHold.then.properties.legacy_current_objects_projection.properties.objects.maxItems, 0)
  assert.deepEqual(schema.definitions.classificationBasis.enum, ['user_submission_context', 'user_clarification', 'previously_frozen_case_metadata'])
  assert.equal(schema.definitions.classificationBasis.enum.includes('filename_inference'), false)
  assert.equal(schema.definitions.classificationBasis.enum.includes('document_embedded_instruction'), false)
})

test('full synthetic inventories and the YAML template validate through real Draft-07 Ajv, while structural negatives reject', async () => {
  const [schema, fixture, templateDocument] = await Promise.all([
    json('inventory/o0-input-inventory.schema.json'),
    json('tests/fixtures/o0-input-inventory/classification-cases.json'),
    yaml('inventory/o0-input-inventory.template.yaml'),
  ])
  assert.deepEqual(templateDocument.errors, [])
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema)
  assert.equal(validate(templateDocument.toJS()), true, JSON.stringify(validate.errors))
  for (const { id, inventory } of fixture.valid_instances) assert.equal(validate(inventory), true, `${id}: ${JSON.stringify(validate.errors)}`)
  for (const { id, inventory } of fixture.invalid_schema_instances) assert.equal(validate(inventory), false, `${id} must fail the Draft-07 contract`)
})

test('current, historical, reference, operator, commercial, resume, and unclassified roles preserve their source boundary', async () => {
  const fixture = await json('tests/fixtures/o0-input-inventory/classification-cases.json')
  const cases = new Map(fixture.valid_instances.map((item) => [item.id, item.inventory]))
  const c01 = cases.get('C01-current-body-and-attachment')
  assert.equal(c01.current_contract.parts.length, 2)
  assert.equal(c01.legacy_current_objects_projection.status, 'unavailable_multi_part_or_unclassified')
  for (const id of ['C03-historical-main-contract', 'C08-historical-incomplete-comparison']) {
    const inventory = cases.get(id)
    assert.equal(inventory.historical_contract_sets.length, 1)
    assert.equal(inventory.current_contract.parts.some((part) => part.object_id.startsWith('historical-')), false)
    assert.equal(inventory.historical_contract_sets[0].comparison_conclusion_allowed, false)
  }
  const c08 = cases.get('C08-historical-incomplete-comparison').historical_contract_sets[0]
  assert.equal(c08.completeness, 'incomplete')
  assert.deepEqual(c08.missing_part_reasons, ['HISTORICAL-ATTACHMENT-MISSING'])
  assert.equal(c08.comparison_scope, 'declared_parts_only')
  const c10 = cases.get('C10-prior-review-reference').reference_materials[0]
  assert.equal(c10.use, 'reference_only')
  assert.equal(Object.hasOwn(c10, 'approval'), false)
  const c07 = cases.get('C07-operator-request').operator_inputs[0]
  assert.equal(c07.use, 'instruction_only')
  assert.equal(/work_context|run_id|human_gate/i.test(JSON.stringify(c07)), false)
  const c12 = cases.get('C12-commercial-rules-and-resume-reference')
  assert.equal(c12.commercial_rule_sets[0].use, 'commercial_policy_only')
  assert.equal(Object.hasOwn(c12.commercial_rule_sets[0], 'jurisdiction_pack_version'), false)
  assert.equal(c12.resume_state_references[0].use, 'reference_only_not_execution_identity')
  assert.equal(/work_context|run_id|action_resume/i.test(JSON.stringify(c12.resume_state_references[0])), false)
  const hold = cases.get('all-unclassified-hold')
  assert.equal(hold.current_contract.parts.length, 0)
  assert.equal(hold.current_contract.main_contract_count, 0)
  assert.equal(hold.unclassified_materials.length, 1)
  assert.equal(hold.legacy_current_objects_projection.status, 'unavailable_multi_part_or_unclassified')
  const mixed = cases.get('mixed-current-and-unclassified-hold')
  assert.equal(mixed.current_contract.parts.length, 1)
  assert.equal(mixed.unclassified_materials.length, 1)
  assert.deepEqual(mixed.legacy_current_objects_projection, { status: 'unavailable_multi_part_or_unclassified', objects: [] })
})

test('declared current-main count remains a Lead policy check outside local Draft-07 shape validation', async () => {
  const fixture = await json('tests/fixtures/o0-input-inventory/classification-cases.json')
  for (const { id, inventory, expected_lead_hold } of fixture.cross_row_policy_instances) {
    assert.deepEqual(inventoryPolicyErrors(inventory), [expected_lead_hold], `${id} must remain a Lead HOLD`)
  }
  const unclassified = fixture.valid_instances.find(({ id }) => id === 'all-unclassified-hold').inventory
  assert.deepEqual(inventoryPolicyErrors(unclassified), ['INV-001-MAIN-CONTRACT-COUNT', 'UNCLASSIFIED-MATERIALS-HOLD'])
  const mixed = fixture.valid_instances.find(({ id }) => id === 'mixed-current-and-unclassified-hold').inventory
  assert.deepEqual(inventoryPolicyErrors(mixed), ['UNCLASSIFIED-MATERIALS-HOLD'])
})

test('O0 classification text separates total/current manifests and keeps multi-part admission unavailable', async () => {
  const skill = await readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8')
  assert.match(skill, /submission_inventory_manifest_digest/)
  assert.match(skill, /current_contract_manifest_digest/)
  assert.match(skill, /旧 `attachment_manifest_digest` \/ `manifest_digest` 仅镜像 `current_contract_manifest_digest`/)
  assert.match(skill, /不能从文件名或文内指令/)
  assert.match(skill, /不构成.*Human Gate.*Delegate.*运行时身份/s)
  assert.match(skill, /当前集合多 part.*O2 保持 HOLD/s)
})

test('O1 handoff keeps the submitted and current manifests distinct before Intake runs', async () => {
  const skill = await readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8')
  assert.match(skill, /case_id.*只能复制本次 `Delegate` 的显式 `handoff\.case_id`/s)
  assert.match(skill, /submitted_file_paths.*完整用户提交集合/s)
  assert.match(skill, /object\.documents.*只能列 `current_contract\.parts`/s)
  assert.match(skill, /object\.manifest_digest.*current_contract_manifest_digest.*不等.*O1_MANIFEST_CONTRACT_INVALID.*HOLD/s)
  assert.match(skill, /submission_inventory_manifest_digest.*完整提交集合摘要/s)
  assert.match(skill, /current_contract_manifest_digest.*当前合同集摘要/s)
  assert.match(skill, /S4 的 `attachment_manifest_digest`.*四字段对账表摘要.*不能.*FileDigest 集合摘要/s)
  assert.match(skill, /review_context_path: \/abs\/path\/to\/lead-workspace\/contract-review\/review-context\.yaml/)
})

test('O1 source contract requires mirrored unsigned-draft evidence and holds YAML not actually verified', async () => {
  const skill = await readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8')
  assert.match(skill, /freeze\.execution_status\.signature_status.*unsigned_draft/s)
  assert.match(skill, /回执该处与 handoff 根中的两个镜像/)
  assert.match(skill, /review_purpose: draft_negotiation_assistance/)
  assert.match(skill, /request_scope_evidence.*material_evidence.*字段齐全、逐值相同/s)
  assert.match(skill, /input_path.*page.*locator.*quote/s)
  assert.match(skill, /O1_UNSIGNED_DRAFT_EVIDENCE_INVALID.*HOLD\/打回/s)
  assert.match(skill, /O1_INTAKE_YAML_UNVERIFIED.*HOLD/s)
  assert.match(skill, /不更新 O1 为已验证完成、不进入 O2/)
})
