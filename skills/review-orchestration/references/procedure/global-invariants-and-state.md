## 何时使用

本技能只编排**完整**合同审查。收到用户已经提交合同材料、或当前消息明确指向由用户提交的合同文件，且已明确要求审查时执行；五个成员都不自行启动，全部由本技能派发。

用户已明确“仅登记/建立或补充待补 context/不要委派、抽取或实质审查”时，必须直接调用 `Skill review-registration`，不要先加载、摘录或执行本技能的完整 O0。若本技能被误选，停止在此处并转向该短技能，不使用本技能的工具链。明确要求审查合同的普通表达已是完整审查授权，不要求固定口令；只有材料已提交但范围确实含混时，才可一次询问范围。这个限制不妨碍 Human Gate 或当前步骤需要的真实事实澄清。

用户只是在询问“审查需要什么材料”或表达审查意愿、当前消息没有合同/附件或明确文件指向时，不进入本技能和 O0。先用自然语言索要合同正文、全部附件、我方身份、适用法域/争议解决地和审查目标；可选索要历史版本与交易背景。此咨询节点为**零工具**：不得扫描工作区或历史会话，不得登记案件、生成 ID、写账本或派发成员。工作区残留文件不构成本轮用户提交。

## 不可协商的前提

1. **完整审查授权后的登记先于派发。**没有用户明确开始完整审查的授权、`review_case` 与初始覆盖矩阵，不得派发任何任务。
2. **第一个任务恒定是输入治理。**不因材料看起来干净而跳过 `contract-intake`。
3. **`blocked` 即终止。**`contract-intake` 的 `verdict` 是唯一判据，你不重评它的理由、不改判、不放宽。
4. **O1 只委派，不代写。**`intake.yaml`、输入治理回执、`verdict` 与 `pending` 的作者只能是 `contract-intake`。O1 等待其有效回执期间，lead 只能写编排账本中的派发、等待与阻断状态；不得读取材料后自行生成、编辑、合成或补全上述 intake 产物，也不得把已派发当成已完成。对会阻塞到成员终态的 `mode: sync`，调用前与工具阻塞期间账本必须保持 `O0_REGISTERED` / intake `not_started`，不能预写 `dispatched` 或 `waiting_or_unknown`；只有工具返回后才按本技能的真实返回记录与回执规则更新。
5. **7 步顺序固定**，不跳步、不并步、不调序。唯一合法偏离见 O6 的 `not_applicable` 标记。
6. **不合格打回，不自己补齐。**
7. **禁止对 `review-reporter` 使用 `mode: subtask`。**
8. **Lead 根与成员产物必须分属。**当前案件工作区的 canonical `contract-review/` 目录只承载 Lead 的 review context、账本与覆盖矩阵；不得把该目录路径本身写成文件，也不得静默改用其他目录。成员在各自确认的 workspace 创建唯一产物并返回绝对 `artifact_path`；Lead 只读、核验和登记该路径，绝不指定、写入或覆盖成员产物文件。
9. **材料提交是 O0 的唯一入口。**没有当前用户提交的合同或明确文件指向，不得执行 O0 的 `Ls` / `Glob`，不得通过扫描历史工作区来推定材料已提交。
10. **完整审查连续推进。**用户已明确授权完整审查时，按固定顺序连续执行当前已获授权且可执行的常规步骤；O1 的真实 `passed` 或 `conditional` 回执通过下文 RC 后即继续 O2，不得在准备步骤后为逐步确认而结束或询问“是否继续”。提问前先实际 `Read` 当前 `review-context.yaml` 和本轮已提交的操作者业务上下文文件（如有），并复核当前请求已明确的事实；已明确的审查立场、目的、范围或其他事实必须原样复用，不得重复询问。只有既有规则要求的实际等待/状态未知、HOLD、Human Gate、在上述上下文中确实缺少或相互冲突的事实澄清，或用户明确暂停、停止或限缩范围，才可停止推进；这不改变仅登记或用户明确 O0-only 的限制，也不允许发明用户授权。

