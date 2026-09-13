---
name: coverage-matrix
description: >-
  合同审查覆盖矩阵的唯一生成、更新和交付控制协议。它从已解析的规则清单生成唯一 rows，
  保存欠账状态与可复算汇总；不把规则源或配置问题伪装为用户材料缺失。用户提到覆盖矩阵、
  欠账表、检查项、漏检、通过率或审查进度时使用。
version: 1.0.7
type: procedural
risk_level: low
status: enabled
tags: [contract-review, coverage-matrix, gap-tracking, anti-omission]
requires:
  tools: [Read, Ls, Glob, Grep, Write, Edit, GenerateUUID, FileDigest, MathCalc, StructuredFileValidate]
metadata:
  author: DesireCore
  version: 1.0.7
  updated_at: '2026-09-13'
---

# 条款覆盖矩阵（欠账表）

## 权威协议

本技能是矩阵行、状态和汇总的唯一来源。`review-orchestration` 只在用户已明确要求开始完整审查的 O0 按本协议建立矩阵，之后只在成员回执先通过 RC-1..RC-6 后按本协议更新同一份 `rows`；不得另造摘要表、临时行或另一套状态规则。用户自然语言仅限登记或上下文待补时，`review-registration` 是唯一流程，本技能不得被调用：该范围不授权规则预检、矩阵、冻结或派发。没有本轮合同材料或明确文件指向时仍是零工具咨询。矩阵记录覆盖事实，不判断合同、规则结论或材料的法律效力。

先完成规则源预检，才可以生成矩阵：对 `review-context` 中唯一、合法的 `candidate_basis`，读取其匹配法域 `pack.yaml` 与 `rules.yaml`，并确定 custom 层是已加载、显式 optional-absent，还是被团队配置声明为 required。`pack.status: not_prechecked` 只能由已获完整审查授权的 O0 调用本技能时转入这次实际预检；它本身不授权本技能、读取或矩阵。成功才更新为 `read_and_pinned` 后继续生成矩阵；找不到、读不到或不能定位**已选择候选**所应存在的法域规则包时，才更新为 `unavailable`，在编排账本记录 `RULE_SOURCE_UNAVAILABLE`、来源路径和可核验读取失败原因，停止在 H，**不要生成“全 blank”的矩阵，也不要写 `deferred`**。候选基准必须来自用户明确陈述、已由 Lead 按 review-context 契约逐项核验的 `submitted_business_context`，或唯一且绑定当前 O0 `part_id`、SHA-256 与定位信息的合同线索；它只是审查基准，不是最终法律适用结论。`submitted_business_context` 的 schema/SFV 只证明形状，本技能不得替代 Lead 的 reference_materials 路径/摘要/指针/值/当前请求纳入原文核验，也不得把 `confirmed_by` 当作 Human Gate 或授权。custom 层是 optional-absent 时可生成一项 `not_applicable` 行；若配置把 custom 声明为 required 而它缺席，同样以 `CUSTOM_RULE_SOURCE_REQUIRED` 停在 H。二者都不是用户未提交 `SCOPE-*` 材料。

`review-context.jurisdiction.status: undetermined` 或 `conflicting` 与规则源失败不同：尚未选择候选包时，仍生成基础、Intake、custom 与 closure 行，`rule_sources.jurisdiction` 写为 `clarification_required`，且**不生成任何法域规则行**、不伪造路径或版本、不写 `RULE_SOURCE_UNAVAILABLE`。对应 typed pending 必须保留；未决时只能进行事实提取，法域实体结论不得写出。`conflicting` 还必须保留 `HG-02`，不得默认择一。只有已选择候选之后的包缺失、读失败、pin 不匹配或服务范围不支持才是预检 H。

