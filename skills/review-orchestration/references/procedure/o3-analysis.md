### O3 法域注入 + 风险判读（第 4-5 步）

`Delegate`，`mode: fan-out`，`strategy: parallel`，同时提供 `targets` 和每个目标的 `contextSelections`：

```yaml
targets: [risk-scanner, jurisdiction-auditor]
mode: fan-out
strategy: parallel
contextSelections:
  - target: risk-scanner
    contextMode: isolated
    intentId: "${case_id}:risk"
    contextReason: "合同案件风险识别。"
  - target: jurisdiction-auditor
    contextMode: isolated
    intentId: "${case_id}:jurisdiction"
    contextReason: "合同案件法域合规审查。"
```

每个 O3 交接还必须带以下闭合的扁平 review-context 快照；path 位于 Lead canonical 根，五项均来自刚刚 `Read` 的当前 context，不得由成员、文件名、商业规则、resume、旧摘要或 Delegate 身份补写：

```yaml
review_context_path: /abs/path/to/lead-workspace/contract-review/review-context.yaml
review_context_case_id: ${case_id}
review_context_revision: <current revision>
review_context_current_manifest: {status: available, digest: <current O0 digest>} # 或 {status: unavailable, reason: <actual reason>}
review_context_output_constraints: <current closed object>
```

成员先 `Read` 后按自身后续契约核验这些字段与案件一致时才可使用 context，并在最终回执以闭合 `review_context_echo` 回显 `case_id`、`revision`、`current_manifest` 与**实际遵循的** `actual_output_constraints`。`review_context_output_constraints` 与 echo 的 `actual_output_constraints` 都是可输出范围而不是已输出结论、文件/工具权限或 Human Gate。缺 `review_stance` 时仍派发并允许事实提取，但风险方向、redline 与谈判建议必须为 `not_issued_missing_review_stance`；法域 `undetermined` 时仍允许法域事实提取，但不得发出法域实体结论；`conflicting` 保留 `HG-02`，不得择一。消费者尚未实现该契约前，Lead 只能声明此交接要求，不能把它当作消费者已验证。

在任一 O3 回执的 RC、覆盖矩阵更新或 O4 前，Lead 必须再次 `Read` 当前 `review-context.yaml`，逐字段比较 context path、case_id、revision、current manifest 和 constraints 与交接快照及 `review_context_echo`。任一不符写 `REJECT-STALE-REVIEW-CONTEXT`，不得消费、登记或覆盖当前产物；较高 revision 使旧受影响 O3 产物标记 `superseded_context_revision`，然后仅以普通 `contextMode: isolated` 重派受影响分支，绝不 `continue`、resume 或从旧回执重建身份。该拒收不关闭既有 Human Gate 或变更其账本状态。

**法域逐 ID 覆盖更新。**在改动任一 `jurisdiction-auditor` 矩阵行前，Lead 必须实际 `Read` 该分支返回的 `artifact_path`，并从同一产物根级 `jurisdiction.coverage_updates` 读取权威数组；handoff 的 `coverage_updates_ref`（应为该绝对产物路径加 `#/jurisdiction/coverage_updates`）和 `coverage_updates_count` 只用于定位与对账，不是权威数据，不能替代实际数组。ref/path/pointer 或 count/实际数组长度不一致时回执不合格；即使一致也不能证明数组内容。数组最多 8000 项；每项必须且只能含 `rule_id`、`section`、`check_source`、`status`、`reason`、`evidence_refs`：`section` 只能是 `rules|conflicts`，`status` 只能是 `covered|not_applicable|blank|blocked|deferred`，每个 evidence ref 只能含 `collection` 与 `id`，其中 collection 只能是 `governed_by_edges|compliance_findings|conflict_findings|coverage_gaps|human_gates`。

Lead 以 O0 已读的同一 pinned `rules_path` 重新机械构造完整 tuple 集合 `(rule_id, section, check_source=<rules_path>#<section>/<rule_id>)`，并要求它与数组逐项唯一、无缺失无额外地完全相等。每个非 `blank` 状态必须有非空 `reason` 和至少一个可在**同一实际产物**相应 collection 中按 `id` 精确解析、且确实支持该处置的 evidence ref；`blank` 只有在 reason 明确为 locked、unknown、unassessed 或 pending 时才可为空 refs，并继续保持 `blank`，绝不得当作 `not_applicable`。任何数组缺失、重复、额外 ID、section/source 不符、引用不存在或证据不支持，都使该法域分支回执不合格，相关行保持 `blank` 并按既有 R/H 处理；不得相信 count/ref 指针、不得根据未返回项推断结论。只有完整集合与逐项引用全部通过后，才按每项真实 `status`、`reason` 和 refs 机械更新对应唯一行；分支合格也绝不批量翻 `covered`。

并行的理由：两者输入完全相同（原文 + 条款结构表 + 规则包），互不依赖，输出互不覆盖。并行不仅省时，还天然保证两条判断线互不读对方结论——串行会让后跑的一方被先跑一方的措辞锚定。

**部分成功处理**（最易出错，见 principles L2）：

| 情况 | 处理 |
|---|---|
| 两支都返回合格分支回执 | 风险支仅按 `coverage-matrix` 的既有逐 ID 规则更新；法域支还必须先实际 `Read` 同一产物的 `jurisdiction.coverage_updates` 并通过完整 tuple 集合与同产物 refs 核验，才机械更新五状态。未证明的行保持 `blank`，不得因分支合格批量翻成 `covered` |
| 仅 `risk-scanner` 合格 | 法域类 `check_id` 全部记 `blocked`，原因写「jurisdiction-auditor 未返回合格产出」 |
| 仅 `jurisdiction-auditor` 合格 | 风险类 `check_id` 同上处理 |
| 两支都不合格 | 进 `R`；两次仍不合格进 `H` |

任一支缺失时，`release_to_legal` 一律禁止，并在交给 `review-reporter` 的交接块里写明缺口范围。
