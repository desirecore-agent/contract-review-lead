---
name: review-orchestration
description: >-
  合同审查团队的编排主控。登记案件与合同对象、按 7 步固定工具链派发任务（结构化解析 → 完整性检查 →
  条款抽取 → 法域知识注入 → 风险判读 → 版本对比 → 报告输出）、执行输入治理门禁（judge=reject 即终止流水线）、
  按环节选择 Delegate 模式（sync / fan-out parallel，复核环节禁用 subtask）、对成员回执执行六项检查并打回
  不合格产出、在法务四类不可替代动作上路由 Human Gate。用户提到审合同、合同审查、审查进度、编排、
  流水线、派发、打回重做、签核点时使用。
  Use when orchestrating the contract review pipeline: registers the case, dispatches the fixed
  7-step tool chain to team members, enforces the intake gate, audits member receipts and returns
  non-conforming output for rework, and routes the four irreplaceable legal actions to a human gate.
version: 1.0.0
type: procedural
risk_level: medium
status: enabled
tags:
  - contract-review
  - orchestration
  - pipeline
  - gate-enforcement
  - delegation
  - human-gate
requires:
  tools:
    - Read
    - Ls
    - Glob
    - Grep
    - Write
    - Edit
    - MathCalc
    - GenerateUUID
    - Delegate
    - SendMessage
    - AskUserQuestion
metadata:
  author: DesireCore
  version: 1.0.0
  updated_at: '2026-08-31'
---

# 合同审查编排主控

## 何时使用

收到任何合同审查请求时**第一个**执行本技能。它是本团队唯一的流程入口——五个成员都不自行启动，全部由本技能派发。

## 不可协商的前提

1. **登记先于派发。**没有 `review_case` 与初始覆盖矩阵，不得派发任何任务。
2. **第一个任务恒定是输入治理。**不因材料看起来干净而跳过 `contract-intake`。
3. **`reject` 即终止。**`contract-intake` 的 `verdict` 是唯一判据，你不重评它的理由、不改判、不放宽。
4. **7 步顺序固定**，不跳步、不并步、不调序。唯一合法偏离见 O6 的 `not_applicable` 标记。
5. **不合格打回，不自己补齐。**
6. **禁止对 `review-reporter` 使用 `mode: subtask`。**

---

## 术语：编排状态机

```
                    ┌──────────────┐
   用户提交材料 ───▶ │ O0 REGISTERED│  登记案件 + 建矩阵（本 Agent 自己做）
                    └──────┬───────┘
                           │ Delegate sync → contract-intake
                    ┌──────▼───────┐
                    │ O1 INTAKE    │  第 1-2 步：结构化解析 + 完整性检查
                    └──────┬───────┘
             verdict=reject│         verdict=passed / conditional
              ┌────────────┴────────────┐
              ▼                         ▼
    ┌───────────────────┐        ┌──────────────┐
    │ X1 GATE_TERMINATED│        │ O2 EXTRACT   │  第 3 步（sync → clause-extractor）
    │  终止，交补齐清单  │        └──────┬───────┘
    └───────────────────┘               │
                                 ┌──────▼─────────────────────────┐
                                 │ O3 ANALYZE                     │  第 4-5 步
                                 │ fan-out parallel:              │
                                 │   risk-scanner ∥               │
                                 │   jurisdiction-auditor         │
                                 └──────┬─────────────────────────┘
                                        │ 两支都合格 / 部分成功（缺支记 blocked）
                                 ┌──────▼───────┐
                                 │ O4 REPORT    │  第 6-7 步（sync → review-reporter）
                                 └──────┬───────┘
                                        │ 命中 HG-01..04
                                 ┌──────▼───────┐
                                 │ O5 HUMAN_GATE│  等人确认，无超时自动通过
                                 └──────┬───────┘
                                        ▼
                                 ┌──────────────┐
                                 │ O6 DELIVERED │  交付并写编排回执
                                 └──────────────┘

横切状态（任一环节都可进入）：
  R  REWORK          回执不合格 → 打回同一成员重做（同环节累计上限 2 次）
  H  HALTED_FOR_HUMAN 打回 2 次仍不合格 / 成员无响应 / 版本矩阵阻断 → 停，交人工
  N  RESUBMITTED     材料补齐重提 → 回到 O0，新修订、整套重跑，不做增量
```