```json
{
  "policy_id": "lead-coverage-matrix-v2",
  "row_identity": ["check_id", "check_source"],
  "allowed_statuses": ["covered", "blank", "blocked", "deferred", "not_applicable"],
  "status_precedence": ["not_applicable", "deferred", "blocked", "blank", "covered"],
  "deferred_requires": "a trusted contract-intake receipt SCOPE-* fact identifying material absent from this user submission",
  "pre_dispatch_failures": ["RULE_SOURCE_UNAVAILABLE", "CUSTOM_RULE_SOURCE_REQUIRED"],
  "jurisdiction_context": {
    "resolved": "one candidate_basis with an already-read pinned supported pack; enumerate every rules[] and conflicts[] entry before dispatch, then wait for jurisdiction receipt disposition",
    "clarification_required": "undetermined or conflicting review-context; generate no jurisdiction rule row, preserve typed pending, and do not treat it as a source failure"
  },
  "catalog": {
    "intake": {"source": "review-orchestration#O1 intake_gate_coverage", "ids": ["CHK-INTAKE-S1-SCOPE", "CHK-INTAKE-S2-MASTER-VERSION", "CHK-INTAKE-S3-PAGE-RANGE", "CHK-INTAKE-S4-ATTACHMENT-MANIFEST", "CHK-INTAKE-S5-EXECUTION-STATUS", "CHK-INTAKE-S6-PLACEHOLDER", "CHK-INTAKE-S7-PARTY-AND-AMOUNT", "CHK-INTAKE-S8-VERSION-MATRIX"]},
    "missing_clauses": {"source": "base/missing-clauses.yaml", "ids": ["liability-cap", "breach-remedy", "grace-period", "termination-convenience", "subcontracting", "audit-right", "dispute-resolution", "force-majeure", "data-export"]},
    "market_benchmarks": {"source": "base/market-benchmarks.yaml", "ids": ["liability-cap-months", "renewal-notice-days", "non-compete-years", "data-export-window-days"]},
    "jurisdiction": {"source": "<resolved-jurisdiction>/rules.yaml", "sections": ["rules", "conflicts"], "ids": "every unique entry id from both arrays after successful resolved preflight; none in clarification_required mode", "stage": 4, "owner_agent": "jurisdiction-auditor", "initial_status": "blank"},
    "custom": {"source": "custom/rules.yaml", "ids": "each loaded rule id; optional-absent emits only CUSTOM-LAYER-ABSENT"},
    "closure": {"source": "blueprint#section-15", "ids": ["CLOSURE-COMPLETENESS", "CLOSURE-CONSISTENCY", "CLOSURE-BLOCKING-RISK", "CLOSURE-SUBSTANTIVE-TERMS", "CLOSURE-DOCUMENT"]}
  },
  "forbidden_row_ids": ["INV-001-MAIN-CONTRACT"],
  "summary_denominator_statuses": ["covered", "blank", "blocked", "deferred"],
  "calculation_candidate": {"status": "pending_trusted_delegate_proof", "expression": "covered / (covered + blank + blocked + deferred) * 100", "scope_keys": ["covered", "blank", "blocked", "deferred"], "zero_denominator": {"branch": "zero_denominator", "denominator": 0, "coverage_rate": null, "coverage_rate_reason": "NO_RATE_DENOMINATOR"}}
}
```

`contract.yaml#INV-001` 是 Lead O0 的唯一主合同账本事实：在 `orchestration-ledger.yaml#inv_001` 写结果、对象绑定和失败原因。它**绝不是矩阵行**，不生成 `INV-001-MAIN-CONTRACT`，不算进 `summary.total`，也不能被改写成 Intake S6 或 `not_applicable`。

## 行格式与唯一来源

每行都必须来自上面 catalog 的一个已解析来源，且 `(check_id, check_source)` 在 `rows` 中唯一。任何重复、未知 `check_id`、无来源行，或 `INV-001-MAIN-CONTRACT` 都使矩阵无效并停止交付；不得通过覆盖、合并、删除旧行来修复欠账。行须包含：

| 字段 | 要求 |
|---|---|
| `check_id`, `check_title`, `check_source`, `stage`, `owner_agent`, `status`, `updated_at` | 每行必填；`check_source` 为 `<file>#<section>/<id>`（固定 catalog 没有 section 时沿用既有 `<file>#<id>`）。Intake 回执 `checks[].id` 的 `S1`–`S8` 不得与矩阵 `check_id` 混用。 |
| `rule_kind` | 法域行可填 `jurisdiction_rule` 或 `jurisdiction_conflict`，只标识它来自 `rules[]` 还是 `conflicts[]`，不表示适用性、触发或结论。 |
| `receipt_ref` | 仅 `covered` 必填，且指向通过 RC-1..RC-6 的该 owner 回执条目 |
| `source_location`, `conclusion`, `evidence`, `action` | `covered` 必填；evidence 必须能在声明输入中原文 `Grep` 命中 |
| `not_covered_reason` | 每个非 `covered` 必填；不得写“未提及” |
| `human_gate` | 命中而未人工确认时保留；该行不能 `covered` |

