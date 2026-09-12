import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import Ajv from 'ajv'
import { parseDocument } from 'yaml'

const root = new URL('..', import.meta.url)
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'))

test('Lead package-local references are byte-identical copies of their single sources', async () => {
  const pairs = [
    ['inventory/o0-input-inventory.schema.json', 'skills/review-orchestration/references/inventory/o0-input-inventory.schema.json'],
    ['review-context/review-context.schema.json', 'skills/review-orchestration/references/review-context/review-context.schema.json'],
    ['review-context/review-context.template.yaml', 'skills/review-orchestration/references/review-context/review-context.template.yaml'],
    ['compose-contracts/clause-v22-single-main-contract.rules.json', 'skills/review-orchestration/references/compose-contracts/clause-v22-single-main-contract.rules.json'],
    ['compose-contracts/clause-v23-current-multipart.rules.json', 'skills/review-orchestration/references/compose-contracts/clause-v23-current-multipart.rules.json'],
    ['review-context/review-context.schema.json', 'skills/review-registration/references/review-context/review-context.schema.json'],
    ['review-context/review-context.template.yaml', 'skills/review-registration/references/review-context/review-context.template.yaml'],
  ]
  for (const [source, copy] of pairs) {
    assert.deepEqual(await readFile(new URL(copy, root)), await readFile(new URL(source, root)), copy)
  }
})

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

