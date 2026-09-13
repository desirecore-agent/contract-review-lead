import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
}

function section(markdown, heading, nextHeading) {
  const start = markdown.indexOf(heading)
  assert.notEqual(start, -1, `missing ${heading}`)
  const end = markdown.indexOf(nextHeading, start + heading.length)
  assert.notEqual(end, -1, `missing ${nextHeading}`)
  return markdown.slice(start, end)
}

function yamlFields(block) {
  return Object.fromEntries(
    block
      .trim()
      .split('\n')
      .map((line) => line.match(/^([A-Za-z]+):\s*(.+)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^"|"$/g, '')]),
  )
}

function o1Transitions(o1) {
  return Object.fromEntries(
    [...o1.matchAll(/^\s*- `(?<verdict>blocked|conditional|passed)`\s*→\s*进 `(?<next>X1|O2)`/gm)].map(
      ({ groups }) => [groups.verdict, groups.next],
    ),
  )
}

function intakeGateMappings(o1) {
  const block = o1.match(/```yaml\nintake_gate_coverage:\n([\s\S]*?)```/)
  assert.ok(block, 'O1 must publish a machine-readable intake gate mapping')
  const requiredSteps = block[1].match(/required_steps: \[([^\]]+)\]/)?.[1].split(',').map((value) => value.trim())
  const entries = [...block[1].matchAll(
    /- coverage_id: (?<coverageId>CHK-INTAKE-[A-Z0-9-]+)\n\s+intake_gate_step: (?<step>S[1-8])\n\s+receipt_check_name: (?<name>.+)/g,
  )].map(({ groups }) => ({ ...groups }))

  return { requiredSteps, entries }
}

