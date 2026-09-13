import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { readOrchestrationPolicy } from './helpers/orchestration-policy.mjs'

const root = new URL('..', import.meta.url)
const source = (path) => readFile(new URL(path, root), 'utf8')

function o1(skill) {
  const start = skill.indexOf('### O1 输入治理（第 1-2 步）')
  const end = skill.indexOf('### O2 条款抽取（第 3 步）', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  return skill.slice(start, end)
}

function ledgerGate(skill) {
  const start = skill.indexOf('### 编排账本状态写入硬闸')
  const end = skill.indexOf('### O1 输入治理（第 1-2 步）', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  return skill.slice(start, end)
}

test('O1 final validation uses the last immediate result and failure only permits honest HOLD bookkeeping', async () => {
  const policy = o1(await readOrchestrationPolicy(root))
  assert.match(policy, /最后一次.*紧邻 Delegate 的结果为准/)
  assert.match(policy, /较早的 `valid: true` 不能覆盖其后的 timeout、工具 error、`valid: false`、不匹配或没有明确成功结果/)
  assert.match(policy, /只允许以真实错误码\/结果写入 `O1_FINAL_STRUCTURE_VALIDATION_FAILED` 的 `H`（HOLD）记账/)
  assert.match(policy, /保持 intake `not_started`；不得写 `O1_INTAKE`、`dispatched` 或 `waiting_or_unknown`，\*\*不得 Delegate\*\*/)
  assert.match(policy, /只有修改这两个被校验 exact 文件中的任一文件才使该文件旧校验失效/)
  assert.match(policy, /账本、矩阵、回执路径或其他未被本闸门校验的产物编辑本身不触发这两个文档的重验/)
})

test('O1 blocking sync ledger records only post-return public facts and separates audit from continuation', async () => {
  const [skill, persona, principles] = await Promise.all([
    readOrchestrationPolicy(root), source('persona.md'), source('principles.md'),
  ])
  const policy = ledgerGate(skill)
  const corpus = [persona, principles].join('\n')
  assert.match(policy, /`mode: sync` 在调用方可见返回前会阻塞/)
  assert.match(policy, /首次 O1 `Delegate` 前和该工具阻塞期间必须保持 `status: O0_REGISTERED` 与 intake `steps\[\*\]\.status: not_started`/)
  assert.match(policy, /不得预填 `dispatched_at`、`waiting_or_unknown`、`child_run_id` 或 `work_context_id`/)
  assert.match(policy, /只有 `Delegate` 成功返回后.*模型可见且本次实际目标的 `target`、模型可见的非空 `child_run_id` 与实际 `returned_at`/s)
  assert.match(policy, /在 `run_ids` 保留已有 lead run 并追加该真实 child run/)
  assert.match(policy, /`steps\[\*\]\.status: returned`/)
  assert.match(policy, /`work_context_id` 只可在本次平台返回的\*\*公开可信续接 binding\*\*确实提供时原样登记/)
  assert.match(policy, /普通 sync 返回没有该 binding 时不得猜测、补写或为了补齐而另发委派，且不得 `contextMode: continue`/)
  assert.match(policy, /由回执 RC 决定第 1-2 步为 `completed` 并转 `O2_EXTRACT`，或写入 `H`/)
  assert.match(corpus, /调用前与阻塞期间保持 `O0_REGISTERED` \/ intake `not_started`/)
  assert.match(corpus, /公开可信续接 binding 未提供 `work_context_id` 时不得 `continue`/)
})
