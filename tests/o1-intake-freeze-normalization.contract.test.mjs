import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { readOrchestrationPolicy } from './helpers/orchestration-policy.mjs'

const root = new URL('..', import.meta.url)
const source = (path) => readFile(new URL(path, root), 'utf8')

test('O1 mirrors the four receipt freeze booleans and rejects a false all_frozen claim', async () => {
  const [skill, principles] = await Promise.all([
    readOrchestrationPolicy(root),
    source('principles.md'),
  ])

  assert.match(skill, /`freeze\.master_version\.frozen`、`freeze\.page_range\.frozen`、`freeze\.attachment_manifest\.frozen`、`freeze\.execution_status\.frozen`/)
  assert.match(skill, /normalized_all_frozen = master_version && page_range && attachment_manifest && execution_status/)
  assert.match(skill, /`receipt\.all_frozen` 必须与该 AND 完全相等.*O1_INTAKE_FREEZE_NORMALIZATION_INVALID.*停在 O1.*不进入 O2/s)
  assert.match(skill, /不得用 O0 值、文字摘要、`unsigned_draft` 例外或 `verdict` 提升任何一项/)
  assert.match(skill, /只有 `normalized_all_frozen === true` 且回执 `consistency_conclusion_allowed === true` 时才写 `version_compare_allowed: true`/)
  assert.ok(skill.indexOf('四冻结逐字段镜像后再归一') < skill.indexOf('- 读 `verdict` 字段'), 'freeze normalization must precede any O2 verdict transition')
  assert.match(principles, /四个 `freeze\.\*\.frozen`.*逐字段镜像.*`receipt\.all_frozen` 与 AND 不符即打回/s)
})

test('RC-1 keeps the complete submission manifest separate from the current-contract subset', async () => {
  const [skill, principles] = await Promise.all([
    readOrchestrationPolicy(root),
    source('principles.md'),
  ])

  assert.match(skill, /`input_inventory\.submission_inventory_manifest_digest` 与 `input_inventory\.current_contract_manifest_digest`/)
  assert.match(skill, /总提交摘要不等即 RC-1 无效，即使当前合同子集摘要相等也不得降级为 `conditional`、不得进入 O2/s)
  assert.match(skill, /返回 `contract-intake` 修正其回执.*Lead 不得编辑回执/s)
  assert.match(skill, /不得把已知不相等当 unknown/)
  assert.match(principles, /总提交摘要不等时即使合同子集相同也须退回 Intake，不能降级 conditional/)
})
