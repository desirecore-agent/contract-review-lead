// 用选定平台检出自带的 tsx（及其 tsconfig 别名）运行路由规范化不动点测试。
// 规范化模块的依赖链含 TypeScript 参数属性，Node 的 strip-types 模式无法加载。
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const platformArg = process.env.CONTRACT_PLATFORM_SOURCE
if (!platformArg || !path.isAbsolute(platformArg)) {
  console.error('CONTRACT_PLATFORM_SOURCE must be an absolute platform checkout with installed dependencies')
  process.exit(2)
}
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const tsxCli = path.join(platformArg, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const result = spawnSync(process.execPath, [
  tsxCli, '--tsconfig', path.join(platformArg, 'tsconfig.json'),
  '--test', '--test-concurrency=1', path.join(root, 'tests', 'routing-normalize.contract.test.mjs'),
], { stdio: 'inherit', cwd: root })
process.exit(result.status ?? 1)
