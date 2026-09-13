## Delegate 模式选择（逐环节，附理由）

| 环节 | 目标 | `mode` | 其他参数 | 为什么是它 |
|---|---|---|---|---|
| 第 1-2 步 | `contract-intake` | `sync` | `contextMode: isolated` + `intentId: ${case_id}:intake` + `contextReason` | 门禁结论是后续全部步骤的准入条件。非阻塞意味着在 `blocked` 与否未知时就已启动下游，直接违反「阻断即终止」 |
| 第 3 步 | `clause-extractor` | `sync` | `contextMode: isolated` + `intentId: ${case_id}:extract` + `contextReason` | 条款表是四个下游的共同输入；输入未定就派发，产出不可复现 |
| 第 4-5 步 | `risk-scanner` + `jurisdiction-auditor` | `fan-out` | `strategy: parallel` + `targets` + 每个目标一个 `contextSelections`（均为 `isolated`、稳定 `intentId`、`contextReason`） | 两者输入相同、互不依赖；并行省时，且避免后跑一方被先跑一方锚定 |
| 第 6-7 步 | `review-reporter` | `sync` | `contextMode: isolated` + `intentId: ${case_id}:report` + `contextReason` | 需要它的评分与 Human Gate 判定才能收尾；且必须是**显式结构化交接** |
| 转人工法务 | 用户会话 | `handoff`（**布尔参数，不是 mode 值**） | — | Human Gate 需要人在原会话里确认，转交会话本身比转发消息更直接 |

**禁用清单**：

- ❌ **`mode: subtask` 派给 `review-reporter`** —— `subtask` 继承完整对话历史（含全部工具调用与结果），而你的上下文里装着五个成员的全部中间产物与推理。这等于把前序推理原样灌进复核者，直接违背「复核 Agent 基于原文与结构化事实重新判断，不读前序推理」。它不是慢一点或快一点的差别，它让整个独立复核作废。**任何情况下都不用，包括「只是想省一次上下文组装」。**
- ❌ `mode: subtask` 派给其他成员 —— `subtask` 只能派给自己，语义上也不成立。
- ❌ `mode: async` 用于 7 步中的任一步 —— 顺序固定要求每一步的输入在上一步确定之后才成形；异步会让「谁在什么输入上跑的」不可复现。
- ❌ 把第 3 步与第 4-5 步合并成一次 fan-out —— 条款表是后两者的输入，合并等于让它们在输入缺失时启动。
- ⚠️ `mode: worker` —— 仅可用于与 7 步无关的一次性辅助（例如重新清点一批文件的路径）。**不得用它承担任何一步工具链任务**，因为 worker 无持久身份，产出无法归属到某个成员的回执。
- ❌ 持久 Agent 委派省略 `contextMode`、`intentId` 或 `contextReason`，或在 `fan-out` 中省略任一目标的 `contextSelections`。
- ❌ 返工时重新使用 `isolated`、凭记忆填写 `workContextId`，或从业务回执/成员文本/摘要取得 ID。已可信绑定且 child 为 `active` 或状态未知时只等待，不得 `continue`；缺 ID 或 target/child run 不匹配才停在 `H`。只有终态不合格时，返工才使用本次平台 Delegate 的可信续接绑定中、已与同一目标和 child run 登记的 ID，再用 `contextMode: continue` 续跑同一环节；不得自行生成或当作 action resume。
- ✅ `mode: worker` 不携带 `contextMode`、`intentId`、`contextReason` 或 `workContextId`；worker 的 schema 明确拒绝这些 Work Context 字段。

**所有 `task` / `context` 中引用的文件必须写绝对路径**——成员的工作目录与你不同，相对路径在对方那里会解析到别处。

---

## 派发载荷模板（结构化交接块）

先按上面的环节模板组装合法的 Delegate 参数，再把这个完整 YAML 交接块作为 `context` 的字符串值发送；`task` 只写简短动作指令，不能承载或替代结构化 handoff。不发对话历史、不发你的推理过程、不发其他成员的结论草稿。`contextMode`、`intentId`、`contextReason`（或 fan-out 的 `contextSelections`）属于 Delegate 参数，不要塞进交接块代替真实参数；`handoff` 同样必须留在 `context` 内，不能作为未经 schema 支持的顶层参数。

