# Lead 审查上下文

`review-context.yaml` 是单一冻结 O0 案件的闭合、Lead 自有声明记录。它把用户明确要求的审查视角和候选法域审查基准，与文件身份、Delegate 身份、Human Gate 批准和法律结论分开。

首次写入前，Lead 必须实际读取本记录的 schema 与 template，以 template 为骨架写入，并对照闭合分支回读结果；YAML 文件可读不等于符合 schema。用户把本轮明确限定为登记或补齐 context 时，该范围就是本轮最终选择：Lead 不得再次询问是否启动完整审查，只创建该闭合记录，不推断材料事实、不预检规则包、不冻结清单、不建立矩阵、不委派或启动审查；后续仅补充澄清本身也不扩大该用户授予的范围。同案、同材料状态的更新必须先读已有记录，只有闭合记录实际变化才写入 `revision + 1`。

记录只能引用本轮用户明确陈述、一个带 O0 SHA-256 与有限定位信息的当前合同 part，或已核验的 Intake S8 回执引用。这些都是 Lead 需要对照案件产物核验的来源声明；它们不认证合同方代表权、授权、法律适用、平台身份。特别地，`review_subject_label` 只说明方向性审查应考虑谁的商业视角，绝不表示用户代表或有权代表该合同方。

只有唯一的用户陈述或当前 part 线索候选，且已有已读、已 pin、服务范围支持的规则包时，才使用 `jurisdiction.status: candidate_basis`。该候选仍只是审查基准，不是最终准据法或管辖结论。已识别候选但规则包实际不可得时，记录 `RULE_SOURCE_UNAVAILABLE` 和 `required_from: lead`，按既有规则源失败停止；它不是缺少用户澄清。`undetermined` 要求澄清且只允许事实提取；`conflicting` 保留全部候选、不默认择一，并路由 `HG-02`。

`output_constraints` 限制下游可发出的结论范围，不证明已经发出结论、不授予文件或工具权限、不满足 Human Gate，也不授权 Delegate 续接。缺审查立场时，仅禁止方向性风险、redline 和谈判建议；法域未定或冲突时，仅禁止法域实体结论。两者都不禁止事实提取，也不阻断原本已获用户授权的完整审查输入治理。

用户在未替换提交材料的情况下补充澄清时，Lead 对同一案件和同一当前清单状态写入更高 `revision`，在账本历史中保留旧记录，并通过普通 `isolated` 编排仅重跑受影响分析。不得凭空构造工作上下文 ID、把旧摘要作为身份，或把该过程称为平台 `continue` 或 action resume。O3 与 reporter 交接固定使用 `review_context_path`、`review_context_case_id`、`review_context_revision`、`review_context_current_manifest`、`review_context_output_constraints`；成员回执使用 `review_context_echo` 回显 `case_id`、`revision`、`current_manifest` 与 `actual_output_constraints`。RC、覆盖矩阵更新或 O4 前，Lead 必须读取当前 context 并拒绝不一致回执 `REJECT-STALE-REVIEW-CONTEXT`；旧受影响结果标记 `superseded_context_revision`，不得覆盖当前产物。

context 对账只会移除已经过期的审查上下文澄清项，不能关闭已有 Human Gate、待处理 gate artifact 或 `blocked_by_human_gate` 状态。包括 `HG-02` 在内的这些 gate 仍以账本、所需真人回执和 reporter 为权威。

本契约暂不修改 risk-scanner、jurisdiction-auditor 或 review-reporter。后续消费者在依赖它前必须核验路径、案件绑定、revision、来源约束和输出约束。