test('agent version is semantic and O1 has the required isolated sync Delegate contract', async () => {
  const [agentText, skill] = await Promise.all([source('agent.json'), source('skills/review-orchestration/SKILL.md')])
  const agent = JSON.parse(agentText)
  const o1 = section(skill, '### O1 输入治理（第 1-2 步）', '### O2 条款抽取（第 3 步）')
  const delegateYaml = o1.match(/```yaml\n([\s\S]*?)```/)

  assert.match(agent.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  assert.ok(delegateYaml, 'O1 must contain Delegate parameters')
  const { task, context, ...delegateBinding } = yamlFields(delegateYaml[1])
  assert.deepEqual(delegateBinding, {
    target: 'contract-intake',
    mode: 'sync',
    contextMode: 'isolated',
    intentId: '${case_id}:intake',
    contextReason: '合同案件输入治理与受理门禁。',
  })
  assert.ok(task?.trim(), 'Delegate task must be a non-empty execution instruction')
  assert.match(task, /context/)
  assert.match(context, /完整 YAML/)
  assert.match(o1, /`handoff` 不是 Delegate 的顶层参数/)

  const handoffYaml = o1.match(/`context` 的值必须是以下[\s\S]*?```yaml\n(?<yaml>handoff:\n[\s\S]*?)```/)
  assert.ok(handoffYaml?.groups?.yaml, 'Delegate context must carry a complete YAML handoff')
  const handoff = handoffYaml.groups.yaml
  assert.match(handoff, /^handoff:\n  case_id: \$\{case_id\}$/m)
  assert.match(handoff, /^  to: contract-intake$/m)
  assert.match(handoff, /^  from: contract-review-lead$/m)
  assert.match(handoff, /^  intake_gate_steps_required: \[S1, S2, S3, S4, S5, S6, S7, S8\]$/m)
  assert.match(handoff, /^  review_context_path: \/abs\/path\/to\/lead-workspace\/contract-review\/review-context\.yaml$/m)
  assert.match(handoff, /^  submitted_file_paths:/m)
  assert.match(handoff, /^  object:\n    manifest_digest: <current_contract_manifest_digest>[^\n]*\n    documents:/m)
  assert.match(handoff, /^  input_inventory:\n    current_contract_manifest_digest: <64-lowercase-sha256-or-unknown>\n    submission_inventory_manifest_digest: <64-lowercase-sha256-or-unknown>$/m)
})

test('policy corpus contains no authorization for lead-authored intake artifacts', async () => {
  const policy = await Promise.all([
    source('persona.md'),
    source('principles.md'),
    source('skills/review-orchestration/SKILL.md'),
  ])
  const corpus = policy.join('\n')
  const artifact = '(?:intake\\.yaml|输入治理回执|`verdict`|`pending`)'
  const actor = '(?:lead|统筹官|你)'
  const authoring = '(?:写|编写|编辑|生成|合成|补写)'
  const positiveAuthorization = new RegExp(
    `${actor}.{0,60}(?:可(?:以)?|允许|负责|应|须|必须)(?:(?!不得|禁止|不可).){0,40}${authoring}.{0,40}${artifact}`,
  )
  const passiveAuthorization = new RegExp(
    `由${actor}(?:(?!不得|禁止|不可).){0,30}${authoring}.{0,40}${artifact}`,
  )
  const contradictoryClauses = corpus
    .split(/[。；\n]/)
    .filter((clause) => positiveAuthorization.test(clause) || passiveAuthorization.test(clause))

  assert.deepEqual(contradictoryClauses, [])
  assert.match(corpus, /只由 `contract-intake` 产生/)
  assert.match(corpus, /lead 只能写编排账本中的派发、等待与阻断状态/)
})

test('O1 receipt transitions distinguish passed, conditional, blocked, and invalid receipts', async () => {
  const skill = await source('skills/review-orchestration/SKILL.md')
  const o1 = section(skill, '### O1 输入治理（第 1-2 步）', '### O2 条款抽取（第 3 步）')
  const transitions = o1Transitions(o1)
  const invalidRule = o1.split('\n').find((line) => line.includes('O1_INTAKE_RECEIPT_INVALID'))
  const conditionalRule = o1.split('\n').find((line) => /^\s*- `conditional`\s*→/.test(line))

  assert.deepEqual(transitions, { blocked: 'X1', conditional: 'O2', passed: 'O2' })
  assert.ok(conditionalRule, 'O1 must define a conditional receipt transition')
  assert.match(conditionalRule, /全量派发/)
  assert.match(conditionalRule, /范围不缩减/)
  assert.match(conditionalRule, /pending\[\]/)
  assert.match(conditionalRule, /原样传(?:递|给下游)/)
  assert.ok(invalidRule, 'O1 must name the invalid-receipt state')
  assert.match(invalidRule, /停在 O1/)
  assert.match(invalidRule, /O2/)
  assert.match(invalidRule, /可信续接绑定/)
  assert.match(invalidRule, /contextMode: continue/)
  assert.match(invalidRule, /HALTED_FOR_HUMAN/)
  assert.match(invalidRule, /O1_WAITING_OR_UNKNOWN/)
})

test('O1 consumes all eight real Intake checks through distinct Lead coverage IDs', async () => {
  const [skill, persona, principles, matrixSkill] = await Promise.all([
    source('skills/review-orchestration/SKILL.md'),
    source('persona.md'),
    source('principles.md'),
    source('skills/coverage-matrix/SKILL.md'),
  ])
  const o1 = section(skill, '### O1 输入治理（第 1-2 步）', '### O2 条款抽取（第 3 步）')
  const { requiredSteps, entries } = intakeGateMappings(o1)
  const expected = [
    { coverageId: 'CHK-INTAKE-S1-SCOPE', step: 'S1', name: '受理范围清点' },
    { coverageId: 'CHK-INTAKE-S2-MASTER-VERSION', step: 'S2', name: '主版本冻结' },
    { coverageId: 'CHK-INTAKE-S3-PAGE-RANGE', step: 'S3', name: '页码连续性' },
    { coverageId: 'CHK-INTAKE-S4-ATTACHMENT-MANIFEST', step: 'S4', name: '附件清单对账' },
    { coverageId: 'CHK-INTAKE-S5-EXECUTION-STATUS', step: 'S5', name: '签章状态' },
    { coverageId: 'CHK-INTAKE-S6-PLACEHOLDER', step: 'S6', name: '占位符扫描' },
    { coverageId: 'CHK-INTAKE-S7-PARTY-AND-AMOUNT', step: 'S7', name: '一致性（主体身份 / 金额大小写）' },
    { coverageId: 'CHK-INTAKE-S8-VERSION-MATRIX', step: 'S8', name: '版本矩阵对齐' },
  ]

  assert.deepEqual(requiredSteps, expected.map(({ step }) => step))
  assert.deepEqual(entries, expected)
  assert.equal(new Set(entries.map(({ coverageId }) => coverageId)).size, 8)
  assert.equal(new Set(entries.map(({ step }) => step)).size, 8)
  assert.match(o1, /intake_gate_steps_required: \[S1, S2, S3, S4, S5, S6, S7, S8\]/)
  assert.match(o1, /O1_INTAKE_GATE_STEPS_INVALID/)
  assert.match(o1, /缺任一步、步骤重复、未知步骤 ID、检查语义与映射不符/)
  assert.match(o1, /可信续接绑定.*`contract-intake`.*补全或重做/)
  assert.match(o1, /不能将 `S6` 解释为唯一主合同/)
  assert.match(o1, /不能漏掉 `S8`/)

  const corpus = [persona, principles, matrixSkill].join('\n')
  assert.match(corpus, /`contract\.yaml#INV-001`.*Lead.*O0/)
  assert.match(corpus, /不得与矩阵 `check_id` 混用/)
  assert.doesNotMatch(o1, /coverage_id: S[1-8]/)
})

test('digest rules prefer FileDigest and bind a receipt to its registered input version', async () => {
  const [agentText, persona, principles, skill] = await Promise.all([
    source('agent.json'),
    source('persona.md'),
    source('principles.md'),
    source('skills/review-orchestration/SKILL.md'),
  ])
  const agent = JSON.parse(agentText)
  const corpus = [persona, principles, skill].join('\n')

  assert.ok(agent.tool_permissions.allowed.includes('FileDigest'))
  assert.ok(agent.tool_permissions.denied.includes('Bash'))
  assert.match(skill, /优先调用一次 `FileDigest`/)
  assert.match(skill, /aggregate\.digest/)
  assert.match(skill, /同一登记行/)
  assert.match(skill, /相同摘要不能替代其余字段/)
  assert.match(skill, /仅一份文件时，`paths` 必须是该文件的完整绝对裸路径字符串/)
  assert.match(skill, /多份文件时，`paths` 必须是完整集合的原生字符串数组/)
  assert.match(skill, /数组 JSON 文本误传为字符串.*参数格式错误/)
  assert.match(skill, /只可在同一已登记文件范围内纠正一次/)
  assert.match(skill, /不得沿用旧任务的失败诊断将其记为工具不可用/)
  assert.match(skill, /以单文件 aggregate 冒充完整清单/)
  assert.match(corpus, /格式提示不是无限重试的理由/)
  assert.match(corpus, /不得用 `Bash`|不使用 `Bash`/)
  assert.doesNotMatch(corpus, /当前平台无可用哈希工具|平台也没有内置哈希工具/)
})

test('O2 preserves a single bound extraction and target-owned artifact', async () => {
  const [persona, principles, skill] = await Promise.all([
    source('persona.md'),
    source('principles.md'),
    source('skills/review-orchestration/SKILL.md'),
  ])
  const o2 = section(skill, '### O2 条款抽取（第 3 步）', '### O3 法域注入 + 风险判读（第 4-5 步）')
  const delegateYaml = o2.match(/```yaml\ntarget: clause-extractor\n([\s\S]*?)```/)
  const corpus = [persona, principles, skill].join('\n')

  assert.ok(delegateYaml, 'O2 must contain Delegate parameters')
  assert.deepEqual(yamlFields(`target: clause-extractor\n${delegateYaml[1]}`), {
    target: 'clause-extractor',
    mode: 'sync',
    contextMode: 'isolated',
    intentId: '${case_id}:extract',
    contextReason: '合同案件条款结构化，供后续分析环节共同使用。',
  })
  assert.match(o2, /O2_WAITING_OR_UNKNOWN/)
  assert.match(o2, /O2_BINDING_UNAVAILABLE/)
  assert.match(o2, /不得对同一 `case_id:extract` 另发 `isolated`/)
  assert.match(o2, /child run \/ Work Context 为 `active` 或状态未知/)
  assert.match(o2, /v2 Compose\/contract 结果不合格/)
  assert.match(o2, /`artifact_path`/)
  assert.match(o2, /不得.*指定 `clauses\.yaml`/)
  assert.match(corpus, /成员在各自确认的 workspace 创建唯一产物/)
  assert.match(corpus, /不得以 `isolated` 重置计数/)
  assert.match(corpus, /等待超时不等于成员终止/)
})

test('rework uses only the current Delegate trusted continuation binding and reads the exact artifact path', async () => {
  const [persona, principles, skill] = await Promise.all([
    source('persona.md'),
    source('principles.md'),
    source('skills/review-orchestration/SKILL.md'),
  ])
  const o2 = section(skill, '### O2 条款抽取（第 3 步）', '### O3 法域注入 + 风险判读（第 4-5 步）')
  const o1 = section(skill, '### O1 输入治理（第 1-2 步）', '### O2 条款抽取（第 3 步）')
  const corpus = [persona, principles, skill].join('\n')

  assert.match(skill, /可信续接绑定是唯一 ID 来源/)
  assert.match(skill, /本次平台 `Delegate` 返回的受信续接指引/)
  assert.match(skill, /`target` 与 `child_run_id`/)
  assert.match(skill, /业务回执、`artifact_path` 所指文件、成员最终文本、工具摘要或其自报 ID 都不是可信来源/)
  assert.match(skill, /不是 action resume/)
  assert.match(skill, /已可信绑定且 child 为 `active` 或状态未知时，保持当前步骤 `waiting_or_unknown`/)
  assert.doesNotMatch(skill, /状态非终态一律 `HALTED_FOR_HUMAN`/)
  assert.doesNotMatch(skill, /receipt\.work_context_id/)
  assert.doesNotMatch(corpus, /最终回执中的.*work_context_id/)
  assert.match(o2, /不得删除 UUID 或 `agents` 路径段、不得猜测或重拼路径/)
  assert.match(o2, /对该精确路径执行真实 `Read`/)
  assert.match(o2, /该 Read 仅用于归属\/路径准入与人工调查/)
  assert.match(o2, /RC-1\.\.RC-6 不得形成替代自动放行路径/)
  assert.match(corpus, /不得凭最终文本或摘要完成 RC 检查/)
  assert.match(o1, /不删除 UUID 或 `agents` 路径段、不猜测或重拼/)
  assert.match(o1, /任一读取失败时不得凭最终文本、工具摘要或中间文件完成 RC-1\.\.RC-6/)
})

test('Clause v2 admission requires one Compose observation and never lets RC or Read release O3', async () => {
  const skill = await source('skills/review-orchestration/SKILL.md')
  const o2 = section(skill, '### O2 条款抽取（第 3 步）', '### O3 法域注入 + 风险判读（第 4-5 步）')
  assert.match(o2, /O2_CLAUSE_V2_COMPOSE_UNAVAILABLE/)
  assert.match(o2, /保持 HOLD/)
  assert.match(o2, /artifact、baseline、pinned_schema 与每个 delivered `part_<index>`/)
  assert.match(o2, /RC-1\.\.RC-6 不得形成替代自动放行路径/)
  assert.doesNotMatch(o2, /RC-1\.\.RC-6 通过后，Lead 才可.*进入 O3/)
  assert.match(o2, /required_names: \[artifact, baseline, pinned_schema, part_0\]/)
})
