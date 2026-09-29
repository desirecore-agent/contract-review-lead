import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('O1 remains sync isolated, blocked cannot pass, conditional continues', async () => {
  const [persona, principles, orchestration] = await Promise.all([
    read('persona.md'), read('principles.md'), read('skills/review-orchestration/SKILL.md'),
  ])
  const corpus = [persona, principles, orchestration].join('\n')
  assert.match(orchestration, /"target": "contract-intake"[\s\S]*"mode": "sync"[\s\S]*"contextMode": "isolated"[\s\S]*"contextReason":/)
  assert.match(corpus, /Lead 不写 intake 回执|不代写 O1/)
  assert.match(corpus, /`blocked`.*停止|O1 blocked.*停止/s)
  assert.match(corpus, /`passed`.*`conditional`.*进入 O2/s)
  assert.match(corpus, /conditional.*pending.*继续/s)
})

test('execution graph has true O3 parallel and two isolated reporter calls', async () => {
  const skill = await read('skills/review-orchestration/SKILL.md')
  assert.match(skill, /"targets": \["risk-scanner", "jurisdiction-auditor"\]/)
  assert.match(skill, /"mode": "fan-out"[\s\S]*"strategy": "parallel"[\s\S]*"contextSelections":/)
  assert.match(skill, /"intentId": "\$\{case_id\}:o4-independent-verification"/)
  assert.match(skill, /"intentId": "\$\{case_id\}:o5-report-delivery"/)
  assert.doesNotMatch(skill, /\n\s*"skill(?:s)?"\s*:/)
  assert.match(skill, /"childContext": \{ "memoryScope": "none" \}/)
  assert.match(skill, /禁止传 O3 推理、严重度、评分、建议/)
})

test('coverage goals are seven fixed rows and not nonexistent S1-S8 rows', async () => {
  const [coverage, orchestration] = await Promise.all([
    read('skills/coverage-matrix/SKILL.md'), read('skills/review-orchestration/SKILL.md'),
  ])
  for (const id of ['input-integrity','clause-facts','jurisdiction','risk','independent-review','version-comparison','report-and-delivery']) {
    assert.match(coverage, new RegExp('`' + id + '`'))
  }
  assert.doesNotMatch([coverage, orchestration].join('\n'), /contract-intake#S1|S1–S8/)
})

test('digest failure continues and direction vocabulary is canonical', async () => {
  const corpus = [await read('persona.md'), await read('principles.md'), await read('skills/review-orchestration/SKILL.md')].join('\n')
  assert.match(corpus, /frozen_without_digest/)
  assert.match(corpus, /继续事实审查|继续 O1/)
  assert.match(corpus, /up\/down\/flat\/undetermined|`up`、`down`、`flat`、`undetermined`/)
  assert.match(corpus, /单版本.*not_applicable/)
  assert.doesNotMatch(corpus, /risk_direction:\s*(rising|falling|n\/a)/)
})

test('agent model block and permissions retain expected safety boundaries', async () => {
  const agent = JSON.parse(await read('agent.json'))
  assert.equal(agent.version, '1.0.22')
  assert.equal(agent.llm.routingMode, 'smart')
  assert.equal(agent.llm.smart.profile.tier, 'flagship')
  assert.ok(agent.tool_permissions.denied.includes('Bash'))
  assert.ok(agent.tool_permissions.allowed.includes('AskUserQuestion'))
  assert.equal(agent.tools.ask_user_question.wait_mode, 'always_wait')
  assert.equal(agent.tool_permissions.allowed.includes('ExportRedlineDocument'), false)
})

test('Lead can expose the real structured validator to its intake child without enabling shell or changing routing', async () => {
  const agent = JSON.parse(await read('agent.json'))
  assert.ok(agent.tool_permissions.allowed.includes('StructuredFileValidate'))
  assert.equal(agent.tool_permissions.denied.includes('StructuredFileValidate'), false)
  assert.ok(agent.tool_permissions.denied.includes('Bash'))
  const skill = await read('skills/review-orchestration/SKILL.md')
  assert.match(skill, /tools:.*StructuredFileValidate/)
  assert.match(skill, /StructuredFileValidate.*document.*schema.*format/)
  assert.match(skill, /校验工具调用失败.*不启动下游/)
})