## 状态判定（按类别顺序，不是旧 R1 首命中）

对每一既有行依次判断下列类别；首次类别决定状态。`blank` 只在前面三类都不成立时才可出现，因此不会遮蔽真实的 `blocked`、`deferred` 或 `not_applicable`。

1. **not_applicable**：有合同类型层面的理由，或 O6 已确认无历史基线；optional custom 未加载仅可用 `CUSTOM-LAYER-ABSENT` 行表达。写明理由。不得把“本次没查到”当理由。
2. **deferred**：仅当有效 `contract-intake` 回执中存在可追溯的 `SCOPE-*` 事实，且该事实指明本次用户提交缺少该行所需材料。记录 receipt/step、缺少材料和本行关系。规则包、工具、权限、读取范围、Agent 或配置失败永远不是 deferred。
3. **blocked**：owner 已派发后终态失败、并行分支缺失、两次返工耗尽，或上游门禁使该已建行无法执行。写明负责 owner 与可核验失败。不得用另一成员补填。
4. **blank**：尚未派发、等待中、无可消费回执，或回执未通过 RC-1..RC-6、四元组/原文证据/阈值不足、Human Gate 未确认。保留具体欠项；`covered` 却无有效 `receipt_ref` 必须回退此状态。
5. **covered**：仅当同一 owner 的合格回执、有效 `receipt_ref`、完整四元组与可命中证据均存在，且没有未确认 Human Gate。

optional-absent custom 的唯一可用行固定如下；它保留企业红线未参与本案的欠账，但绝不声称用户漏交材料：

```yaml
- check_id: CUSTOM-LAYER-ABSENT
  check_title: 企业自定义红线未加载
  check_source: custom/rules.yaml#optional-absent
  stage: 5
  owner_agent: risk-scanner
  status: not_applicable
  not_covered_reason: custom 层被团队配置明确为 optional，未加载的企业规则不适用于本案
  updated_at: <timestamp>
```

### resolved 法域 catalog 的机械枚举

法域包已成功读取并 pin 后，O0 必须从**同一次完整 `Read` 的 `rules.yaml`**机械枚举根级
`rules[]` 与 `conflicts[]`。两个字段都必须是数组；每个元素都必须有非空字符串 `id` 与可读标题。
把两数组中每个条目的原始 `id` 组成一个联合集合：数组内重复、跨数组重复、缺失或非字符串 ID
一律记录 `JURISDICTION_CATALOG_INVALID` 并 HOLD，不得静默去重、改名或继续派发。

联合集合中的每一项在任何 Delegate 前恰好生成一行：`check_id` 原样等于条目 `id`；主规则的
`check_source` 为 `<实际 rules.yaml 绝对路径>#rules/<id>`，冲突规则为
`<实际 rules.yaml 绝对路径>#conflicts/<id>`；`stage: 4`、
`owner_agent: jurisdiction-auditor`、`status: blank`，并写明正在等待法域回执。可用
`rule_kind: jurisdiction_rule|jurisdiction_conflict` 保留来源类别。生成后比较发现集合与 stage 4
法域行的 `(check_id, check_source)` 集合，必须双向完全相等且无额外行，不能按合同类型、
`mandatory`、`category`、`detection`、`trigger`、关键词或 Lead 对合同事实的理解提前筛选。

这些初始 `blank` 行不是法律适用判断。Jurisdiction 后续回执通过 RC-1..RC-6 后，只对回执以精确
规则 ID、`rules|conflicts` section 和证据明确处置的对应行按本技能既有五状态规则更新：有证据确认
条件不适用时可为 `not_applicable`；触发未知、事实不足或 Human Gate 未确认时保持 `blank`，不得
默认改为 `not_applicable`。未被回执逐 ID 处置的行继续 `blank`；汇总 `rules_evaluated`、finding/gap
数量或“已审法域包”等概括不能替代逐行证据，也不保证首次 Jurisdiction 返回后所有行都脱离
`blank`。冲突条目与主规则遵循同一回执、证据和 Human Gate 边界，不增加另一套
catalog-disposition 协议。

