import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

// 平台注册 Agent 时会规范化 llm 路由配置；规范化改动了对象（哪怕只是键顺序），
// 平台就会改写 agent.json 并自动提交，团队锁里的 contentHash 随即对不上，
// 统筹官一装完就被判为「偏离锁」，后续升级会被当成用户改过而跳过。
// 2026-10-29 真机安装时实测：llm.reasoning 写在 smart 之前即触发。
// 本测试要求 agent.json 是平台规范化的不动点。
const platformArg = process.env.CONTRACT_PLATFORM_SOURCE
assert.ok(platformArg, 'set CONTRACT_PLATFORM_SOURCE to the absolute contract-platform path')
const platform = path.resolve(platformArg)
const normalizePath = path.join(platform, 'packages/agent-service/src/compute/routing/agent-routing-normalize.ts')
const { completeLegacyFixedRoutingConfig, normalizeSmartRoutingProfileConfig } = await import(pathToFileURL(normalizePath).href)

test('agent.json is a fixed point of the platform routing normalization', async () => {
  assert.equal(typeof completeLegacyFixedRoutingConfig, 'function')
  assert.equal(typeof normalizeSmartRoutingProfileConfig, 'function')
  const source = JSON.parse(await readFile(new URL('../agent.json', import.meta.url), 'utf8'))
  const normalized = structuredClone(source)
  completeLegacyFixedRoutingConfig(normalized)
  normalizeSmartRoutingProfileConfig(normalized)
  assert.equal(JSON.stringify(normalized), JSON.stringify(source),
    'platform would rewrite agent.json on install; reorder llm keys to the normalized form')
})
