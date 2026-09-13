/** Release-time compiler/checker; it is not installed in AgentFS. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseDocument } from 'yaml'

const args = process.argv.slice(2)
const rootIndex = args.indexOf('--team-root')
if (rootIndex < 0 || !args[rootIndex + 1]) throw new Error('TEAM_ROOT_REQUIRED')
const teamRoot = resolve(args[rootIndex + 1]); const write = args.includes('--write')
const TEAM_COMMIT = '8013a3a39aa20f6299f5007828e02facd95b257c'
const catalogPath = new URL('../skills/coverage-matrix/references/coverage-matrix-baseline.catalog.json', import.meta.url)
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const blob = (path) => Buffer.from(execFileSync('git', ['-C', teamRoot, 'show', `${TEAM_COMMIT}:${path}`]))
const yaml = (path) => {
  const bytes = blob(path)
  const document = parseDocument(bytes.toString('utf8'), { schema: 'core', strict: true, uniqueKeys: true, maxAliasCount: 0, merge: false, customTags: [] })
  if (document.errors.length) throw new Error(`CATALOG_YAML_INVALID:${path}`)
  return { bytes, value: document.toJSON() }
}
const entries = (value, key, path) => {
  const items = value?.[key]
  if (!Array.isArray(items) || items.some((item) => !item || typeof item.id !== 'string' || !item.id || typeof item.title !== 'string' || !item.title) || new Set(items.map((item) => item.id)).size !== items.length) throw new Error(`CATALOG_ENTRY_INVALID:${path}:${key}`)
  return items.map(({ id, title }) => ({ id, title }))
}
const intake = [
  ['S1', '受理范围清点'], ['S2', '主版本冻结'], ['S3', '页码连续性'], ['S4', '附件清单对账'], ['S5', '签署状态'], ['S6', '占位符检查'], ['S7', '主体与金额一致性'], ['S8', '版本矩阵对齐'],
].map(([suffix, check_title]) => ({ check_id: `CHK-INTAKE-${suffix}-${suffix === 'S1' ? 'SCOPE' : suffix === 'S2' ? 'MASTER-VERSION' : suffix === 'S3' ? 'PAGE-RANGE' : suffix === 'S4' ? 'ATTACHMENT-MANIFEST' : suffix === 'S5' ? 'EXECUTION-STATUS' : suffix === 'S6' ? 'PLACEHOLDER' : suffix === 'S7' ? 'PARTY-AND-AMOUNT' : 'VERSION-MATRIX'}`, check_title, check_source: `contract-intake.receipt.checks#${suffix}`, stage: 1, owner_agent: 'contract-intake' }))
const closure = [
  ['CLOSURE-COMPLETENESS', '审查完整性'], ['CLOSURE-CONSISTENCY', '审查一致性'], ['CLOSURE-BLOCKING-RISK', '阻断风险闭合'], ['CLOSURE-SUBSTANTIVE-TERMS', '实质条款闭合'], ['CLOSURE-DOCUMENT', '文档交付闭合'],
].map(([check_id, check_title]) => ({ check_id, check_title, check_source: `blueprint#section-15/${check_id}`, stage: 6, owner_agent: 'review-reporter' }))
const paths = { missing: 'shared/resources/jurisdiction-packs/base/missing-clauses.yaml', market: 'shared/resources/jurisdiction-packs/base/market-benchmarks.yaml', customPack: 'shared/resources/jurisdiction-packs/custom/pack.yaml', customRedlines: 'shared/resources/jurisdiction-packs/custom/redlines.yaml' }
const missing = yaml(paths.missing); const market = yaml(paths.market); const customPack = yaml(paths.customPack); const customRedlines = yaml(paths.customRedlines)
const missingEntries = entries(missing.value, 'checks', paths.missing); const marketEntries = entries(market.value, 'benchmarks', paths.market)
const customPackMeta = customPack.value?.meta; const customRedlinesMeta = customRedlines.value?.meta; const redlines = customRedlines.value?.redlines
if (customPackMeta?.pack_id !== 'custom' || customRedlinesMeta?.pack_id !== customPackMeta.pack_id || typeof customPackMeta.pack_version !== 'string' || !customPackMeta.pack_version || customRedlinesMeta?.pack_version !== customPackMeta.pack_version || !Array.isArray(redlines) || redlines.length !== 8 || customRedlinesMeta.entries_total !== redlines.length || customRedlinesMeta.entries_enabled !== 0 || redlines.some((entry) => !entry || typeof entry.id !== 'string' || !entry.id || entry.enabled !== false) || new Set(redlines.map((entry) => entry.id)).size !== redlines.length) throw new Error('CATALOG_CUSTOM_POLICY_DRIFT')
const fixed_rows = [...intake, ...missingEntries.map(({ id, title }) => ({ check_id: id, check_title: title, check_source: `base/missing-clauses.yaml#${id}`, stage: 2, owner_agent: 'clause-extractor' })), ...marketEntries.map(({ id, title }) => ({ check_id: id, check_title: title, check_source: `base/market-benchmarks.yaml#${id}`, stage: 3, owner_agent: 'risk-scanner' })), ...closure]
if (fixed_rows.length !== 26 || new Set(fixed_rows.map((row) => row.check_id)).size !== 26 || fixed_rows.some((row) => row.check_id === 'INV-001-MAIN-CONTRACT')) throw new Error('CATALOG_FIXED_ROWS_INVALID')
const jurisdiction_catalogs = ['jurisdiction-cn', 'jurisdiction-us'].map((slug) => {
  const path = `shared/resources/jurisdiction-packs/${slug}/rules.yaml`; const input = yaml(path)
  const rules = entries(input.value, 'rules', path); const conflicts = entries(input.value, 'conflicts', path)
  if (new Set([...rules, ...conflicts].map((item) => item.id)).size !== rules.length + conflicts.length) throw new Error(`CATALOG_CROSS_SECTION_DUPLICATE:${slug}`)
  return { sha256: sha(input.bytes), rules, conflicts }
})
const fixedIds = new Set(fixed_rows.map((row) => row.check_id))
if (jurisdiction_catalogs.some(({ rules, conflicts }) => [...rules, ...conflicts].some(({ id }) => fixedIds.has(id)))) throw new Error('CATALOG_CROSS_SOURCE_DUPLICATE')
const expected = { format: 'coverage-matrix-baseline-v1', source_commit: TEAM_COMMIT, sources: { missing_clauses: { sha256: sha(missing.bytes), ids: missingEntries.map((item) => item.id) }, market_benchmarks: { sha256: sha(market.bytes), ids: marketEntries.map((item) => item.id) }, custom_pack: { sha256: sha(customPack.bytes), ids: [] }, custom_redlines: { sha256: sha(customRedlines.bytes), ids: [] } }, fixed_rows, jurisdiction_catalogs }
if (write) await writeFile(catalogPath, `${JSON.stringify(expected, null, 2)}\n`, 'utf8')
const actual = JSON.parse(await readFile(catalogPath, 'utf8'))
if (!isDeepStrictEqual(actual, expected)) throw new Error('CATALOG_COMPILED_OUTPUT_DRIFT')
process.stdout.write(`${JSON.stringify({ source_commit: TEAM_COMMIT, catalog_sha256: sha(await readFile(catalogPath)), fixed_rows: fixed_rows.length, jurisdiction_catalogs: jurisdiction_catalogs.map(({ sha256, rules, conflicts }) => ({ sha256, rules: rules.length, conflicts: conflicts.length })), custom: 'loaded_zero_enabled', wrote: write })}\n`)
