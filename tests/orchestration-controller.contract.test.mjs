import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const controllerPath = 'skills/review-orchestration/SKILL.md'
const procedures = [
  'global-invariants-and-state.md', 'o0-registration.md', 'o1-intake.md', 'o2-clause.md', 'o3-analysis.md', 'o4-reporting.md',
  'o5-human-gate.md', 'o6-delivery.md', 'delegate-and-handoffs.md', 'receipt-audit.md', 'integrity-and-checklist.md',
]

test('short Lead controller names every lazy procedure and closes O0 before Intake dispatch', async () => {
  const controller = await readFile(new URL(controllerPath, root), 'utf8')
  assert.ok(Buffer.byteLength(controller, 'utf8') <= 12 * 1024, 'always-loaded controller stays bounded')
  for (const name of procedures) {
    const path = `skills/review-orchestration/references/procedure/${name}`
    const controllerReference = `references/procedure/${name}`
    assert.match(controller, new RegExp(controllerReference.replaceAll('.', '\\.')))
    assert.ok((await stat(new URL(path, root))).isFile(), `${path} exists`)
  }
  assert.match(controller, /首次 `Write` 后必须立即 `Read` 同一 exact 矩阵/)
  assert.match(controller, /不得 Delegate.*不得询问用户.*不得用 `review-context\.yaml` 替换 `coverage-matrix\.yaml`/s)
  assert.match(controller, /O0 不能写 Intake receipt 派生的 `freeze`、`all_frozen`、S8 状态或版本一致性结论/)
  assert.match(controller, /完整审查仍继续 O1 输入治理；该 pending 只约束相应结论，不是 O0 后停止/)
})

test('stance routing distinguishes an explicit user statement from verified submitted business context', async () => {
  const [controller, registration] = await Promise.all([
    readFile(new URL(controllerPath, root), 'utf8'),
    readFile(new URL('skills/review-registration/SKILL.md', root), 'utf8'),
  ])
  for (const text of [controller, registration]) {
    assert.match(text, /当前请求本身明确说出审查主体\/立场时，才可使用 `user_statement`/)
    assert.match(text, /只来自已明确纳入、逐字段回读核验的业务上下文时，必须使用 `submitted_business_context`/)
    assert.match(text, /“请审查材料”等泛化请求/)
  }
})