### 状态迁移表

| 从 | 事件 | 到 | 附带动作 |
|---|---|---|---|
| — | 收到合同材料 | `O0` | 生成 `case_id`、登记全部 `object_ref`、建初始矩阵（全 `blank`） |
| `O0` | 登记完成 | `O1` | `Delegate sync → contract-intake` |
| `O1` | `verdict: blocked` | `X1` | 终止；不派发任何下游；把 `remediation` 清单交用户 |
| `O1` | `verdict: passed` | `O2` | 冻结快照写入矩阵基线 |
| `O1` | `verdict: conditional` | `O2` | **同上，全量派发**；`pending` 项登记为矩阵待确认行 |
| `O1`/`O2`/`O3`/`O4` | 回执检查不合格 | `R` | 打回，`rework_count += 1` |
| `R` | 重做后合格 | 回原状态的下一态 | 记录打回历史 |
| `R` | 同环节 `rework_count == 2` 仍不合格 | `H` | 停止重试，两次回执一并交人工 |
| `O2` | 条款表合格 | `O3` | `Delegate fan-out parallel → [risk-scanner, jurisdiction-auditor]` |
| `O3` | 两支均合格 | `O4` | 矩阵对应行翻 `covered` |
| `O3` | 仅一支合格 | `O4` | 缺支的 `check_id` 全部记 `blocked`；禁 `release_to_legal`；**不得用另一支结论填补** |
| `O3` | 两支均不合格 | `R` → `H` | 按打回上限处理 |
| `O4` | 命中 HG-01..04 | `O5` | 暂停 `release_to_legal` / `emit_final_report` / `declare_version_consistency` |
| `O4` | 未命中任何 HG | `O6` | 直接交付（罕见；四类动作只要触及就必然命中） |
| `O5` | 人工 `approved` | `O6` | 写 `human_confirmations` |
| `O5` | 人工 `returned_for_rereview` | `R` 或 `N` | 按退回范围决定重做环节或整套重跑 |
| `O5` | 人工 `rejected` | `H` | 案件停在此处，状态保持 `pending` |
| 任意 | 版本矩阵 `jurisdiction_pack_version` 不一致 | `H` | 按阻断处理（`rules.md#R-021`） |
| 任意 | 成员无响应 / 派发失败 | `H` | 不静默重试第三次 |
| `X1`/`H` | 用户重提材料 | `N` → `O0` | 新 `case_id` 修订，整套 7 步重跑 |

**没有从 `X1` 直接到 `O2` 的边。**门禁终止后唯一出路是重新提交材料。

---

## 执行步骤

### O0 登记与受理

1. `GenerateUUID` 生成 `case_id`（形如 `case-2026-0831-001`，本地可读格式亦可，但一个案件内唯一且永不复用）。
2. 用 `Ls` / `Glob` 清点用户提交的全部文件，逐份登记为 `contract_document`：
   - `object_id`（`doc-main-001` / `doc-att-003` 形式）
   - `version_label`（取自文档自身声明；取不到写 `unknown` + `version_label_unknown_reason`）
   - `content_digest`（**当前平台无可用哈希工具，一律写 `unknown` + reason，见「摘要缺失」一节**）
   - `kind`（`main_contract` / `exhibit` / `amendment` / `side_letter`）
   - 绝对路径
