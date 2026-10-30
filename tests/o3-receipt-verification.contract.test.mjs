import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readSkill = () => readFile(path.join(root, 'skills/review-orchestration/SKILL.md'), 'utf8')
const o3Of = (skill) => skill.slice(skill.indexOf('## O3 真正并行'), skill.indexOf('## O4 独立取证'))
const patternAfter = (text, label) => {
  const m = text.match(new RegExp(`${label} \`pattern: "([^"]+)"\``))
  assert.ok(m, `找不到「${label}」的判据正则`)
  return m[1]
}

// 2026-10-30 真机：成员虚报完成，Lead 先按回复记 covered；续跑被拒后又把虚报内容抄进重派任务
test('O3 回收以产物与回执为准，虚报完成按回报失败处理，续跑被拒时点名产物 id 重派', async () => {
  const o3 = o3Of(await readSkill())
  assert.match(o3, /覆盖矩阵只按核对过的产物与回执更新，成员回复里的完成声明与统计不作数/)
  assert.match(o3, /骨架字段只看各支技能交付前自检的那几项/)
  assert.match(o3, /其他字段里的 `null`（如回执的 `blocked_reason`、转介观察的 `rule_ref`）是合法取值，不算占位/)
  assert.match(o3, /优先用 `DelegateControl` 的 `resume` 续跑一次/)
  assert.match(o3, /平台因该运行已正常结束而拒绝 `resume` 时，改用 `Delegate`（`contextMode: continue`，`workContextId` 照抄拒绝消息里给出的值），在任务里点名续写该产物 id，并写明产物绝对路径与 canonical 根/)
  assert.match(o3, /除第 4 条的点名续写外，只有任务本身需要重新定义时才重新 Delegate/)
  assert.match(o3, /再用一次 `literals` 查 `<<追加`/)
  const items = [...o3.matchAll(/^(\d)\. \*\*/gm)].map((m) => m[1])
  assert.deepEqual(items, ['1', '2', '3', '4', '5', '6', '7'], '回收规则拆成编号小条')
  assert.match(o3, /不照抄成员回复里声称已完成的条目、统计或观察清单，也不替它另列检查项/)
})

test('虚报判据只命中骨架字段：未写的骨架行命中，合法的 null 与已完成的值不误判', async () => {
  const o3 = o3Of(await readSkill())
  const jur = new RegExp(patternAfter(o3, '法域'), 'm')
  const risk = new RegExp(patternAfter(o3, '风险'), 'm')
  for (const indent of ['', '  ']) {
    assert.ok(jur.test(`${indent}rule_candidates: null`), '法域骨架字段未写必须命中')
    assert.ok(!jur.test(`${indent}rule_candidates: []`))
    assert.ok(risk.test(`${indent}coverage_debt: {status: deferred}`), '风险 coverage_debt 仍为 deferred 必须命中')
    assert.ok(risk.test(`${indent}redlines: { status: deferred }`))
    assert.ok(!risk.test(`${indent}coverage_debt: {status: none}`))
    assert.ok(!risk.test(`${indent}coverage_debt: {status: open, items: [rt-a]}`), '有未处理项的合法写法不误判')
    assert.ok(!risk.test(`${indent}coverage_debt: {status: deferred_items}`), 'deferred 前缀的其他词不误判')
  }
  for (const legit of ['blocked_reason: null', '    - {finding_id: "JUR-001", rule_ref: null}', '      clause_ref: null', '  - {id: "rt-a", status: hitlist}']) {
    assert.ok(!jur.test(legit) && !risk.test(legit), `合法取值不应判为占位：${legit}`)
  }
  assert.ok(risk.test('  - {id: "rt-a", severity: important, status: hit, lines: [12]}'), '词条仍为 hit 必须命中')
})

// 判据与成员技能自检同源：成员仓库与本仓库并列检出时核对一致，单独检出时跳过
test('Lead 的判据与两支成员技能的交付前自检一致', async (t) => {
  const o3 = o3Of(await readSkill())
  let jurSkill, riskSkill
  try {
    ;[jurSkill, riskSkill] = await Promise.all([
      readFile(path.resolve(root, '../jurisdiction-auditor/skills/jurisdiction-audit/SKILL.md'), 'utf8'),
      readFile(path.resolve(root, '../risk-scanner/skills/risk-scanning/SKILL.md'), 'utf8'),
    ])
  } catch {
    t.skip('未并列检出成员仓库')
    return
  }
  const memberPattern = (skill, heading) => skill.split(heading)[1].match(/删锚点之前先自检：用一次 `Grep`（`pattern: "([^"]+)"`/)[1]
  assert.equal(patternAfter(o3, '法域'), memberPattern(jurSkill, '### J5 交付'))
  const riskMember = memberPattern(riskSkill, '### R5 交付')
  const riskLead = patternAfter(o3, '风险')
  // Lead 额外核对 coverage_debt（成员在自检之后才写它），其余分支与成员自检相同
  assert.equal(riskLead.replace('(redlines|coverage_debt)', 'redlines'), riskMember)
})

test('O4 的读白名单包含 O4 回执本身，供分段写入回读与续跑', async () => {
  const skill = await readSkill()
  assert.match(skill, /O4 的 `read_allowlist` 同时列入 `write_allowlist` 里的 O4 回执路径，供分段写入时回读、`Edit` 与续跑/)
})