## 完整模板与内部计算候选

首次矩阵 `Write` 前，必须实际 `Read`
`${SKILL_DIR}/references/coverage-matrix-bucket-summary.schema.json` 和
`${SKILL_DIR}/references/coverage-matrix-bucket-summary.descriptor.json`；任一不可读、解析失败或与
`agent.json#delegation_preconditions` 的 pin 不一致都 HOLD，不得凭记忆重建。正分母候选必须按实际
schema 的 percent 形状和 descriptor 的两位小数规则写成带 `%` 的字符串，例如 `0.00%`、
`25.00%`，不能写成 `0.00` 或裸数。随后才写下列完整结构并 `Read` 回读。动态行只能由已解析
catalog 追加；不得从成员产物反推 rows。

```yaml
coverage_matrix:
  policy_id: lead-coverage-matrix-v2
  case_id: <case_id>
  generated_before_dispatch: true
  rule_sources:
    base: {path: <absolute-path>, version: <version>}
    jurisdiction: {mode: resolved, path: <absolute-path>, version: <pack-version>}
    custom: {mode: loaded|optional-absent, path: <absolute-path-or-null>}
  summary:
    total: <rows.length>
    covered: <integer>
    blank: <integer>
    blocked: <integer>
    deferred: <integer>
    not_applicable: <integer>
    calculation_candidate:
      status: pending_trusted_delegate_proof
      branch: positive_denominator
      expression: "covered / (covered + blank + blocked + deferred) * 100"
      scope: {covered: <n>, blank: <n>, blocked: <n>, deferred: <n>}
      denominator: <positive-integer>
      expected_coverage_rate: <untrusted-percent-string-candidate>
  rows: []
```

In `clarification_required` mode the `jurisdiction` object is instead `{mode: clarification_required, path: null, version: null, pending_codes: [<typed review-context codes>]}`. It is not a catalog row and does not change the five-status denominator. After reading the actual `rows`, derive five status counts and `total` from that same array. When the denominator is positive, write the row-derived scope, denominator and a two-decimal `expected_coverage_rate` only as the worker comparison operand. It stays `pending_trusted_delegate_proof` and is not a numerical conclusion or tool receipt; O0 does not call MathCalc for this coverage candidate. When the denominator is exactly zero, use `{status: pending_trusted_delegate_proof, branch: zero_denominator, denominator: 0, coverage_rate: null, coverage_rate_reason: NO_RATE_DENOMINATOR}` and do not invent a ratio. Before dispatch verify only structural correspondence; the verified calculation is the successful Delegate proof assertion's `actual`. A failed admission invalidates the summary candidate, never the underlying rows. Other contract calculations remain governed by their own skills and actual calculation-tool requirements.

## Delegate 前候选与返回后的可信 proof

`references/coverage-matrix-bucket-summary.schema.json` 与
`references/coverage-matrix-bucket-summary.descriptor.json` 是随本技能发布、由 Lead
`agent.json#delegation_preconditions` 以精确 SHA-256 pin 的通用 `bucket-summary-v1`
资源。它们只对同一份已授权、当前 effective cwd 下的
`contract-review/coverage-matrix.yaml` 快照做有限计数和算术比较：完整 `rows` 数、五态各自
计数及其总和始终比较；四态分母为零时，只接受所有 `covered`、`blank`、`blocked`、`deferred`
均为零以及上述 null/`NO_RATE_DENOMINATOR` 候选；分母大于零时，额外比较四个
`calculation_candidate.scope` 计数、分母与两位 `expected_coverage_rate` 候选。不得改写、另造或
换根这些资源、矩阵或 pin。

Delegate 启动前，该文件及任何自写旁车都只能是内部候选，不能写成已验证覆盖率、历史
`MathCalc` 回执或可信来源。只有当前 `Delegate` 成功返回文本末尾完整 JSON 中的
`verified_preconditions` 才可
用于引用其真实计算值；失败、取消、超时、缺 proof 或字段不全时，候选仍为 pending，不能从
矩阵、摘要或旧旁车补证。