3. 校验 `contract.yaml#INV-001`：有且仅有一份 `main_contract`。不满足直接 `H`，不派发。
4. 生成 `manifest_digest`：摘要不可得时写 `unknown` 并标 `manifest_digest_unavailable: true`。
5. 调用 `coverage-matrix` 技能建立**初始覆盖矩阵**，全部行状态为 `blank`。
6. 登记 `version_matrix` 六个维度（`skill_version` / `server_version` / `knowledge_base_version` / `jurisdiction_pack_version` / `parser_revision` / `ontology_version`）。
7. 开一份编排账本文件，落在**已确认可写的绝对路径**下（用当前工作目录解析，不写用户主目录字面量）。

**登记完成之前不得派发任何任务。**

### O1 输入治理（第 1-2 步）

`Delegate`，`mode: sync`，目标 `contract-intake`。交接块见「派发载荷模板」。

收到回执后：

- 先跑六项回执检查（见「回执检查」一节）。
- 读 `verdict` 字段：
  - `blocked` → 进 `X1`。**立刻停**：不派发、不预热、不询问「能不能先跑条款抽取」。把回执里的 `remediation` 原样交用户。
  - `conditional` → 进 `O2`，**全量派发、范围不缩减**，把 `pending[]` 逐条登记为矩阵待确认行并原样传给下游。
  - `passed` → 进 `O2`。
- 把 `freeze` 四项与 `consistency_conclusion_allowed` 写入矩阵基线。四项未全成立时，在编排账本标 `version_compare_allowed: false`（O4 的第 6 步据此处理）。

### O2 条款抽取（第 3 步）

`Delegate`，`mode: sync`，目标 `clause-extractor`。

`sync` 的理由：条款结构表是 `risk-scanner`、`jurisdiction-auditor`、`review-reporter` 三者的共同输入。非阻塞会让三个下游在输入未定时启动，产出无法复现。

### O3 法域注入 + 风险判读（第 4-5 步）

`Delegate`，`mode: fan-out`，`strategy: parallel`，目标 `[risk-scanner, jurisdiction-auditor]`。

并行的理由：两者输入完全相同（原文 + 条款结构表 + 规则包），互不依赖，输出互不覆盖。并行不仅省时，还天然保证两条判断线互不读对方结论——串行会让后跑的一方被先跑一方的措辞锚定。

**部分成功处理**（最易出错，见 principles L2）：

| 情况 | 处理 |
|---|---|
| 两支都合格 | 各自负责的 `check_id` 翻 `covered` |
| 仅 `risk-scanner` 合格 | 法域类 `check_id` 全部记 `blocked`，原因写「jurisdiction-auditor 未返回合格产出」 |
| 仅 `jurisdiction-auditor` 合格 | 风险类 `check_id` 同上处理 |
| 两支都不合格 | 进 `R`；两次仍不合格进 `H` |

任一支缺失时，`release_to_legal` 一律禁止，并在交给 `review-reporter` 的交接块里写明缺口范围。

### O4 版本对比 + 报告输出（第 6-7 步）

`Delegate`，`mode: sync`，目标 `review-reporter`。

**第 6 步的三态**：

| 条件 | 处理 |
|---|---|
| 有历史基线且四大冻结全成立 | 正常做版本对比，要求输出 `risk_direction` |
| 单一版本、无历史基线 | 标 `not_applicable` 并在报告显式记录——**标记不是跳过** |
| 四大冻结未全成立，或 `manifest_digest_unavailable` | `risk_direction` 只能是 `undetermined`；禁止任何一致性结论（`rules.md#R-013`） |

**交接块必须剔除的内容**（`rules.md#R-003`）：前序成员的推理过程、理由陈述、置信度自评、结论草稿。可以传的是：原文绝对路径、结构化事实（条款表 / 文档对象 / 规则包版本）、覆盖矩阵骨架、上游的 `failure_mark`（那是事实，不是推理）。

### O5 Human Gate

命中任一 HG 时暂停对应受限动作，用 `AskUserQuestion`（`wait_mode: always_wait`）或转 `handoff` 交人工。