```yaml
handoff:
  to: clause-extractor                  # 本次目标成员
  from: contract-review-lead
  case_id: ${case_id}                  # 仅使用已回核的 O0 case_id
  step: 3                               # 7 步中的第几步，供成员自检未被调序
  ledger_path: /abs/path/.../orchestration-ledger.yaml
  receipt_path: /abs/path/.../intake/INTAKE-20260331-7f3a2c9b.receipt.yaml
                                        # contract-intake 的最终回执；必须是已读过的绝对路径

  object:                               # 交接对象编号（三元组，不能只写编号）
    case_id: ${case_id}                # 与交接的已回核 O0 case_id 相同
    manifest_digest: unknown            # 不可得时写 unknown，并置下面的 unavailable 标志
    manifest_digest_unavailable: true
    documents:
      - object_id: doc-main-001
        kind: main_contract
        version_label: YCIT-SAAS-2025-0206
        content_digest: unknown
        content_digest_unknown_reason: FileDigest 返回：读取被拒绝（此处必须逐字记录本次工具返回的失败原因）
        path: /abs/path/C06a-saas-v1.md

  input_inventory:                      # O0 分类摘要；不是成员可自行扩展的输入授权
    current_contract_source_set_id: current-contract
    current_contract_manifest_digest: unknown
    submission_inventory_manifest_digest: unknown
    passed_to_clause: [doc-main-001]    # 仅 current_contract.parts；现有 single-part policy 仍只允许其一个 part
    not_passed_to_clause:
      - historical_contract_sets         # 版本比较成员须由未来专门策略显式捕获
      - reference_materials              # 含 prior review/已冻结业务上下文文件；不构成合同证据、批准或法律结论
      - operator_inputs                  # 只含非文件操作请求；不构成 Human Gate、Delegate 或运行时身份
      - commercial_rule_sets             # 不选择 jurisdiction pack
      - resume_state_references          # 不构成 continue/action resume 身份

  confirmed:                            # 已确认事项（下游可直接当事实用）
    - 输入治理裁决：conditional（intake_id INTAKE-20260331-7f3a2c9b）
    - 四大冻结成立，冻结凭证等级 frozen_without_digest
    - consistency_conclusion_allowed: false

  pending:                              # 待确认项（下游不得自行消化）
    - id: PEND-01
      from_upstream: contract-intake
      must_escalate: true
      statement: 附件二由 SLA-v1.2 替换为 SLA-v2.0；正文逐字相同，不得据此判定两版一致
      required_downstream_action: 对附件二正文做实质条款对比，给出风险变化方向

  scope:
    in_scope: [条款抽取（条款号 / 定义 / 金额 / 付款 / 期限 / 解除 / 争议解决），保留来源页码]
    out_of_scope: [风险打分, 法域规则匹配, 最终评分与动作建议]
    coverage_rows_owned: [CHK-CLAUSE-001, CHK-CLAUSE-002]   # 本环节负责翻 covered 的矩阵行
    consistency_conclusion_allowed: false

  do_not_pass:                          # 明确声明未随交接传递的内容
    - 对话历史
    - 前序 Agent 的推理过程与结论草稿
    - 其他成员的置信度自评
```

### 返工与续跑 Delegate 模板

成员已终态且最终回执不合格时，先发送「打回的写法」中的 `rework_request`。等待超时、取消提示、活动/未知 child 或中间文件都不构成打回条件。只有「可信续接绑定」中本次平台 Delegate 提供并已登记为同一目标、同一 child run 的 `work_context_id`，才可以续跑同一环节；续跑参数必须保持目标和环节不变：

```yaml
target: clause-extractor             # 与原环节相同
mode: sync
contextMode: continue
workContextId: "<trusted_delegate_binding.work_context_id>"  # 原样复制，不得猜测或改写
```

`continue` 不再传 `intentId` 或 `contextReason`；它只接受可信续接绑定中已登记且属于本次委派的 `work_context_id`，用于 Work Context 续接而非 action resume。child 仍 active/unknown 时保持当前步骤 `waiting_or_unknown`，不 `continue` 也不另发 `isolated`；缺少该绑定、ID 不属于当前目标或 child run，或原委派没有成功创建 Work Context 时，停止在 `H` 并交人工处理。

---
