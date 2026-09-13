import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)

test('O0 loads the coverage policy and keeps the row-derived comparison candidate pending without MathCalc', async () => {
  const skill = await readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8')

  assert.match(skill, /实际调用 `Skill` 装载 `coverage-matrix`/)
  assert.match(skill, /首次矩阵 `Write` 前.*分别 `Read` `references\/coverage-matrix-bucket-summary\.schema\.json` 与 `references\/coverage-matrix-bucket-summary\.descriptor\.json`/s)
  assert.match(skill, /含 `%` 的两位字符串.*`0\.00%`、`25\.00%`.*不是 `0\.00` 或裸数/s)
  assert.match(skill, /coverage-matrix\.yaml.*立即 `Read` 回读 exact 文件/s)
  assert.match(skill, /只从该次回读的实际 `rows` 计算 `total` 与五态计数/)
  assert.match(skill, /denominator = covered \+ blank \+ blocked \+ deferred.*大于零.*`expected_coverage_rate`.*pending_trusted_delegate_proof/s)
  assert.match(skill, /Lead coverage 在 O0 不另调 MathCalc/)
  assert.match(skill, /只有分母恰为零时.*`NO_RATE_DENOMINATOR`.*且不造 ratio/s)
  assert.match(skill, /不得写 `called: true`、自造历史回执或把候选称为可信覆盖率/)
  assert.match(skill, /随后再次 `Read` exact 矩阵.*total == rows\.length.*五态计数和等于 total.*候选\/零分母分支一致/s)
})

test('O0 enumerates the complete resolved jurisdiction source before dispatch without deciding applicability', async () => {
  const skill = await readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8')

  assert.match(skill, /`rules\.yaml` 必须保留根级 `rules\[\]` 与 `conflicts\[\]` 两个完整数组/)
  assert.match(skill, /不得在 O0 按合同类型、`mandatory`、`detection`、`trigger`、关键词或 Lead 对合同事实的理解筛掉条目/)
  assert.match(skill, /`rules\[\]` 与 `conflicts\[\]` 的每个唯一 ID 全部投影为 stage 4、`jurisdiction-auditor` 所有、初始 `blank`/)
  assert.match(skill, /验证发现集合与行集合双向完全相等/)
  assert.match(skill, /不得先判断适用性\/trigger，不得漏冲突条目/)
  assert.match(skill, /分支合格本身不表示其全部行 `covered`/)
  assert.match(skill, /未声明行保持 `blank`/)
  assert.match(skill, /未证明的行保持 `blank`，不得因分支合格批量翻成 `covered`/)
  assert.doesNotMatch(skill, /两支均合格[^\n]*矩阵对应行翻 `covered`/)
  assert.doesNotMatch(skill, /两支都合格[^\n]*各自负责的 `check_id` 翻 `covered`/)
})

test('O3 consumes the Jurisdiction artifact array by exact discovered tuple and same-artifact evidence', async () => {
  const skill = await readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8')

  assert.match(skill, /实际 `Read` 该分支返回的 `artifact_path`.*`jurisdiction\.coverage_updates` 读取权威数组/s)
  assert.match(skill, /`coverage_updates_ref`.*`coverage_updates_count` 只用于定位与对账，不是权威数据/s)
  assert.match(skill, /ref\/path\/pointer 或 count\/实际数组长度不一致时回执不合格.*数组最多 8000 项/s)
  assert.match(skill, /`rule_id`、`section`、`check_source`、`status`、`reason`、`evidence_refs`/)
  assert.match(skill, /`section` 只能是 `rules\|conflicts`/)
  assert.match(skill, /`status` 只能是 `covered\|not_applicable\|blank\|blocked\|deferred`/)
  assert.match(skill, /`governed_by_edges\|compliance_findings\|conflict_findings\|coverage_gaps\|human_gates`/)
  assert.match(skill, /完整 tuple 集合.*逐项唯一、无缺失无额外地完全相等/s)
  assert.match(skill, /每个非 `blank` 状态必须有非空 `reason` 和至少一个可在\*\*同一实际产物\*\*.*按 `id` 精确解析/s)
  assert.match(skill, /`blank` 只有在 reason 明确为 locked、unknown、unassessed 或 pending 时才可为空 refs/)
  assert.match(skill, /任何数组缺失、重复、额外 ID、section\/source 不符、引用不存在或证据不支持.*相关行保持 `blank`/s)
  assert.match(skill, /只有完整集合与逐项引用全部通过后.*机械更新对应唯一行/s)
})

test('invalid O0 coverage arithmetic holds before dispatch instead of carrying an empty-template marker forward', async () => {
  const skill = await readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8')

  assert.match(skill, /空模板的零分母标记带到非空矩阵.*O0_COVERAGE_MATRIX_INVALID.*HOLD.*intake `not_started`.*不得 Delegate/s)
  assert.match(skill, /只有该闭环成功后才写 `orchestration-ledger\.yaml`/)
})

test('only a current successful Delegate proof may promote trusted calculation actuals', async () => {
  const skill = await readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8')

  assert.match(skill, /成功正文末尾的完整 `\{"verified_preconditions"/)
  assert.match(skill, /`child_run_id` 只能从该同一次成功 Delegate 的\s*模型可见正文标记 `\[子会话 runId: <真实值>\]` 原样取得/s)
  assert.match(skill, /不能读取 metadata/)
  assert.match(skill, /`preconditions\[\]\.proofIndexes`.*去重 `proofs\[\]`/s)
  assert.match(skill, /`FileDigest` 复核 exact.*所索引 proof.*`document_sha256`/s)
  assert.match(skill, /不得从矩阵、旧旁车、工具摘要或自身文字.*可信 proof/s)
})

test('any post-O0 matrix edit invalidates the admission proof and final delivery uses current-read MathCalc', async () => {
  const [orchestration, coverage] = await Promise.all([
    readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8'),
    readFile(new URL('skills/coverage-matrix/SKILL.md', root), 'utf8'),
  ])

  assert.match(coverage, /O1 及以后任意矩阵 `Write` \/ `Edit` 都使它\s*对当前矩阵失效/s)
  assert.match(coverage, /不得重派 Intake 来刷新覆盖率/)
  assert.match(coverage, /`H1 === H2`/)
  assert.match(coverage, /五次真实 `MathCalc`.*`expression: "sum\(flags\)"`/s)
  assert.match(coverage, /covered \+ blank \+ blocked \+ deferred/)
  assert.match(coverage, /covered \/ denominator \* 100/)
  assert.match(coverage, /`H3 === H1`/)
  assert.match(coverage, /矩阵再变即整体失效/)
  assert.match(orchestration, /进入 O6 前.*当前矩阵的最终 MathCalc 旁车/s)
  assert.match(orchestration, /不得修改被 hash 的矩阵或 Reporter 原产物/)
  assert.match(orchestration, /交付正文不得输出覆盖率数值/)
})