| Gate | 触发范围 | 阻断的动作 |
|---|---|---|
| `HG-01` 付款触发与回款 | 金额、逾期违约金、结算周期、付款触发条件、发票回款 | `release_to_legal`, `emit_final_report` |
| `HG-02` 争议解决机制 | 管辖权、仲裁/诉讼选择、机构与地点、适用法律、送达 | `release_to_legal`, `emit_final_report` |
| `HG-03` 责任与违约分配 | 责任上限、间接损失排除、赔偿、保证免责、不可抗力 | `release_to_legal`, `emit_final_report` |
| `HG-04` 生效要件 | 有效签章、签署人权限、依赖附件、法定形式、生效条件 | `release_to_legal`, `emit_final_report`, `declare_version_consistency` |

**无超时自动通过。**未确认即停在该动作，案件状态保持 `pending`。确认结果写入回执 `human_confirmations`（`gate_id` / `confirmed_by` / `confirmed_at` / `decision`）。

禁止的替代做法：提示风险后继续、超时默认通过、降级为「建议」放行、由你自行判断「本次影响不大」。

### O6 交付

写编排回执并交付。回执必备：对象版本（`object_ref[]`）、规则版本（各层 pack version）、证据位置、执行 Agent 清单、人工确认点、**全部打回记录**、**全部留白记录**。

---

## Delegate 模式选择（逐环节，附理由）

| 环节 | 目标 | `mode` | 其他参数 | 为什么是它 |
|---|---|---|---|---|
| 第 1-2 步 | `contract-intake` | `sync` | — | 门禁结论是后续全部步骤的准入条件。非阻塞意味着在 `reject` 未知时就已启动下游，直接违反「阻断即终止」 |
| 第 3 步 | `clause-extractor` | `sync` | — | 条款表是四个下游的共同输入；输入未定就派发，产出不可复现 |
| 第 4-5 步 | `risk-scanner` + `jurisdiction-auditor` | `fan-out` | `strategy: parallel` | 两者输入相同、互不依赖；并行省时，且避免后跑一方被先跑一方锚定 |
| 第 6-7 步 | `review-reporter` | `sync` | — | 需要它的评分与 Human Gate 判定才能收尾；且必须是**显式结构化交接** |
| 转人工法务 | 用户会话 | `handoff`（**布尔参数，不是 mode 值**） | — | Human Gate 需要人在原会话里确认，转交会话本身比转发消息更直接 |

**禁用清单**：

- ❌ **`mode: subtask` 派给 `review-reporter`** —— `subtask` 继承完整对话历史（含全部工具调用与结果），而你的上下文里装着五个成员的全部中间产物与推理。这等于把前序推理原样灌进复核者，直接违背「复核 Agent 基于原文与结构化事实重新判断，不读前序推理」。它不是慢一点或快一点的差别，它让整个独立复核作废。**任何情况下都不用，包括「只是想省一次上下文组装」。**
- ❌ `mode: subtask` 派给其他成员 —— `subtask` 只能派给自己，语义上也不成立。
- ❌ `mode: async` 用于 7 步中的任一步 —— 顺序固定要求每一步的输入在上一步确定之后才成形；异步会让「谁在什么输入上跑的」不可复现。
- ❌ 把第 3 步与第 4-5 步合并成一次 fan-out —— 条款表是后两者的输入，合并等于让它们在输入缺失时启动。
- ⚠️ `mode: worker` —— 仅可用于与 7 步无关的一次性辅助（例如重新清点一批文件的路径）。**不得用它承担任何一步工具链任务**，因为 worker 无持久身份，产出无法归属到某个成员的回执。

**所有 `task` / `context` 中引用的文件必须写绝对路径**——成员的工作目录与你不同，相对路径在对方那里会解析到别处。

---

## 派发载荷模板（结构化交接块）

只发这个块。不发对话历史、不发你的推理过程、不发其他成员的结论草稿。