成功返回后，先调用一次真实 `GenerateUUID` 取得本次旁车文件名，再从该 JSON 原样复制
`verified_preconditions: {preconditions, proofs}`。`child_run_id` 只能从**同一次成功 Delegate 的模型可见正文**中
`[子会话 runId: <真实值>]` 标记原样取得；标记缺失、空值或与同次返回不能绑定时保持 pending/HOLD，
不得从 metadata、路径、旧会话或自身文字推断。把这两项写入
`contract-review/coverage-matrix-proofs/<generated-uuid>.json`；该次 `Write` 必须使用
`createOnly: true`，任何已存在/unknown 结果都停止且不得覆盖。随后按
`references/coverage-matrix-trusted-proof.schema.json` 校验。`proofs[]` 是平台按完整 proof
去重的数组；`preconditions[]` 中每项以 `targetAgentId`、源 Agent `configSha256` 和
`proofIndexes[]` 保留目标到 proof 的关联。不得展平、按目标复制 proof 或把 index 当业务编号。
本版本只声明一项、只派给一个 canonical `contract-intake` 目标，因此消费时还必须恰有一个
匹配该目标的 precondition、`proofIndexes: [0]`、一个 proof，且索引在数组范围内；任何额外、
缺失、重复或越界都不可消费。旁车 Schema 复用平台通用上限，不替代这项 Agent-specific 检查。
所引用 `proof` 的键保持平台原始 snake_case：`profile`、`format`、`document_sha256`、
`schema_sha256`、`contract_sha256`、`report_sha256`、`rows`、`buckets`、`matched_group`、
`assertions[]`。随后再次对 exact 矩阵调用 `FileDigest`，其 SHA-256 必须等于所索引 proof 的
`document_sha256`；schema/descriptor pin、目标关联、源配置 digest、child run 与本次 Delegate
必须逐项绑定。任一不符都使 proof 不可消费，矩阵保持 pending，不得改写被 proof 验证的原文件。

断言含义只按本版本 descriptor 的数组顺序解释：序号 0–6 是通用 total/五态/合计断言，
随后是 `matched_group` 的断言。positive 分支只有所索引 proof 中相应 ratio 断言的 `actual` 可作为可信
覆盖率数值；zero 分支只引用 count 断言的 `actual: 0` 说明没有适用分母，绝不假造 ratio。
本 descriptor 声明两个 group，故 `matched_group` 必须是 0 或 1；平台通用 `null` 形态在本技能中
不可消费。所有断言还必须 `actual === expected`，种类、数量与 ordinal 均和 pinned descriptor 一致。
旁车必须新建而不覆盖旧文件；不得把 child ID、report hash 或其他外部字符串直接拼成路径。
旁车是本次公开工具返回的审计转录，不是密码学签名；以后运行不得仅凭旁车认证来源。它只证明
首次 Intake admission 所读取的 `document_sha256` 快照：O1 及以后任意矩阵 `Write` / `Edit` 都使它
对当前矩阵失效。不得重派 Intake 来刷新覆盖率，也不得把旧 proof 的 actual 搬到新矩阵；最终覆盖率
改走下方绑定当前矩阵字节的 MathCalc 路径。

## 当前矩阵的最终 MathCalc 旁车

O0 的唯一例外是首次 admission 候选由成功 Delegate proof 重算，**不调用 MathCalc**。O1 之后只要
矩阵发生过一次编辑，任何最终五态计数、分母或覆盖率都必须由本节的 post-dispatch/current-read
真实 MathCalc 路径重新取得；不能把矩阵 `summary`、O0 proof、模型计数或 `called: true` 当作结果。
`review-registration` 不生成矩阵，也不进入本节。

仅在所有成员回执已经通过既有 RC、所有矩阵行更新完成、Human Gate 已满足相应交付条件，且准备
进入最终交付时执行。开始前先实际 `Read`
`${SKILL_DIR}/references/coverage-matrix-final-calculation.schema.json`；不可读、不可解析或内容不完整即
HOLD，不得自由编写旁车形状或先行计算：

1. 对 exact `contract-review/coverage-matrix.yaml` 调用 `FileDigest` 得到 `H1`，再以 `Read` 完整回读
   同一文件；任何截断、分页未完成或读取失败都 HOLD。回读后立刻再次 `FileDigest` 得到 `H2`，必须
   `H1 === H2`。
