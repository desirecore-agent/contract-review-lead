---
name: coverage-matrix
description: >-
  合同审查覆盖矩阵的唯一生成、更新和交付控制协议。它从已解析的规则清单生成唯一 rows，
  保存欠账状态与可复算汇总；不把规则源或配置问题伪装为用户材料缺失。用户提到覆盖矩阵、
  欠账表、检查项、漏检、通过率或审查进度时使用。
version: 1.0.2
type: procedural
risk_level: low
status: enabled
tags: [contract-review, coverage-matrix, gap-tracking, anti-omission]
requires:
  tools: [Read, Ls, Glob, Grep, Write, Edit, MathCalc]
metadata:
  author: DesireCore
  version: 1.0.2
  updated_at: '2026-09-11'
---

# 条款覆盖矩阵（欠账表）

## 权威协议

本技能是矩阵行、状态和汇总的唯一来源。`review-orchestration` 只在用户已明确要求开始完整审查的 O0 按本协议建立矩阵，之后只在成员回执先通过 RC-1..RC-6 后按本协议更新同一份 `rows`；不得另造摘要表、临时行或另一套状态规则。用户自然语言仅限登记或上下文待补时，`review-registration` 是唯一流程，本技能不得被调用：该范围不授权规则预检、矩阵、冻结或派发。没有本轮合同材料或明确文件指向时仍是零工具咨询。矩阵记录覆盖事实，不判断合同、规则结论或材料的法律效力。

先完成规则源预检，才可以生成矩阵：对 `review-context` 中唯一、合法的 `candidate_basis`，读取其匹配法域 `pack.yaml` 与 `rules.yaml`，并确定 custom 层是已加载、显式 optional-absent，还是被团队配置声明为 required。`pack.status: not_prechecked` 只能由已获完整审查授权的 O0 调用本技能时转入这次实际预检；它本身不授权本技能、读取或矩阵。成功才更新为 `read_and_pinned` 后继续生成矩阵；找不到、读不到或不能定位**已选择候选**所应存在的法域规则包时，才更新为 `unavailable`，在编排账本记录 `RULE_SOURCE_UNAVAILABLE`、来源路径和可核验读取失败原因，停止在 H，**不要生成“全 blank”的矩阵，也不要写 `deferred`**。候选基准必须来自用户明确陈述，或唯一且绑定当前 O0 `part_id`、SHA-256 与定位信息的合同线索；它只是审查基准，不是最终法律适用结论。custom 层是 optional-absent 时可生成一项 `not_applicable` 行；若配置把 custom 声明为 required 而它缺席，同样以 `CUSTOM_RULE_SOURCE_REQUIRED` 停在 H。二者都不是用户未提交 `SCOPE-*` 材料。

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
    "resolved": "one candidate_basis with an already-read pinned supported pack; generate each applicable jurisdiction rule row",
    "clarification_required": "undetermined or conflicting review-context; generate no jurisdiction rule row, preserve typed pending, and do not treat it as a source failure"
  },
  "catalog": {
    "intake": {"source": "review-orchestration#O1 intake_gate_coverage", "ids": ["CHK-INTAKE-S1-SCOPE", "CHK-INTAKE-S2-MASTER-VERSION", "CHK-INTAKE-S3-PAGE-RANGE", "CHK-INTAKE-S4-ATTACHMENT-MANIFEST", "CHK-INTAKE-S5-EXECUTION-STATUS", "CHK-INTAKE-S6-PLACEHOLDER", "CHK-INTAKE-S7-PARTY-AND-AMOUNT", "CHK-INTAKE-S8-VERSION-MATRIX"]},
    "missing_clauses": {"source": "base/missing-clauses.yaml", "ids": ["liability-cap", "breach-remedy", "grace-period", "termination-convenience", "subcontracting", "audit-right", "dispute-resolution", "force-majeure", "data-export"]},
    "market_benchmarks": {"source": "base/market-benchmarks.yaml", "ids": ["liability-cap-months", "renewal-notice-days", "non-compete-years", "data-export-window-days"]},
    "jurisdiction": {"source": "<resolved-jurisdiction>/rules.yaml", "ids": "each applicable rule id after successful resolved preflight; none in clarification_required mode"},
    "custom": {"source": "custom/rules.yaml", "ids": "each loaded rule id; optional-absent emits only CUSTOM-LAYER-ABSENT"},
    "closure": {"source": "blueprint#section-15", "ids": ["CLOSURE-COMPLETENESS", "CLOSURE-CONSISTENCY", "CLOSURE-BLOCKING-RISK", "CLOSURE-SUBSTANTIVE-TERMS", "CLOSURE-DOCUMENT"]}
  },
  "forbidden_row_ids": ["INV-001-MAIN-CONTRACT"],
  "summary_denominator_statuses": ["covered", "blank", "blocked", "deferred"],
  "mathcalc": {"expression": "covered / (covered + blank + blocked + deferred) * 100", "scope_keys": ["covered", "blank", "blocked", "deferred"], "zero_denominator": {"coverage_rate": null, "coverage_rate_reason": "NO_RATE_DENOMINATOR", "mathcalc_receipt": {"called": false, "reason": "NO_RATE_DENOMINATOR"}}}
}
```

`contract.yaml#INV-001` 是 Lead O0 的唯一主合同账本事实：在 `orchestration-ledger.yaml#inv_001` 写结果、对象绑定和失败原因。它**绝不是矩阵行**，不生成 `INV-001-MAIN-CONTRACT`，不算进 `summary.total`，也不能被改写成 Intake S6 或 `not_applicable`。

