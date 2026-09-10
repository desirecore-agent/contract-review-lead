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

test('agent version is semantic and O1 has the required isolated sync Delegate contract', async () => {
  const [agentText, skill] = await Promise.all([source('agent.json'), source('skills/review-orchestration/SKILL.md')])
  const agent = JSON.parse(agentText)
  const o1 = section(skill, '### O1 输入治理（第 1-2 步）', '### O2 条款抽取（第 3 步）')
  const delegateYaml = o1.match(/```yaml\n([\s\S]*?)```/)

  assert.match(agent.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  assert.ok(delegateYaml, 'O1 must contain Delegate parameters')
  assert.deepEqual(yamlFields(delegateYaml[1]), {
    target: 'contract-intake',
    mode: 'sync',
    contextMode: 'isolated',
    intentId: '${case_id}:intake',
    contextReason: '合同案件输入治理与受理门禁。',
  })
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
  assert.match(invalidRule, /work_context_id/)
  assert.match(invalidRule, /contextMode: continue/)
  assert.match(invalidRule, /HALTED_FOR_HUMAN/)
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
  assert.match(corpus, /不得用 `Bash`|不使用 `Bash`/)
  assert.doesNotMatch(corpus, /当前平台无可用哈希工具|平台也没有内置哈希工具/)
})