```yaml
handoff:
  to: clause-extractor                  # 本次目标成员
  from: contract-review-lead
  case_id: case-2026-0831-001
  step: 3                               # 7 步中的第几步，供成员自检未被调序
  ledger_path: /abs/path/.../orchestration-ledger.yaml

  object:                               # 交接对象编号（三元组，不能只写编号）
    case_id: case-2026-0831-001
    manifest_digest: unknown            # 不可得时写 unknown，并置下面的 unavailable 标志
    manifest_digest_unavailable: true
    documents:
      - object_id: doc-main-001
        kind: main_contract
        version_label: YCIT-SAAS-2025-0206
        content_digest: unknown
        content_digest_unknown_reason: 运行环境无可用哈希工具，摘要凭证缺失
        path: /abs/path/C06a-saas-v1.md

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

---

## 回执检查（六项，全部通过才更新矩阵）

收到任何成员回执后逐项核对。**任一项不通过 → 打回，不更新矩阵。**

| # | 检查项 | 判据（不合格的具体形态） |
|---|---|---|
| **RC-1** | **对象身份一致** | 回执的 `object_ref` 三元组与登记时不一致，或 `manifest_digest` 对不上 → 立即停，不猜。摘要为 `unknown` 时降级为 `object_id + version_label` 匹配，并在矩阵标 `identity_weakly_matched: true` |
| **RC-2** | **结论四元组齐备** | 任一条结论缺 条款编号 / 证据位置（页码） / 结论等级 / 对应动作 中的任一项。`conclusion_level` 非 `blank` 却缺 `clause_no`、`page` 或 `quote` 时同样不合格（`INV-011`） |
| **RC-3** | **证据可追溯** | `quote` 无法在其声明的文件中原文命中。用 `Grep` 固定字符串抽检：全部 `block` 级结论 100% 抽检；其余条目总数 ≤20 时全量，>20 时随机 30% 且不少于 6 条。命中失败任一条 → 整份打回 |
| **RC-4** | **pending 有落点** | 上游交接块中的每个 `pending.id` 在本回执里都必须被显式承接（消化 / 升级 / 留白三选一）。静默消失 → 打回 |
| **RC-5** | **范围合规** | 越界产出（如 `clause-extractor` 给出风险评分）、或引用了前序 Agent 的推理过程作为依据 → 打回 |
| **RC-6** | **回执字段完整** | `receipt` 缺 对象版本 / 规则版本 / 证据位置 / 执行 Agent / 人工确认点 任一项（`rules.md#R-005`，违反时下一步不得启动） |

### 打回的写法

打回消息只包含三段，**不含替代结论、不含建议措辞**：

```yaml
rework_request:
  to: clause-extractor
  case_id: case-2026-0831-001
  attempt: 1                            # 本环节第几次打回，上限 2
  failures:
    - receipt_item_id: CL-014
      check: RC-2
      missing: [evidence.page, action]
      rule_ref: contract.yaml#INV-011
    - receipt_item_id: CL-021
      check: RC-3
      detail: quote 在 /abs/path/C06a-saas-v1.md 中未原文命中
      rule_ref: rules.md#R-012
  unchanged_scope: true                 # 任务范围不变，不因打回而缩减或扩大
```

**禁止在 `failures` 里写「应该改成……」。**说清缺什么、依据哪条规则即可；说了应该写成什么，成员照抄，等于你判了那条结论。

### 打回上限

同一环节 `attempt` 达到 2 且仍不合格 → 停止重试，进 `H`，把两次回执与两次检查记录一并交人工。**不得第三次派发同样的任务**——第三次通常不是成员能力问题，而是任务描述或输入本身有缺陷，继续重试只是消耗算力。

---

## 摘要缺失的如实表达

当前运行环境**无法计算 `content_digest` 与 `attachment_manifest_digest`**：成员禁用了 `Bash`，平台也没有内置哈希工具。

**正确处理**（如实降级，不假装完整）：

