import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)

test('O0 loads the coverage policy and keeps the row-derived comparison candidate pending without MathCalc', async () => {
  const skill = await readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8')

  assert.match(skill, /实际调用 `Skill` 装载 `coverage-matrix`/)
  assert.match(skill, /coverage-matrix\.yaml.*立即 `Read` 回读 exact 文件/s)
  assert.match(skill, /只从该次回读的实际 `rows` 计算 `total` 与五态计数/)
  assert.match(skill, /denominator = covered \+ blank \+ blocked \+ deferred.*大于零.*`expected_coverage_rate`.*pending_trusted_delegate_proof/s)
  assert.match(skill, /Lead coverage 在 O0 不另调 MathCalc/)
  assert.match(skill, /只有分母恰为零时.*`NO_RATE_DENOMINATOR`.*且不造 ratio/s)
  assert.match(skill, /不得写 `called: true`、自造历史回执或把候选称为可信覆盖率/)
  assert.match(skill, /随后再次 `Read` exact 矩阵.*total == rows\.length.*五态计数和等于 total.*候选\/零分母分支一致/s)
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
