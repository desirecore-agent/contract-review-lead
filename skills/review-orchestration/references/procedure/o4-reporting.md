### O4 版本对比 + 报告输出（第 6-7 步）

`Delegate`，`mode: sync`，目标 `review-reporter`，为报告输出创建独立 Work Context：

```yaml
target: review-reporter
mode: sync
contextMode: isolated
intentId: "${case_id}:report"
contextReason: "合同案件版本对比与独立复核报告。"
```

**第 6 步的三态**：

| 条件 | 处理 |
|---|---|
| 有历史基线、四大冻结规范化 AND 为 true 且有效回执 `consistency_conclusion_allowed: true` | 正常做版本对比，要求输出 `risk_direction` |
| 单一版本、无历史基线 | 标 `not_applicable` 并在报告显式记录——**标记不是跳过** |
| 四大冻结规范化 AND 非 true、结论开关非 true，或 `manifest_digest_unavailable` | `risk_direction` 只能是 `undetermined`；禁止任何一致性结论（`rules.md#R-013`） |

**交接块必须剔除的内容**（`rules.md#R-003`）：前序成员的推理过程、理由陈述、置信度自评、结论草稿。可以传的是：原文绝对路径、结构化事实（条款表 / 文档对象 / 规则包版本）、覆盖矩阵骨架、上游的 `failure_mark`（那是事实，不是推理）。

**发给 `review-reporter` 的交接契约（强制）**：报告复核官按 `review-scoring` 的 R0.1 在入口拒收缺字段载荷。交接块必须同时包含以下字段，字段名不得改写或用同义字段替代：

```yaml
handoff:
  to: review-reporter
  from: contract-review-lead
  case_id: ${case_id}                   # handoff 身份字段；Reporter 的成员输出路径仍只使用已 Read 比对通过的 review_context_case_id
  step: 6-7
  ledger_path: /abs/path/.../orchestration-ledger.yaml
  lead_workspace: /abs/path/to/lead-workspace                 # Lead-owned read-only input root；不是成员输出授权
  canonical_artifact_root: /abs/path/to/lead-workspace/contract-review # Lead-owned read-only input root；不是成员输出授权
  object:
    contract_object_id: YCIT-SAAS-2025-0206
    object_title: SaaS服务协议
    version_label: YCIT-SAAS-2025-0206
    content_digest: unknown
    submission_mode: single             # 必填；无历史版本也必须显式写 single
  artifacts:
    source_documents: [/abs/path/.../contract.md]
    clause_table: /abs/path/.../clauses.yaml
    risk_list: /abs/path/.../risks.yaml
    jurisdiction_report: /abs/path/.../jurisdiction.yaml
  confirmed:                              # 必填；不得写成 confirmed_facts
    - 输入治理 verdict=conditional，无 BLK
    - 条款、风险与法域产物均已完成并通过形式检查
  pending: []                              # 必填；逐条透传上游 pending
  review_context_path: /abs/path/to/lead-workspace/contract-review/review-context.yaml
  review_context_case_id: ${case_id}    # 与已回核的 O0 case_id 相同
  review_context_revision: 1
  review_context_current_manifest: {status: available, digest: <current O0 digest>}
  review_context_output_constraints: {factual_extraction: allowed, directional_risk_advice: allowed, redline_or_negotiation_advice: allowed, jurisdiction_substantive_conclusion: allowed}
  scope:
    frozen_baseline: {master_version: YCIT-SAAS-2025-0206, page_range: "body: 1-10"}
    consistency_conclusion_allowed: false
    compliance_conclusion_allowed: false
  do_not_pass: [对话历史, 前序 Agent 推理过程, 结论草稿]
```

`source_artifacts`、`confirmed_facts` 等旧字段不能替代上述字段；交接前按 `R0.1` 自检 `object.submission_mode`、`confirmed[]`、`pending[]`、五个 `review_context_*` 字段、`scope.frozen_baseline`、两个结论开关、`do_not_pass` 以及四类绝对产物路径，任一缺失就先在本 Agent 内修正载荷，不得把必然会被拒收的交接发送给复核官。报告复核官尚未接入本契约时，不得由 Lead 代替其核验或补写受限结论。

团队同步时，`review-reporter` 先以 `Ls` 确认实际 team effective cwd，仅在自己的 `members/review-reporter/<case_id>/<review_id>/artifact/` 唯一子树写入 `sanitized-input.yaml`、`scorecard.yaml`、`report.md` 与（如需）`human-gate-receipt.yaml`；`case_id` 只能来自 Reporter 已 `Read` 并逐项比对通过的 `review_context_case_id = context.case_binding.case_id`，不得从 task、intentId、路径、旧回执或成员文本推导；`review_id` 只能来自该成员本次真实 `GenerateUUID`。Lead 不得指定、创建、写入、改名、复制或猜测这些路径，只在最终同步 return 后对原样绝对路径进行既有 Read/归属核验。任一 scope、路径或回读失败均由 Reporter return 实际 `REJECT-*`，Lead 依既有可信 binding/返工上限处理；Reporter 不得 `Delegate` 或 `SendMessage` 二次调度。
