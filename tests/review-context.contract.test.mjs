import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import Ajv from 'ajv'
import { parseDocument } from 'yaml'

const root = new URL('..', import.meta.url)
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'))

test('review-context schema and bilingual template declare a closed non-authority contract', async () => {
  const [schema, templateText, enReadme, zhReadme] = await Promise.all([
    json('review-context/review-context.schema.json'),
    readFile(new URL('review-context/review-context.template.yaml', root), 'utf8'),
    readFile(new URL('review-context/README.md', root), 'utf8'),
    readFile(new URL('review-context/README.zh-CN.md', root), 'utf8'),
  ])
  const template = parseDocument(templateText)
  assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#')
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(template.errors, [])
  assert.match(schema.description, /not a platform identity.*legal-applicability/i)
  assert.match(JSON.stringify(schema), /not proof of representation or authority/i)
  assert.match(enReadme, /none certifies.*platform identity/i)
  assert.match(zhReadme, /不认证合同方代表权、授权、法律适用、平台身份/)
})

test('synthetic contexts and template validate through real Draft-07 Ajv; one-field negative mutations reject', async () => {
  const [schema, fixture, templateText] = await Promise.all([
    json('review-context/review-context.schema.json'),
    json('tests/fixtures/review-context/cases.json'),
    readFile(new URL('review-context/review-context.template.yaml', root), 'utf8'),
  ])
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema)
  assert.equal(validate(parseDocument(templateText).toJS()), true, JSON.stringify(validate.errors))
  for (const { id, context } of fixture.valid_instances) assert.equal(validate(context), true, `${id}: ${JSON.stringify(validate.errors)}`)
  for (const { id, context } of fixture.invalid_schema_instances) assert.equal(validate(context), false, `${id}: must reject`)
  const clone = (value) => JSON.parse(JSON.stringify(value))
  const missing = clone(fixture.valid_instances.find(({ id }) => id === 'missing-stance-and-jurisdiction-with-unavailable-manifest').context)
  missing.output_constraints.directional_risk_advice = 'allowed'
  assert.equal(validate(missing), false, 'missing stance cannot allow directional advice')
  const missingPending = clone(fixture.valid_instances.find(({ id }) => id === 'missing-stance-and-jurisdiction-with-unavailable-manifest').context)
  missingPending.pending = missingPending.pending.filter(({ code }) => code !== 'PEND-REVIEW-STANCE-REQUIRED')
  assert.equal(validate(missingPending), false, 'missing stance requires typed user clarification')
  const staleStance = clone(fixture.valid_instances.find(({ id }) => id === 'user-stated-stance-and-review-basis').context)
  staleStance.pending.push({ code: 'PEND-REVIEW-STANCE-REQUIRED', required_from: 'user' })
  assert.equal(validate(staleStance), false, 'a stated stance cannot retain its expired clarification code')
  const missingJurisdiction = clone(fixture.valid_instances.find(({ id }) => id === 'missing-stance-and-jurisdiction-with-unavailable-manifest').context)
  missingJurisdiction.pending = missingJurisdiction.pending.filter(({ code }) => code !== 'PEND-JURISDICTION-BASIS-REQUIRED')
  assert.equal(validate(missingJurisdiction), false, 'undetermined jurisdiction requires typed user clarification')
  const conflict = clone(fixture.valid_instances.find(({ id }) => id === 'conflicting-candidates-preserve-hg-02').context)
  conflict.output_constraints.jurisdiction_substantive_conclusion = 'allowed'
  assert.equal(validate(conflict), false, 'conflicting candidates cannot allow a jurisdiction conclusion')
  const unavailable = clone(fixture.valid_instances.find(({ id }) => id === 'identified-candidate-with-missing-pack-records-failure-without-default').context)
  unavailable.output_constraints.jurisdiction_substantive_conclusion = 'allowed'
  assert.equal(validate(unavailable), false, 'unavailable selected pack cannot allow a jurisdiction conclusion')
  const pinned = clone(fixture.valid_instances.find(({ id }) => id === 'user-stated-stance-and-review-basis').context)
  pinned.output_constraints.jurisdiction_substantive_conclusion = 'not_issued_missing_jurisdiction'
  assert.equal(validate(pinned), false, 'read-and-pinned candidate allows candidate-basis analysis')
  const clueWithUnavailableManifest = clone(fixture.valid_instances.find(({ id }) => id === 'unique-current-part-clue-is-candidate-not-final-law').context)
  clueWithUnavailableManifest.case_binding.current_contract_manifest = { status: 'unavailable', reason: 'FILE_DIGEST_DENIED' }
  assert.equal(validate(clueWithUnavailableManifest), false, 'current-part clue requires an available current manifest')
})

