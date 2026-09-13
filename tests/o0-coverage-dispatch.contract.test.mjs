import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)

test('O0 loads the coverage policy and closes its row-derived arithmetic before the first Delegate', async () => {
  const skill = await readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8')

  assert.match(skill, /实际调用 `Skill` 装载 `coverage-matrix`/)
  assert.match(skill, /coverage-matrix\.yaml.*立即 `Read` 回读 exact 文件/s)
  assert.match(skill, /只从该次回读的实际 `rows` 计算 `total` 与五态计数/)
  assert.match(skill, /denominator = covered \+ blank \+ blocked \+ deferred.*大于零.*真实 `MathCalc`.*called: true.*非空 `coverage_rate`/s)
  assert.match(skill, /只有分母恰为零时才可写 `NO_RATE_DENOMINATOR` 与 `called: false`/)
  assert.match(skill, /随后再次 `Read` exact 矩阵.*total == rows\.length.*五态计数和等于 total.*MathCalc\/零分母分支一致/s)
})

test('invalid O0 coverage arithmetic holds before dispatch instead of carrying an empty-template marker forward', async () => {
  const skill = await readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8')

  assert.match(skill, /空模板的零分母标记带到非空矩阵.*O0_COVERAGE_MATRIX_INVALID.*HOLD.*intake `not_started`.*不得 Delegate/s)
  assert.match(skill, /只有该闭环成功后才写 `orchestration-ledger\.yaml`/)
})