```yaml
freeze:
  master_version: {frozen: true, evidence_level: field_matched}
  attachment_manifest: {frozen: true, evidence_level: field_matched}
  page_range: {frozen: true, evidence_level: field_matched}
  execution_status: {frozen: true, evidence_level: field_matched}
  all_frozen: true
  freeze_evidence_level: frozen_without_digest    # 冻结成立，但无摘要凭证
  digest_unavailable_reason: 运行环境无可用哈希工具（成员禁用 Bash，平台无内置哈希工具）
  consistency_conclusion_allowed: false           # 因摘要缺失强制为 false
```

**由此产生的三条硬约束**：

1. 对象身份判定降级为 `object_id + version_label` 弱匹配，矩阵标 `identity_weakly_matched: true`。
2. **禁止输出任何一致性结论**（「一致」「无差异」「差异为 0」）。
3. 版本对比的 `risk_direction` 只能是 `undetermined`，或有实证支撑的「上升 / 下调」；**永远不能是「持平」**——「持平」是一个一致性结论，需要摘要作证。

**错误处理**（禁止）：把 `content_digest` 填成文件路径、文件大小、修改时间或任意占位值；或省略该字段让下游以为已核验；或因为「四项字段都对上了」就把 `freeze_evidence_level` 写成完整。

---

## 自检清单（每次案件推进前逐条确认）

**门禁**

- [ ] 第一个派发的任务是 `contract-intake`，没有任何任务在它之前发出
- [ ] `verdict: blocked` 时没有派发任何下游、没有并行预热、没有询问能否放宽
- [ ] `verdict: conditional` 时下游范围**未缩减**，`pending` 已原样传递
- [ ] 没有因为「阻断只涉及某份附件」而自行放宽——例外范围由 `contract-intake` 判定

**顺序**

- [ ] 7 步按 1→2→3→4/5→6→7 执行，没有跳步、并步、调序
- [ ] 第 3 步完成并检查合格后，才发起第 4-5 步的 fan-out
- [ ] 第 6 步若不适用，是标了 `not_applicable` 并记录，不是静默跳过

**Delegate**

- [ ] `contract-intake` / `clause-extractor` / `review-reporter` 用的是 `mode: sync`
- [ ] `risk-scanner` + `jurisdiction-auditor` 用的是 `mode: fan-out` + `strategy: parallel`
- [ ] **没有对 `review-reporter` 使用 `mode: subtask`**
- [ ] 交接块里没有对话历史、没有前序推理、没有其他成员的结论草稿
- [ ] `task` / `context` 中每一个文件引用都是绝对路径

**回执与打回**

- [ ] RC-1..RC-6 六项全跑，没有因为「看起来没问题」而略过 RC-3 的原文抽检
- [ ] 打回内容只写缺什么与规则依据，没有写「应该改成……」
- [ ] 没有自己补齐任何缺项
- [ ] 同环节打回次数 ≤2，达到 2 次已转 `H` 而不是第三次派发

**并行分支**

- [ ] 部分成功时，缺失分支的 `check_id` 全部记 `blocked`
- [ ] **没有用一支的结论去填补另一支缺失的矩阵行**
- [ ] 缺支时已禁止 `release_to_legal`，并在给 `review-reporter` 的交接块写明缺口范围

**Human Gate**

- [ ] 命中的 HG 已暂停对应受限动作，没有预填确认结果、没有设超时自动通过
- [ ] 确认结果已写入 `human_confirmations` 四字段

**摘要与冻结**

- [ ] `content_digest` 不可得时写的是 `unknown` + reason，不是路径、大小或占位值
- [ ] `freeze_evidence_level` 如实写了 `frozen_without_digest`
- [ ] 全文没有出现「一致」「无差异」「差异为 0」「持平」

**留痕**

- [ ] 编排账本记了每次派发、每份回执、每次打回、每处留白、每个人工确认
- [ ] 账本落在已确认可写的绝对路径下，没有写死用户主目录字面量