test('source fixtures distinguish claims without asserting cross-document enforcement', async () => {
  const fixture = await json('tests/fixtures/review-context/cases.json')
  for (const { id, context } of fixture.valid_instances) {
    assert.equal(context.output_constraints.factual_extraction, 'allowed', `${id}: facts remain available`)
  }
  const user = fixture.valid_instances.find(({ id }) => id === 'user-stated-stance-and-review-basis').context
  assert.equal(Object.hasOwn(user.review_stance, 'party_object_id'), false)
  const clue = fixture.valid_instances.find(({ id }) => id === 'unique-current-part-clue-is-candidate-not-final-law')
  assert.equal(clue.context.jurisdiction.candidate_basis.source.kind, 'current_part_clue')
  assert.equal(clue.context.jurisdiction.candidate_basis.pack.status, 'read_and_pinned')
  assert.match(clue.context.jurisdiction.candidate_basis.source.quoted_basis, /governed/i)
  const noPack = fixture.valid_instances.find(({ id }) => id === 'identified-candidate-with-missing-pack-records-failure-without-default').context
  assert.equal(noPack.jurisdiction.candidate_basis.pack.status, 'unavailable')
  assert.equal(noPack.jurisdiction.candidate_basis.pack.reason, 'RULE_SOURCE_UNAVAILABLE')
  assert.equal(noPack.output_constraints.jurisdiction_substantive_conclusion, 'not_issued_rule_source_unavailable')
})

test('Lead and coverage-matrix source contracts retain no-default unresolved mode and O3 context handoff requirements', async () => {
  const [lead, coverage] = await Promise.all([
    readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8'),
    readFile(new URL('skills/coverage-matrix/SKILL.md', root), 'utf8'),
  ])
  assert.match(lead, /不得要求不存在的 `party_object_id`/)
  assert.match(lead, /不得从文件名、文内指令、商业规则、resume 或旧摘要推断/)
  assert.match(lead, /review_context_path/)
  assert.match(lead, /review_context_current_manifest/)
  assert.match(lead, /review_context_output_constraints/)
  assert.match(lead, /review_context_echo/)
  assert.match(lead, /actual_output_constraints/)
  assert.match(lead, /不默认选包/)
  assert.match(lead, /not_issued_missing_review_stance/)
  assert.match(lead, /不得发出法域实体结论/)
  assert.match(coverage, /clarification_required/)
  assert.match(coverage, /不生成任何法域规则行/)
  assert.match(coverage, /RULE_SOURCE_UNAVAILABLE/)
})

test('late O3 context echo is a source-contract rejection, not a simulated Agent run', async () => {
  const fixture = await json('tests/fixtures/review-context/cases.json')
  const { current_context: current, late_o3_receipt_echo: { review_context_echo: late } } = fixture.stale_receipt_fixture
  const same = current.case_id === late.case_id
    && current.revision === late.revision
    && JSON.stringify(current.current_contract_manifest) === JSON.stringify(late.current_manifest)
    && JSON.stringify(current.output_constraints) === JSON.stringify(late.actual_output_constraints)
  assert.equal(same, false)
  assert.equal(fixture.stale_receipt_fixture.expected_rejection, 'REJECT-STALE-REVIEW-CONTEXT')
})

test('real Ajv rejects scope drift and stale or missing pending codes for every valid context', async () => {
  const schema = await json('review-context/review-context.schema.json')
  const fixture = await json('tests/fixtures/review-context/cases.json')
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema)
  const codes = ['PEND-REVIEW-STANCE-REQUIRED', 'PEND-JURISDICTION-BASIS-REQUIRED', 'HG-02', 'RULE_SOURCE_UNAVAILABLE']
  for (const { id, context } of fixture.valid_instances) {
    assert.equal(validate(context), true, `${id}: baseline ${JSON.stringify(validate.errors)}`)
    for (const [field, shape] of Object.entries(schema.definitions.outputConstraints.properties)) {
      for (const replacement of shape.enum ?? []) {
        if (replacement === context.output_constraints[field]) continue
        const mutated = structuredClone(context)
        mutated.output_constraints[field] = replacement
        assert.equal(validate(mutated), false, `${id}: reject ${field}=${replacement}`)
      }
    }
    for (let i = 0; i < context.pending.length; i++) {
      const mutated = structuredClone(context)
      mutated.pending.splice(i, 1)
      assert.equal(validate(mutated), false, `${id}: required ${context.pending[i].code}`)
    }
    for (const code of codes.filter(code => !context.pending.some(item => item.code === code))) {
      const mutated = structuredClone(context)
      mutated.pending.push({ code, required_from: code === 'RULE_SOURCE_UNAVAILABLE' ? 'lead' : 'user' })
      assert.equal(validate(mutated), false, `${id}: extraneous ${code}`)
    }
  }
})

test('real Ajv requires an available manifest for a current-part clue inside conflicting candidates', async () => {
  const schema = await json('review-context/review-context.schema.json')
  const fixture = await json('tests/fixtures/review-context/cases.json')
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema)
  const context = structuredClone(fixture.valid_instances.find(item => item.context.jurisdiction.status === 'conflicting').context)
  const clue = fixture.valid_instances.find(item => item.context.jurisdiction.status === 'candidate_basis'
    && item.context.jurisdiction.candidate_basis.source.kind === 'current_part_clue').context
  context.jurisdiction.candidate_bases[0] = structuredClone(clue.jurisdiction.candidate_basis)
  context.case_binding.current_contract_manifest = structuredClone(clue.case_binding.current_contract_manifest)
  assert.equal(validate(context), true, JSON.stringify(validate.errors))
  context.case_binding.current_contract_manifest = { status: 'unavailable', reason: 'synthetic digest read failure' }
  assert.equal(validate(context), false, 'changing only manifest availability cannot bypass the conflicting-candidate guard')
})
