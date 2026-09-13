import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PROTOCOL = 'desirecore.script.snapshot.v1'
const RELEASED_CATALOG_SHA256 = '30bf6e161e96cb4b3536fc9dce623c49d19506b5bc2241c23d80c23f9951977d'
const HEX = /^[a-f0-9]{64}$/
const fail = (code) => { throw new Error(code) }
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const decode = (input) => {
  if (!input || input.encoding !== 'base64' || !HEX.test(input.sha256 ?? '') || typeof input.content !== 'string') fail('COVERAGE_BASELINE_INPUT_INVALID')
  const bytes = Buffer.from(input.content, 'base64')
  if (bytes.length !== input.size || sha256(bytes) !== input.sha256) fail('COVERAGE_BASELINE_SNAPSHOT_HASH_MISMATCH')
  return bytes
}
const parseJson = (bytes, code) => { try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { fail(code) } }
const blank = (row, generatedAt, reason = 'awaiting owner receipt') => ({ ...row, status: 'blank', not_covered_reason: reason, updated_at: generatedAt })
const summary = (rows) => {
  const counts = { covered: 0, blank: 0, blocked: 0, deferred: 0, not_applicable: 0 }
  for (const row of rows) { if (!Object.hasOwn(counts, row.status)) fail('COVERAGE_BASELINE_ROW_STATUS_INVALID'); counts[row.status] += 1 }
  const denominator = counts.covered + counts.blank + counts.blocked + counts.deferred
  const calculation_candidate = denominator === 0
    ? { status: 'pending_trusted_delegate_proof', branch: 'zero_denominator', denominator: 0, coverage_rate: null, coverage_rate_reason: 'NO_RATE_DENOMINATOR' }
    : { status: 'pending_trusted_delegate_proof', branch: 'positive_denominator', expression: 'covered / (covered + blank + blocked + deferred) * 100', scope: { covered: counts.covered, blank: counts.blank, blocked: counts.blocked, deferred: counts.deferred }, denominator, expected_coverage_rate: `${(counts.covered * 100 / denominator).toFixed(2)}%` }
  return { total: rows.length, ...counts, calculation_candidate }
}
export const summarizeRows = summary
function catalog(envelope, expectedCatalogHash) {
  if (!Array.isArray(envelope.inputs) || envelope.inputs.length < 5 || envelope.inputs.length > 6) fail('COVERAGE_BASELINE_INPUT_SET_INVALID')
  if (envelope.inputs.some((input, index) => input?.param !== 'catalog_paths' || input.index !== index)) fail('COVERAGE_BASELINE_INPUT_SET_INVALID')
  const decoded = envelope.inputs.map((input) => ({ input, bytes: decode(input) }))
  if (new Set(decoded.map(({ input }) => input.sha256)).size !== decoded.length) fail('COVERAGE_BASELINE_INPUT_SET_INVALID')
  const catalogInput = decoded.map(({ input, bytes }) => ({ input, value: (() => { try { return parseJson(bytes, 'COVERAGE_BASELINE_CATALOG_INVALID') } catch { return null } })() })).find(({ value }) => value?.format === 'coverage-matrix-baseline-v1')
  const released = catalogInput?.value
  if (!released || released.source_commit !== '8013a3a39aa20f6299f5007828e02facd95b257c' || !Array.isArray(released.fixed_rows)) fail('COVERAGE_BASELINE_CATALOG_INVALID')
  const byHash = new Map(decoded.map(({ input, bytes }) => [input.sha256, bytes]))
  for (const source of Object.values(released.sources ?? {})) {
    if (!source || !HEX.test(source.sha256 ?? '') || !byHash.has(source.sha256)) fail('COVERAGE_BASELINE_SOURCE_SET_INVALID')
  }
  if (Object.keys(released.sources ?? {}).sort().join(',') !== 'custom_pack,custom_redlines,market_benchmarks,missing_clauses') fail('COVERAGE_BASELINE_CATALOG_INVALID')
  const ids = released.fixed_rows.map((row) => row?.check_id)
  if (ids.length !== 26 || ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length || ids.includes('INV-001-MAIN-CONTRACT')) fail('COVERAGE_BASELINE_CATALOG_INVALID')
  for (const [name, source] of Object.entries(released.sources)) {
    const prefix = name === 'missing_clauses' ? 'base/missing-clauses.yaml#' : name === 'market_benchmarks' ? 'base/market-benchmarks.yaml#' : null
    if (!Array.isArray(source.ids) || new Set(source.ids).size !== source.ids.length || source.ids.some((id) => typeof id !== 'string' || !id) || (prefix && (source.ids.length < 1 || source.ids.some((id) => !released.fixed_rows.some((row) => row.check_id === id && row.check_source === `${prefix}${id}`)))) || (!prefix && source.ids.length !== 0)) fail('COVERAGE_BASELINE_CATALOG_INVALID')
  }
  if (catalogInput.input.sha256 !== expectedCatalogHash) fail('COVERAGE_BASELINE_CATALOG_HASH_MISMATCH')
  return { released, byHash, catalogHash: catalogInput.input.sha256 }
}
function jurisdictionRows(jurisdiction, snapshots, released, generatedAt) {
  if (!jurisdiction || typeof jurisdiction !== 'object') fail('COVERAGE_BASELINE_JURISDICTION_INVALID')
  if (jurisdiction.mode === 'clarification_required') {
    if (!Array.isArray(jurisdiction.pending_codes) || !jurisdiction.pending_codes.length || jurisdiction.pending_codes.some((v) => typeof v !== 'string' || !v)) fail('COVERAGE_BASELINE_JURISDICTION_INVALID')
    return { rows: [], source: { mode: 'clarification_required', path: null, version: null, pending_codes: jurisdiction.pending_codes } }
  }
  if (jurisdiction.mode !== 'resolved' || typeof jurisdiction.rules_path !== 'string' || !HEX.test(jurisdiction.rules_sha256 ?? '') || typeof jurisdiction.pack_version !== 'string' || !jurisdiction.pack_version) fail('COVERAGE_BASELINE_JURISDICTION_INVALID')
  if (!snapshots.has(jurisdiction.rules_sha256)) fail('COVERAGE_BASELINE_SOURCE_SET_INVALID')
  const value = released.jurisdiction_catalogs?.find((item) => item?.sha256 === jurisdiction.rules_sha256)
  // Raw YAML is bound by snapshot SHA only. Its released rows were compiled before packaging;
  // this runtime deliberately does not parse YAML or accept a user-dynamic catalog.
  if (!value || !Array.isArray(value.rules) || !Array.isArray(value.conflicts)) fail('COVERAGE_BASELINE_UNSUPPORTED_DYNAMIC_RULES')
  const seen = new Set(); const rows = []
  for (const [section, kind] of [['rules', 'jurisdiction_rule'], ['conflicts', 'jurisdiction_conflict']]) {
    for (const item of value[section]) {
      if (!item || typeof item.id !== 'string' || !item.id || typeof item.title !== 'string' || !item.title || seen.has(item.id)) fail('COVERAGE_BASELINE_JURISDICTION_CATALOG_INVALID')
      seen.add(item.id)
      rows.push(blank({ check_id: item.id, check_title: item.title, check_source: `${jurisdiction.rules_path}#${section}/${item.id}`, rule_kind: kind, stage: 4, owner_agent: 'jurisdiction-auditor' }, generatedAt, 'awaiting jurisdiction-auditor receipt'))
    }
  }
  return { rows, source: { mode: 'resolved', path: jurisdiction.rules_path, version: jurisdiction.pack_version, snapshot_sha256: jurisdiction.rules_sha256 } }
}
export function evaluate(envelope, { expectedCatalogHash = RELEASED_CATALOG_SHA256 } = {}) {
  if (!envelope || envelope.protocol !== PROTOCOL || !envelope.params || !Array.isArray(envelope.inputs)) fail('COVERAGE_BASELINE_ENVELOPE_INVALID')
  const { case_id: caseId, jurisdiction, custom, generated_at: generatedAt } = envelope.params
  if (typeof caseId !== 'string' || !/^(?:case-)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(caseId)) fail('COVERAGE_BASELINE_CASE_BINDING_INVALID')
  if (typeof generatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(generatedAt) || Number.isNaN(Date.parse(generatedAt))) fail('COVERAGE_BASELINE_GENERATED_AT_INVALID')
  const { released, byHash, catalogHash } = catalog(envelope, expectedCatalogHash)
  const allowedHashes = new Set(Object.values(released.sources).map((source) => source.sha256))
  if (jurisdiction?.mode === 'resolved') allowedHashes.add(jurisdiction.rules_sha256)
  const nonCatalogHashes = [...byHash.keys()].filter((value) => value !== catalogHash)
  if (nonCatalogHashes.length !== allowedHashes.size || nonCatalogHashes.some((value) => !allowedHashes.has(value))) fail('COVERAGE_BASELINE_INPUT_SET_INVALID')
  if (!custom || custom.mode !== 'loaded_zero_enabled' || Object.keys(custom).length !== 3 || custom.pack_sha256 !== released.sources.custom_pack.sha256 || custom.redlines_sha256 !== released.sources.custom_redlines.sha256) fail('COVERAGE_BASELINE_CUSTOM_POLICY_UNAVAILABLE')
  const juris = jurisdictionRows(jurisdiction, byHash, released, generatedAt)
  const rows = released.fixed_rows.map((row) => blank(row, generatedAt)).concat(juris.rows)
  const unique = new Set(rows.map((row) => row.check_id))
  if (unique.size !== rows.length) fail('COVERAGE_BASELINE_ROW_IDENTITY_INVALID')
  return { coverage_matrix: { policy_id: 'lead-coverage-matrix-v2', case_id: caseId, generated_before_dispatch: true, rule_sources: { base: { source_commit: released.source_commit, missing_clauses_sha256: released.sources.missing_clauses.sha256, market_benchmarks_sha256: released.sources.market_benchmarks.sha256 }, jurisdiction: juris.source, custom: { mode: 'loaded', enabled_count: 0, pack_sha256: custom.pack_sha256, redlines_sha256: custom.redlines_sha256 } }, summary: summary(rows), rows } }
}
async function main() { try { let data = ''; process.stdin.setEncoding('utf8'); for await (const chunk of process.stdin) data += chunk; process.stdout.write(JSON.stringify({ success: true, output: evaluate(JSON.parse(data)) })) } catch (error) { process.stderr.write(String(error?.message ?? error)); process.exitCode = 1 } }
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
