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
  const conflictWithPreflightPending = clone(fixture.valid_instances.find(({ id }) => id === 'conflicting-candidates-preserve-hg-02').context)
  assert.equal(conflictWithPreflightPending.jurisdiction.candidate_bases[1].pack.status, 'not_prechecked', 'a conflict may retain an unprechecked declared candidate')
  conflictWithPreflightPending.pending.push({ code: 'PEND-JURISDICTION-PACK-PREFLIGHT', required_from: 'lead' })
  assert.equal(validate(conflictWithPreflightPending), false, 'an unprechecked conflict candidate cannot displace the HG-02 resolution path')
  const unavailable = clone(fixture.valid_instances.find(({ id }) => id === 'identified-candidate-with-missing-pack-records-failure-without-default').context)
  unavailable.output_constraints.jurisdiction_substantive_conclusion = 'allowed'
  assert.equal(validate(unavailable), false, 'unavailable selected pack cannot allow a jurisdiction conclusion')
  const notPrechecked = clone(fixture.valid_instances.find(({ id }) => id === 'limited-o0-declared-candidate-is-not-prechecked').context)
  notPrechecked.output_constraints.jurisdiction_substantive_conclusion = 'allowed'
  assert.equal(validate(notPrechecked), false, 'an unprechecked candidate cannot allow a jurisdiction conclusion')
  const missingPreflightPending = clone(notPrechecked)
  missingPreflightPending.pending = []
  assert.equal(validate(missingPreflightPending), false, 'an unprechecked candidate requires the typed Lead preflight pending item')
  const pinnedWithPreflightPending = clone(fixture.valid_instances.find(({ id }) => id === 'user-stated-stance-and-review-basis').context)
  pinnedWithPreflightPending.pending.push({ code: 'PEND-JURISDICTION-PACK-PREFLIGHT', required_from: 'lead' })
  assert.equal(validate(pinnedWithPreflightPending), false, 'a pinned candidate cannot retain the limited-O0 preflight pending item')
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
  const notPrechecked = fixture.valid_instances.find(({ id }) => id === 'limited-o0-declared-candidate-is-not-prechecked').context
  assert.deepEqual(notPrechecked.jurisdiction.candidate_basis.pack, { status: 'not_prechecked' })
  assert.equal(notPrechecked.output_constraints.jurisdiction_substantive_conclusion, 'not_issued_pack_preflight_pending')
  assert.deepEqual(notPrechecked.pending, [{ code: 'PEND-JURISDICTION-PACK-PREFLIGHT', required_from: 'lead' }])
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
  assert.match(lead, /pack: \{status: not_prechecked\}/)
  assert.match(lead, /PEND-JURISDICTION-PACK-PREFLIGHT/)
  assert.match(lead, /成功时才以真实版本和两个 SHA-256 pin 将它改为 `read_and_pinned`/)
  assert.match(lead, /第一次 `Write` 前，必须实际 `Read` AgentFS 中的 `review-context\/review-context\.schema\.json` 和 `review-context\/review-context\.template\.yaml`/)
  assert.match(lead, /O0_REVIEW_CONTEXT_INVALID/)
  assert.match(lead, /只有本轮已提交合同材料或用户明确指向合同文件时，才可进入任何 O0/)
  assert.match(lead, /用户若明确只要求登记或建立待补的 review context/)
  assert.match(lead, /\*\*受限 O0 不预检或推进。\*\*/)
  assert.match(lead, /不得建立覆盖矩阵、规则包预检、材料抽取、实质判断或 `Delegate`/)
  assert.match(lead, /首次受限登记若没有同一案件已核验的完整 current 库存，即使单文件 digest 成功，也不得把它推定为完整 current manifest/)
  assert.match(lead, /已有同案、同材料状态且已核验的完整 current 库存才可保留其现有 manifest/)
  assert.match(lead, /不能说“未提交”“缺失”、冻结它们，或伪造页码、清单摘要和其他冻结事实/)
  assert.match(lead, /用户明确要求开始审查，才可执行下列完整 O0/)
  assert.match(lead, /已明确完整审查授权且完整 O0 完成后才可派发任务/)
  assert.match(lead, /受限 O0 也没有到 O1 的边/)
  assert.match(lead, /已在当前请求中明确的完整审查授权（包括普通“请审查这份合同”的自然表达）足以触发完整 O0，且不得重复追问/)
  assert.match(lead, /\*\*不得\*\*用 `AskUserQuestion` 重复确认“仅登记还是完整审查”/)
  assert.match(lead, /明确要求审查合同的普通表达已是完整审查授权，不要求固定口令/)
  assert.match(lead, /不得调用未暴露的 `Bash`、Terminal、PowerShell 或其他 shell 来创建目录/)
  assert.match(lead, /只有闭合字段实际变化才写 `旧值 \+ 1`，无变化不虚增 revision/)
  assert.match(lead, /不得把它们说成完整审查的硬前提/)
  assert.match(lead, /\*\*受限 O0 的结束回复。\*\*/)
  assert.match(lead, /当前 typed pending 对应的\*\*输出限制\*\*/)
  assert.match(lead, /不得把它们称为完整审查、O1 或事实提取的启动前提，也不得承诺补齐后自动开始/)
  assert.match(coverage, /用户自然语言仅限登记或上下文待补时，本技能不得被调用/)
  assert.match(coverage, /clarification_required/)
  assert.match(coverage, /不生成任何法域规则行/)
  assert.match(coverage, /RULE_SOURCE_UNAVAILABLE/)
  assert.match(coverage, /`pack.status: not_prechecked`/)
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
  const codes = ['PEND-REVIEW-STANCE-REQUIRED', 'PEND-JURISDICTION-BASIS-REQUIRED', 'HG-02', 'RULE_SOURCE_UNAVAILABLE', 'PEND-JURISDICTION-PACK-PREFLIGHT']
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
      mutated.pending.push({ code, required_from: ['RULE_SOURCE_UNAVAILABLE', 'PEND-JURISDICTION-PACK-PREFLIGHT'].includes(code) ? 'lead' : 'user' })
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
