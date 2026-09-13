---
name: coverage-matrix-baseline-init
description: 从受权的发布 catalog 与已读取规则快照机械生成首次覆盖矩阵。
risk_level: low
requires_confirmation: false
executor: script
command: runtime.mjs
script:
  runtime: node
  args: []
  io:
    protocol: snapshot-v1
    input_path_params: [catalog_paths]
    output_path_param: output_path
    max_input_bytes: 1048576
    max_total_input_bytes: 4194304
    max_output_bytes: 1048576
input_schema:
  type: object
  additionalProperties: false
  required: [catalog_paths, output_path, case_id, generated_at, jurisdiction, custom]
  properties:
    catalog_paths:
      type: array
      minItems: 5
      maxItems: 6
      items: {type: string}
      description: >-
        Authorized snapshots in this exact set: the released JSON catalog, base missing-clauses.yaml,
        base market-benchmarks.yaml, custom pack.yaml, custom redlines.yaml, and only for resolved jurisdiction the already-read rules.yaml.
        Paths are removed before script execution.
    output_path:
      type: string
      description: Existing-parent, authorized create-only coverage-matrix.yaml destination; removed before script execution.
    case_id:
      type: string
      pattern: '^(?:case-)?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      description: Declared O0 case binding. It labels the matrix and is not proof of case identity.
    generated_at:
      type: string
      pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]{3})?Z$'
      description: Declared UTC creation time for blank rows. It is not a trusted event or identity proof.
    jurisdiction:
      oneOf:
        - type: object
          additionalProperties: false
          required: [mode, pending_codes]
          properties:
            mode: {const: clarification_required}
            pending_codes: {type: array, minItems: 1, maxItems: 16, items: {type: string, minLength: 1, maxLength: 128}}
        - type: object
          additionalProperties: false
          required: [mode, rules_path, rules_sha256, pack_version]
          properties:
            mode: {const: resolved}
            rules_path: {type: string, minLength: 1, maxLength: 32768, description: Declared path from the prior exact Read; script binds only its matching snapshot hash.}
            rules_sha256: {type: string, pattern: '^[a-f0-9]{64}$'}
            pack_version: {type: string, minLength: 1, maxLength: 128}
    custom:
      type: object
      additionalProperties: false
      required: [mode, pack_sha256, redlines_sha256]
      properties:
        mode: {const: loaded_zero_enabled, description: The released custom pack and redlines are actually Read and hash-bound; its current fixed template has zero enabled entries. Other custom states HOLD and do not call this tool.}
        pack_sha256: {type: string, pattern: '^[a-f0-9]{64}$'}
        redlines_sha256: {type: string, pattern: '^[a-f0-9]{64}$'}
metadata:
  author: DesireCore
  version: '1.0.1'
  provider_type: script
---

# Coverage matrix baseline initializer

This opt-in AgentFS script receives only snapshot-v1 stdin. It verifies the released catalog and every raw
source SHA-256 before mechanically emitting initial `blank` rows, or the existing typed
`clarification_required` branch. It has no filesystem access or path-resolution capability, network, shell, subprocesses, dependencies,
legal applicability decision, material-completeness decision, Human Gate decision, or trusted coverage result.

`case_id`, `generated_at`, `rules_path`, and `pack_version` are declared bindings. Lead must compare them with the preceding
exact Reads, then still Read and StructuredFileValidate the create-only output and let the existing Delegate
precondition independently recompute counts.