### Delegate Work Context 兼容说明

当前 Delegate schema 不会为持久 Agent 委派推断或补默认 Work Context。`sync`、`async` 和 `fan-out` 必须显式选择 Work Context；普通新环节使用 `contextMode: isolated`，同时提供稳定的 `intentId` 与说明性的 `contextReason`。`worker` 不传任何 Work Context 字段。

**可信续接绑定是唯一 ID 来源。**仅本次平台 `Delegate` 返回的受信续接指引可提供 `work_context_id`；Lead 必须把其原样登记为 `work_context_id`，并同时登记该次 `target` 与 `child_run_id`。业务回执、`artifact_path` 所指文件、成员最终文本、工具摘要或其自报 ID 都不是可信来源，不能补全或证明这个绑定。`contextMode: continue` 只用于同一目标、同一 child run 的 Work Context 续接，不是 action resume：已可信绑定且 child 为 `active` 或状态未知时，保持当前步骤 `waiting_or_unknown`，不得 `continue` 或另发 `isolated`；缺 ID、目标/child run 不符才 `HALTED_FOR_HUMAN`；只有该 child 已终态、最终回执可读且被判为不合格时才可使用已登记 ID。不得猜测、拼接或发明 ID。

---

## 术语：编排状态机

```
                    ┌──────────────┐
    用户提交材料 ───▶ │ O0 REGISTERED│  先建并回核 review context
                    └──────┬───────┘
            仅登记范围 ────┤ 转 `review-registration`（本技能不执行）
          完整审查已授权 ──┘ Delegate sync + isolated context → contract-intake
                    ┌──────▼───────┐
                    │ O1 INTAKE    │  第 1-2 步：结构化解析 + 完整性检查
                    └──────┬───────┘
            verdict=blocked│         verdict=passed / conditional
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
| — | 收到本轮合同材料或明确文件指向，且用户仅授权登记/context | — | 转 `review-registration`；本技能不建矩阵、不冻结、不派发 |
| — | 收到本轮合同材料或明确文件指向，且用户明确开始完整审查 | `O0` | 生成 `case_id`、登记全部 `object_ref`、规则源预检后按 coverage policy 建初始矩阵 |
| `O0` | 已明确完整审查授权且完整 O0 完成 | `O1` | `Delegate sync` + `contextMode: isolated`、`${case_id}:intake` → `contract-intake` |
| `O1` | `verdict: blocked` | `X1` | 终止；不派发任何下游；把 `remediation` 清单交用户 |
| `O1` | `verdict: passed` | `O2` | 冻结快照写入矩阵基线 |
| `O1` | `verdict: conditional` | `O2` | **同上，全量派发**；`pending` 项登记为矩阵待确认行 |
| `O1`/`O2`/`O3`/`O4` | 回执检查不合格 | `R` | 打回，`rework_count += 1` |
| `R` | 重做后合格 | 回原状态的下一态 | 记录打回历史 |
| `R` | 同环节 `rework_count == 2` 仍不合格 | `H` | 停止重试，两次回执一并交人工 |
| `O2` | 条款表合格 | `O3` | `Delegate fan-out parallel` + 两项 `contextSelections` → `[risk-scanner, jurisdiction-auditor]` |
| `O3` | 两支均返回合格分支回执 | `O4` | 仅按 `coverage-matrix` 对回执逐 ID 明确且证据闭合的行更新五状态；未声明行保持 `blank`，分支合格本身不表示其全部行 `covered` |
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

已在当前请求中明确的完整审查授权（包括普通“请审查这份合同”的自然表达）足以触发完整 O0，且不得重复追问。缺审查视角或未定/冲突法域只限制相应 output_constraints，不会撤销这一完整审查授权或阻止 O1 事实输入治理；受限登记的停止、更新和回复规则仅由 `review-registration` 定义。

---
