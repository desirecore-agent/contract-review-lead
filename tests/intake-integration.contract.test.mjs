import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import Ajv from 'ajv'
import { parse } from 'yaml'

// Explicit cross-repository integration preflight. npm test stays standalone.
// This uses the selected intake source, never a copied schema or implicit sibling.
const intakeRoot = process.env.CONTRACT_INTAKE_SOURCE
assert.ok(intakeRoot && path.isAbsolute(intakeRoot), 'test:intake requires absolute CONTRACT_INTAKE_SOURCE')
const readIntake = (name) => readFile(path.join(intakeRoot, 'skills/contract-intake-gate', name))
const schemaBytes = await readIntake('schemas/intake-receipt.schema.json')
const documentBytes = await readIntake('tests/fixtures/schema-valid.receipt.yaml')
const schema = JSON.parse(schemaBytes)
const receipt = parse(documentBytes.toString('utf8'))
const { decideReceiptAdmission } = await import(pathToFileURL(path.join(intakeRoot, 'skills/contract-intake-gate/lib/intake-decision.mjs')).href)
const validate = new Ajv({ strict: false }).compile(schema)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const expectedDocumentSha256 = digest(documentBytes)
const expectedSchemaSha256 = digest(schemaBytes)
// The fixture models a trusted tool report; this does not invoke that tool.
const input = { receipt, toolSuccess: true, expectedDocumentSha256, expectedSchemaSha256,
  validationReport: { valid: validate(receipt), document_sha256: expectedDocumentSha256, schema_sha256: expectedSchemaSha256 } }

test('Lead and actual intake schema agree without a receipt valid field', async () => {
  assert.equal('valid' in receipt, false)
  assert.equal(input.validationReport.valid, true, JSON.stringify(validate.errors))
  assert.deepEqual(decideReceiptAdmission(input), {startO2:true, reason:'admitted'})
  const skill = await readFile(new URL('../skills/review-orchestration/SKILL.md', import.meta.url), 'utf8')
  assert.doesNotMatch(skill, /顶层 `valid:false`|只有解析成功且 `valid:true`/)
  assert.match(skill, /工具报告.*document_sha256.*schema_sha256/s)
})

test('a stale or incomplete tool report cannot admit the current receipt', () => {
  for (const patch of [{document_sha256:'0'.repeat(64)}, {schema_sha256:'0'.repeat(64)}, {document_sha256:undefined}, {schema_sha256:undefined}]) {
    assert.equal(decideReceiptAdmission({...input, validationReport:{...input.validationReport,...patch}}).startO2, false)
  }
  assert.equal(decideReceiptAdmission({...input, expectedDocumentSha256:undefined}).startO2, false)
})

test('the real schema and decision reject invalid gates and top-level self-certification', () => {
  for (const verdict of ['unknown', undefined, 'invalid']) {
    const candidate = {...receipt, verdict}
    assert.equal(validate(candidate), false)
    const bytes = Buffer.from(JSON.stringify(candidate))
    assert.equal(decideReceiptAdmission({...input, receipt:JSON.parse(bytes), expectedDocumentSha256:digest(bytes),
      validationReport:{valid:false,document_sha256:digest(bytes),schema_sha256:expectedSchemaSha256}}).startO2,false)
  }
  assert.equal(validate({...receipt, valid:true}), false)
  assert.equal(decideReceiptAdmission({...input, toolSuccess:false}).reason, 'validator_tool_failed')
})

test('standard parsers reject malformed persisted JSON and YAML', () => {
  assert.throws(() => JSON.parse('{"verdict":'))
  assert.throws(() => parse('verdict: [passed'))
})