## 行格式与唯一来源

每行都必须来自上面 catalog 的一个已解析来源，且 `(check_id, check_source)` 在 `rows` 中唯一。任何重复、未知 `check_id`、无来源行，或 `INV-001-MAIN-CONTRACT` 都使矩阵无效并停止交付；不得通过覆盖、合并、删除旧行来修复欠账。行须包含：

| 字段 | 要求 |
|---|---|
| `check_id`, `check_title`, `check_source`, `stage`, `owner_agent`, `status`, `updated_at` | 每行必填；`check_source` 为 `<file>#<id>`。Intake 回执 `checks[].id` 的 `S1`–`S8` 不得与矩阵 `check_id` 混用。 |
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

## 完整模板与算术回执

首次生成后立即写下列完整结构，再 `Read` 回读。动态行只能由已解析 catalog 追加；不得从成员产物反推 rows。

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
    coverage_rate: <percent-string-or-null>
    coverage_rate_reason: <null-or-NO_RATE_DENOMINATOR>
    mathcalc_receipt: {called: true, expression: "covered / (covered + blank + blocked + deferred) * 100", scope: {covered: <n>, blank: <n>, blocked: <n>, deferred: <n>}, result: <tool-result>}
  rows: []
```

In `clarification_required` mode the `jurisdiction` object is instead `{mode: clarification_required, path: null, version: null, pending_codes: [<typed review-context codes>]}`. It is not a catalog row and does not change the five-status denominator. After reading the actual `rows`, derive five status counts and `total` from that same array. Then call the real `MathCalc` API once with only `expression` and the numeric `scope` object shown above; it has no `count` operation and must not be asked to inspect rows. Save its returned numerical result in `mathcalc_receipt.result`. If its denominator is zero, do **not** divide and do not call MathCalc: replace `mathcalc_receipt` with `{called: false, reason: NO_RATE_DENOMINATOR}`, and use exactly the policy's null rate fields. Before delivery verify: `total == rows.length`; the five counts sum to total; denominator equals `covered + blank + blocked + deferred`; and the displayed rate is the MathCalc result for that denominator. A failed arithmetic check invalidates the summary, never the underlying rows.

## 交付前终检

- [ ] 已选择候选时所有规则源预检成功；未决/冲突 context 只用 `clarification_required` 模式且没有法域规则行；没有把 source/config failure 写成 `deferred`
- [ ] `generated_before_dispatch: true`，每一行有唯一 catalog 来源，且无 `INV-001-MAIN-CONTRACT`
- [ ] 每个状态按本技能类别顺序可解释；欠账未删除
- [ ] 每个 `covered` 的 owner、receipt 和证据一致；非 covered 有具体理由
- [ ] 五个绝对数、`rows.length`、分母和 MathCalc 回执一致；零分母按模板显式表示
- [ ] `blank`、`blocked`、`deferred` 与 `not_applicable` 在交付正文分别列示，不能用覆盖率掩盖
