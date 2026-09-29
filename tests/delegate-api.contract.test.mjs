import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const platformArg = process.env.CONTRACT_PLATFORM_SOURCE
assert.ok(platformArg, 'set CONTRACT_PLATFORM_SOURCE to the absolute contract-platform path')
const platform = path.resolve(platformArg)
const delegatePath = path.join(platform, 'packages/agent-service/src/builtin-tools/delegate.ts')
const catalogPath = path.join(platform, 'packages/agent-service/src/builtin-tools/catalog.generated.ts')
const normalizerPath = path.join(platform, 'packages/agent-service/src/runtime/tool-schema-normalizer.ts')

const orchestration = await readFile(new URL('skills/review-orchestration/SKILL.md', root), 'utf8')
const delegateSource = await readFile(delegatePath, 'utf8')
const { BUILTIN_TOOL_CATALOG } = await import(pathToFileURL(catalogPath).href)
const { buildTypeBoxParameters } = await import(pathToFileURL(normalizerPath).href)
const delegate = BUILTIN_TOOL_CATALOG.find(({ metadata }) => metadata.id === 'Delegate')?.metadata
assert.ok(delegate?.inputSchema, 'selected platform must publish the complete Delegate input schema')
const validationPath = path.join(platform, 'packages/schemas/src/validation.ts')
const { validateSchema } = await import(pathToFileURL(validationPath).href)

function examplesFromSkill() {
  return [...orchestration.matchAll(/```json delegate-example:(O[1-5])\n([\s\S]*?)\n```/g)]
    .map(([, stage, body]) => [stage, JSON.parse(body)])
}

// The runtime's generated catalog carries the complete tool definition, including types,
// enums and conditional requirements. Use its production normalizer unchanged; never replace
// ordinary properties by {}. This is schema preflight, not a real Delegate dispatch test.
const allowedNames = delegate.params.map(({ name }) => name)
const productionSchema = buildTypeBoxParameters({ ...delegate, executor: 'builtin' })
const validate = (value) => validateSchema(productionSchema, value)

function targetMatch(call) {
  if (call.mode !== 'fan-out') return true
  const targets = call.targets ?? []
  const selected = (call.contextSelections ?? []).map((entry) => entry.target)
  return targets.length === selected.length
    && new Set(targets).size === targets.length
    && new Set(selected).size === selected.length
    && targets.every((target) => selected.includes(target))
}

function workflowPairValid(o4, o5) {
  return o4.intentId !== o5.intentId
}

test('all O1-O5 examples satisfy the complete production catalog schema and normalizer', () => {
  const examples = examplesFromSkill()
  assert.deepEqual(examples.map(([stage]) => stage), ['O1', 'O2', 'O3', 'O4', 'O5'])
  for (const [stage, call] of examples) {
    const result = validate(call)
    assert.equal(result.success, true, `${stage}: ${JSON.stringify(result.errors)}`)
    assert.equal(targetMatch(call), true, `${stage}: contextSelections must match targets one-to-one`)
  }
  const byStage = Object.fromEntries(examples)
  assert.equal(workflowPairValid(byStage.O4, byStage.O5), true)
  assert.deepEqual(byStage.O4.childContext, { memoryScope: 'none' })
  assert.deepEqual(byStage.O5.childContext, { memoryScope: 'none' })
  assert.equal(byStage.O3.strategy, 'parallel')
})

test('schema preflight rejects known bad Delegate shapes without dispatching', () => {
  const byStage = Object.fromEntries(examplesFromSkill())
  const cases = {
    numericTarget: { ...byStage.O1, target: 1 },
    numericTargetInArray: { ...byStage.O3, targets: [1, 'risk-scanner'] },
    invalidMode: { ...byStage.O1, mode: 'parallel' },
    invalidStrategy: { ...byStage.O3, strategy: 'concurrent' },
    objectTask: { ...byStage.O1, task: { text: 'not a string' } },
    missingContextReason: { ...byStage.O1, contextReason: undefined },
    fanoutFlatContext: { ...byStage.O3, contextMode: 'isolated', intentId: 'bad:flat' },
    fakeSkillField: { ...byStage.O4, skill: 'independent-verification' },
    missingSelectionTarget: {
      ...byStage.O3,
      contextSelections: byStage.O3.contextSelections.map(({ target, ...entry }, index) => index ? { target, ...entry } : entry),
    },
  }
  for (const [name, call] of Object.entries(cases)) {
    const schemaOk = validate(JSON.parse(JSON.stringify(call))).success
    assert.equal(schemaOk && targetMatch(call), false, `${name} unexpectedly accepted`)
  }
  const sameIntent = { ...byStage.O5, intentId: byStage.O4.intentId }
  assert.equal(validate(sameIntent).success, true, 'each individual call remains schema-valid')
  assert.equal(workflowPairValid(byStage.O4, sameIntent), false, 'cross-stage guard must reject reused O4/O5 intent')
})

test('O1 structured validator example uses the complete real tool schema, not guessed aliases', () => {
  const metadata = BUILTIN_TOOL_CATALOG.find(({ metadata }) => metadata.id === 'StructuredFileValidate')?.metadata
  assert.ok(metadata?.inputSchema)
  const schema = buildTypeBoxParameters({ ...metadata, executor: 'builtin' })
  const match = orchestration.match(/```json validator-example:O1\n([\s\S]*?)\n```/)
  assert.ok(match, 'O1 must include a concrete parameter example')
  const call = JSON.parse(match[1])
  assert.equal(validateSchema(schema, call).success, true)
  assert.equal(validateSchema(schema, {document: call.document_path, schema: call.schema_path, format:'yaml'}).success, false)
  assert.equal(validateSchema(schema, {...call, format:'text'}).success, false)
  assert.equal(validateSchema(schema, {...call, schema_path:{type:'object'}}).success, false)
})

test('platform source keeps control separate and memoryScope none has the audited semantics', async () => {
  const childSchema = await readFile(path.join(platform, 'packages/schemas/src/agent-service/delegate-child-context.ts'), 'utf8')
  assert.match(delegateSource, /DELEGATE_CONTROL_TOOL_NAME = 'DelegateControl'/)
  assert.doesNotMatch(allowedNames.join('\n'), /^(action|stop)$/m)
  assert.match(childSchema, /none=连团队记忆也跳过/)
  assert.match(delegateSource, /memoryScope === 'none'[\s\S]*scopeExcludes\.push\('agent_memory'\)/)
  assert.match(delegateSource, /disableMemoryInjection = true/)
  assert.match(delegateSource, /isMandatorySection\(name\)/)
})