2. 从这次完整回读按 `rows` 原序转录 `ordinal`、`check_id`、`check_source`、`status`，并为每行生成
   `covered`、`blank`、`blocked`、`deferred`、`not_applicable` 五个 0/1 标志。每行必须恰有一个 1，
   且它与该行实际 status 相同；行数、ordinal 和 `(check_id, check_source)` 必须逐项对应。该转录是
   可审计的工具输入准备，不是平台对状态语义的认证。
3. 按五态固定顺序分别调用五次真实 `MathCalc`：每次参数必须是
   `expression: "sum(flags)"`、`scope: {flags: <该态完整标志数组>}`、`mode: bignumber`、
   `precision: 64`、`format: auto`。每个 scope 数组必须与 `row_transcription` 按 ordinal 投影出的同名
   flags 逐元素相等、长度等于 row_count；五个计数只能引用对应工具成功返回的原始文本，不能填写模型自报数。
4. 用上述四个真实返回值调用一次 `MathCalc`，参数固定为
   `expression: "covered + blank + blocked + deferred"`，scope 只放这四个返回值，得到分母。再用五个
   计数核对总和等于 `rows.length`。分母大于零时，以真实 covered 与 denominator 返回值调用一次
   `MathCalc`：`expression: "covered / denominator * 100"`、`mode: bignumber`、`precision: 64`、
   `format: fixed`、`format_decimals: 2`；其原始文本才是最终覆盖率。分母恰为零时不调用比例，记录
   `coverage_rate: null` 与 `NO_RATE_DENOMINATOR`；这个零分支仍须有五次计数和一次分母的成功返回。
   分母与 ratio 的 scope 必须逐值等于这些前序 MathCalc 的原始返回，不得重新转抄或另算。
5. 全部调用后再次 `FileDigest` 得到 `H3`，必须 `H3 === H1`。任何矩阵编辑、摘要变化、MathCalc
   失败、返回非预期整数/百分比、计数闭合失败或字段不可得，都使整组结果 stale/pending；保持 HOLD，
   最终正文不得给覆盖率数值，也不得重派 Intake 或补写回执。
6. `GenerateUUID` 后把完整行转录、五组完整标志数组、每次 MathCalc 的**实际输入和原始成功文本**、
   `H1/H2/H3` 与矩阵绝对路径写入
   `contract-review/coverage-matrix-calculations/<generated-uuid>.json`。`Write` 必须使用
   `createOnly: true`，再按
   `references/coverage-matrix-final-calculation.schema.json` 调用 `StructuredFileValidate` 并 `Read` 回核。
   已存在、unknown、校验失败或回核不符都 HOLD。旁车不修改被 hash 的矩阵，也不覆盖 Reporter 原产物；
   Lead 只可在编排回执/覆盖率附录引用该旁车及其中真实返回。旁车之后矩阵再变即整体失效，必须对新
   字节重新执行本节，不能编辑旧旁车。

该旁车证明的是“这些公开 MathCalc 返回绑定到这次稳定字节与这份显式转录”，不是完整内容 hash
之外的身份认证，也不证明每个行状态的业务语义正确。行状态仍由 catalog、RC 与 Human Gate 规则决定。

## 交付前终检

- [ ] 已选择候选时所有规则源预检成功，`rules[]` 与 `conflicts[]` 的唯一 ID 联合集合和初始 stage 4 法域 `blank` 行双向完全相等；未决/冲突 context 只用 `clarification_required` 模式且没有法域规则行；没有把 source/config failure 写成 `deferred`
- [ ] `generated_before_dispatch: true`，每一行有唯一 catalog 来源，且无 `INV-001-MAIN-CONTRACT`
- [ ] 每个状态按本技能类别顺序可解释；欠账未删除
- [ ] 每个 `covered` 的 owner、receipt 和证据一致；非 covered 有具体理由
- [ ] 五个绝对数、`rows.length`、分母和内部计算候选一致；零分母按模板显式表示
- [ ] Delegate 前没有把候选或自写文件称为可信 proof；O0 只引用同次可见正文的 proof/child run，并以 exact 矩阵 SHA-256 和 pinned descriptor 序号解释
- [ ] O1 后任意矩阵编辑均未复用 O0 proof；交付前已按当前完整回读执行五态计数、分母与可选比例的真实 MathCalc，并以三次相等摘要写入新的 validated sidecar
- [ ] `blank`、`blocked`、`deferred` 与 `not_applicable` 在交付正文分别列示，不能用覆盖率掩盖