test('Lead routes bounded registration to its dedicated skill while full orchestration retains context handoff requirements', async () => {
  const [lead, registration, coverage, agent, persona, principles] = await Promise.all([
    readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8'),
    readFile(new URL('skills/review-registration/SKILL.md', root), 'utf8'),
    readFile(new URL('skills/coverage-matrix/SKILL.md', root), 'utf8'),
    json('agent.json'),
    readFile(new URL('persona.md', root), 'utf8'),
    readFile(new URL('principles.md', root), 'utf8'),
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
  assert.match(lead, /必须直接调用 `Skill review-registration`，不要先加载、摘录或执行本技能的完整 O0/)
  assert.match(lead, /受限登记的停止、更新和回复规则仅由 `review-registration` 定义/)
  assert.doesNotMatch(lead, /\*\*受限 O0 不预检或推进。\*\*/)
  assert.match(registration, /^name: review-registration\r?$/m)
  assert.match(registration, /^version: 1\.0\.1\r?$/m)
  assert.match(registration, /tools: \[Read, Write, GenerateUUID, FileDigest\]/)
  assert.ok(registration.length <= 4500, 'registration skill stays within the bounded prompt budget')
  const frontmatter = parseDocument(registration.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]).toJS()
  assert.equal(frontmatter.status, 'enabled')
  assert.equal(frontmatter.version, '1.0.1')
  assert.equal(frontmatter.metadata.version, '1.0.1')
  assert.notEqual(frontmatter['disable-model-invocation'], false, 'registration must remain explicit-only')
  assert.notEqual(frontmatter.disable_model_invocation, false, 'registration alias must remain explicit-only')
  assert.equal(agent.version, '1.0.17')
  assert.deepEqual(agent.default_enabled.skills, ['review-orchestration', 'coverage-matrix', 'review-registration'])
  assert.ok(agent.tool_permissions.allowed.includes('Skill'))
  assert.match(registration, /直接保留其真实返回值作为唯一 `case_id`/)
  assert.match(registration, /不得改写为日期\/序号或丢弃 UUID/)
  assert.match(lead, /直接保留其真实返回值作为本次唯一 `case_id`/)
  assert.match(lead, /O0_CASE_ID_GENERATION_MISMATCH/)
  assert.match(lead, /当前输入身份只取用户本轮明确路径和当前 effective 团队 cwd：用户逐字给出的绝对路径直接复用；相对路径只可基于该 cwd 确定性解析/)
  assert.match(lead, /不得猜测、截断、重组\/换根路径，也不得以旧 personal workspace 替代/)
  assert.match(lead, /某一明确路径错误只能记录该路径错误，不得推导所有目录未授权/)
  assert.match(lead, /仅一份文件时，`paths` 必须是该文件的完整绝对裸路径字符串/)
  assert.match(lead, /`paths` 中看似 JSON 的字符串仍是字面路径，绝不解析/)
  assert.match(lead, /多份文件时，只有当前工具参数已明示 `paths_json` 兼容入口才可调用它/)
  assert.match(lead, /JSON 字符串数组（1–100 项、UTF-8 不超过 64 KiB）/)
  assert.match(lead, /解码后的路径集合必须逐项等于该集合、不多不少/)
  assert.match(lead, /不得同时传 `paths`、`file_path` 或 `path`/)
  assert.match(lead, /`FileDigest\.paths_json` 入口是发布此批量规则的最小客户端能力要求/)
  assert.match(lead, /批量参数形态错误.*纠正一次为上述 `paths_json` 形态/)
  assert.match(lead, /仍失败即如实记录返回原因并停止摘要步骤/)
  assert.match(lead, /只有已读旧 context 的 `case_binding\.case_id` 与本次 `case_id` 相同，且同一冻结材料绑定已核验时，才是同案更新/)
  assert.match(lead, /不得由候选代码、自然语言或目录名拼接\/猜测路径/)
  assert.match(registration, /pack\.status: not_prechecked/)
  assert.match(registration, /`Read` 不得用于合同正文或附件/)
  assert.match(registration, /仅可用 `FileDigest` 记录最小真实对象身份/)
  assert.match(registration, /只记录用户在当前请求中明确声明的事实/)
  assert.match(registration, /不得把未声明改写成合同正文、条款或地点缺失/)
  assert.match(registration, /不得评论合同正文是否具备任何条款、法域、争议解决机构、签署地或其他地点信息/)
  assert.match(registration, /PEND-JURISDICTION-PACK-PREFLIGHT/)
  assert.match(registration, /不得继续完整 O0 清点、规则包预检、覆盖矩阵、O1 或 `Delegate`/)
  assert.match(registration, /不得把 pending 说成完整审查、O1 或事实提取的启动前提，不承诺补齐后自动开始/)
  assert.match(registration, /首次受限登记没有同一案件、同一材料状态、已核验的完整 current 库存/)
  assert.match(registration, /不得从单文件或 aggregate 推断完整 manifest/)
  assert.match(registration, /仅同一 case、同一材料状态且闭合字段实际变化时写 `revision \+ 1`/)
  assert.match(registration, /没有实际变化则不写、不虚增 revision/)
  assert.match(lead, /成功时才以真实版本和两个 SHA-256 pin 将它改为 `read_and_pinned`/)
  assert.match(lead, /第一次 `Write` 前，必须实际 `Read` AgentFS 中的 `\$\{SKILL_DIR\}\/references\/review-context\/review-context\.schema\.json` 和 `\$\{SKILL_DIR\}\/references\/review-context\/review-context\.template\.yaml`/)
  assert.match(lead, /O0_REVIEW_CONTEXT_INVALID/)
  assert.match(registration, /只在本轮已有用户提交的合同材料或用户明确指向的合同文件/)
  assert.match(registration, /没有本轮材料或明确文件指向时，保持零工具咨询/)
  assert.match(lead, /已明确完整审查授权且完整 O0 完成后才可派发任务/)
  assert.match(lead, /已在当前请求中明确的完整审查授权（包括普通“请审查这份合同”的自然表达）足以触发完整 O0，且不得重复追问/)
  assert.match(persona, /不得先加载长编排技能或重复询问「仅登记还是完整审查」/)
  assert.match(persona, /首个执行性工具调用必须是 `Skill review-orchestration`，在它返回前不得检索旧 case 或读写材料/)
  assert.match(persona, /当前已选\/已加载的 `review-registration` 或 `review-orchestration` Skill 各自的单一契约/)
  assert.match(persona, /不得为仅登记加载长编排技能/)
  assert.match(persona, /首个工具调用必须是 `Skill review-registration`/)
  assert.match(persona, /在该技能返回前，不得 `Read`、`Ls`、`Glob`、`Grep`、`FileDigest`、`Write`、`Edit`、`Delegate`、`AskUserQuestion`、`Bash`、Terminal、PowerShell 或其他 shell、规则包预检或建立矩阵/)
  assert.match(persona, /受限登记只可按其 `requires` 使用 `Read`、`Write`、`GenerateUUID`、`FileDigest`/)
  assert.match(persona, /`Read` 仅限 schema\/template 或同案 context，`Write` 仅限闭合 context 回写/)
  assert.match(persona, /不得调用 shell、`Ls`、`Glob`、`Grep`、`Edit`、`Delegate`、`AskUserQuestion`、规则包或矩阵/)
  assert.match(persona, /这是 Agent 流程规则，不是平台沙箱/)
  assert.match(principles, /首个工具调用必须是 `Skill review-registration`/)
  assert.match(principles, /在该技能返回前不得 `Read`、`Ls`、`Glob`、`Grep`、`FileDigest`、`Write`、`Edit`、`Delegate`、`AskUserQuestion`、`Bash`、Terminal、PowerShell 或其他 shell、规则包预检或建立矩阵/)
  assert.match(principles, /受限登记只可按其 `requires` 使用 `Read`、`Write`、`GenerateUUID`、`FileDigest`/)
  assert.match(principles, /`Read` 仅限 schema\/template 或同案 context，`Write` 仅限闭合 context 回写/)
  assert.match(principles, /不得调用 shell、`Ls`、`Glob`、`Grep`、`Edit`、`Delegate`、`AskUserQuestion`、规则包或矩阵/)
  assert.match(principles, /纯语言澄清和结束回复不受该工具清单约束/)
  assert.match(principles, /只有范围本身含混时才可一次澄清/)
  assert.match(principles, /完整审查另由 `review-orchestration` 编排/)
  assert.match(principles, /当前已选\/已加载的 `review-registration` 或 `review-orchestration` Skill 各自的单一契约/)
  assert.match(principles, /不得为仅登记加载长编排技能/)
  assert.doesNotMatch(persona, /多文件仍以完整集合的原生字符串数组请求/)
  assert.doesNotMatch(principles, /多文件传完整集合的原生字符串数组/)
  assert.match(lead, /明确要求审查合同的普通表达已是完整审查授权，不要求固定口令/)
  assert.match(lead, /不得调用未暴露的 `Bash`、Terminal、PowerShell 或其他 shell 来创建目录/)
  assert.match(coverage, /`review-registration` 是唯一流程，本技能不得被调用/)
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
