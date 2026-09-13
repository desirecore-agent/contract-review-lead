### 编排账本状态写入硬闸

账本是案件状态的事实来源，不能只在 O0 登记而把后续状态留成 `pending`。`mode: sync` 在调用方可见返回前会阻塞，故首次 O1 `Delegate` 前和该工具阻塞期间必须保持 `status: O0_REGISTERED` 与 intake `steps[*].status: not_started`：不得预填 `dispatched_at`、`waiting_or_unknown`、`child_run_id` 或 `work_context_id`，也不得把裸 `task`、`intentId`、工作目录、成员回执、摘要、`null` 或自造值当作派发事实。只有 `Delegate` 成功返回后，才先 `Read` 当前账本并以一次 `Edit` 记录 `status: O1_INTAKE`、intake `steps[*].status: returned`、模型可见且本次实际目标的 `target`、模型可见的非空 `child_run_id` 与实际 `returned_at`；在 `run_ids` 保留已有 lead run 并追加该真实 child run，随后立即 `Read` 回读验证。`work_context_id` 只可在本次平台返回的**公开可信续接 binding**确实提供时原样登记；普通 sync 返回没有该 binding 时不得猜测、补写或为了补齐而另发委派，且不得 `contextMode: continue`。成功返回未明确给出实际 target 或非空 child run、账本更新失败、目标段不存在或回读不符时，停止在 `H` 并报告 `REJECT-LEDGER-STATE`，不得声称已派发、已完成或可续跑。

至少按下列迁移写入 `status`、对应 `steps[*].status`、`completed_steps`、`run_ids`、`artifacts`、`human_gates` 和 `blocked_reasons`：普通 sync 只在上述真实返回记录回读闭合后才可停在 `O1_INTAKE`，随后由回执 RC 决定第 1-2 步为 `completed` 并转 `O2_EXTRACT`，或写入 `H`；不得把 `returned` 视为输入治理合格。Clause v2 的同次 Compose 命名观察与 release-owned contract 全通过后才把第 3 步写为 `completed` 并转 `O3_ANALYZE`；风险与法域两支均合格后分别记录两个子 run 和产物并转 `O4_REPORT`；reporter 回执合格后把第 6-7 步写为 `completed`，记录 `report_path`、覆盖缺口和全部 Human Gate，命中任一 HG 时必须写 `HALTED_FOR_HUMAN`（或等价 `O5_HUMAN_GATE`）并把每个 gate 记录为 `pending`。只有用户明确给出人工决定后，才允许迁移到 `O6_DELIVERED`。

任何下游未启动、回执不合格或成员无响应都必须写入 `blocked_reasons`，不能用 `pending` 掩盖已发生的失败或已完成的步骤。`run_id` 必须同时保留外层 lead run 和每个 Delegate 子 run；若成员回执中的案件/内部 run 标识与外层运行不一致，原样记录 `identity_discrepancy` 并保持人工阻断，不得静默覆盖成单一 ID。账本更新属于本技能的必做产物，不以模型是否“打算稍后补写”为完成条件。

**只有已明确完整审查授权且完整 O0 完成后才可派发任务。**

### O1 输入治理（第 1-2 步）

`Delegate`，`mode: sync`，目标 `contract-intake`，并显式创建本案件的独立 Work Context。`task` 必须是简短的动作指令；完整、可审计的交接载荷必须是下方 YAML 原文，并作为唯一的 `context` 字符串传入。`handoff` 不是 Delegate 的顶层参数，不能把它、`case_id` 或其他载荷字段塞进 `task`、`intentId` 或 Work Context 代替 `context`：

```yaml
target: contract-intake
mode: sync
contextMode: isolated
intentId: "${case_id}:intake"
contextReason: "合同案件输入治理与受理门禁。"
task: "仅按 context 中已验证的 Intake handoff 执行输入治理；不得扩大范围，也不得从 task、intentId 或 Work Context 补全缺失字段。"
context: <下方完整 YAML 交接块的原文>
```

O1 `context` 中的交接块必须单列完整、顺序固定的 Intake 步骤要求；这组值是对 `contract-intake` 的真实回执 `checks[].id` 的要求，不是 Lead 矩阵 ID。

**O1 派发前闭合核验（双集合摘要交接）。**Lead 写入 `handoff.case_id` 时，只能使用本次 O0 已实际回核的 `case_id`：真实 `GenerateUUID` 值，或 O0 允许的固定 `case-` 加该 UUID（同案更新则使用已核验保留的旧值）；在 `Delegate` 前必须实际 `Read` 回核它同时等于 `review-context.case_binding.case_id` 与 `orchestration-ledger.case_id`，不等则记录 `O1_CASE_ID_BINDING_INVALID` 并 HOLD。不得从 `intentId`、Work Context、旧回执或成员文本推导。随后对**恰为** `current_contract.parts` 的规范路径调用一次真实 `FileDigest` 并取得其完整 aggregate：不得用完整提交集合的 `submission_inventory`、任何单文件或旧任务 aggregate 替代。实际 `Read` 回读 `review-context` 与 `orchestration-ledger` 后，构造本次 handoff；同一个 current aggregate 必须逐字同时写入并比较四处：`review-context.case_binding.current_contract_manifest.digest`、`orchestration-ledger.manifest.current_contract_manifest_digest`、`handoff.object.manifest_digest`、`handoff.input_inventory.current_contract_manifest_digest`。`object.documents` 必须恰为同一 `current_contract.parts`，绝不得混入 `operator_input`、历史、参考或其他总提交文件；`submitted_file_paths` 与 `submission_inventory_manifest_digest` 仍是完整用户提交集合，二者不得互代。任一 aggregate 缺失/unknown、四处任一不等、集合范围不自洽，或 Intake 复核的完整提交 aggregate 与 submission 值不等时，先只用 `Edit` 修正 Lead 自有的 context/ledger 并再次 `Read` 闭合核验；仍不能得到真实 current aggregate 或仍不等，记录 `O1_MANIFEST_CONTRACT_INVALID` 并 HOLD，**不得 Delegate**、不得消费回执或进入 O2。仅当 `FileDigest` 明确报批量参数形态错误时可按 O0 在同一完整集合内纠正一次；纠正后 aggregate 成功就是可用摘要，不能把先前形态错误留作 `*_manifest_digest_unavailable`、`unknown` 或 `frozen_without_digest` 的理由。S4 的 `attachment_manifest_digest` 仍只表示四字段对账表摘要，不能写入、比较或镜像任一 FileDigest 集合摘要。

**首次 O1 `Delegate` 前的最终结构重验。**第 8 项的预检以及对这两个被校验 exact 文件（inventory 或 review-context）的 Lead 自有 `Write` / `Edit` 都可能使相应校验过期。完成既有四处 current-manifest 集合比较和所有允许的 Lead 自有修正后、首次 `Delegate` 紧前，必须分别 `Read` 两个当前 exact 文件，并以各自同一 release-owned schema 和 `format: yaml` 再调用 `StructuredFileValidate`；两个结果均须工具成功且 `valid: true`。此处以**最后一次**紧邻 Delegate 的结果为准：较早的 `valid: true` 不能覆盖其后的 timeout、工具 error、`valid: false`、不匹配或没有明确成功结果。任一该类失败只允许以真实错误码/结果写入 `O1_FINAL_STRUCTURE_VALIDATION_FAILED` 的 `H`（HOLD）记账，保持 intake `not_started`；不得写 `O1_INTAKE`、`dispatched` 或 `waiting_or_unknown`，**不得 Delegate**。成功后只有修改这两个被校验 exact 文件中的任一文件才使该文件旧校验失效并要求再次 `Read`、重验；账本、矩阵、回执路径或其他未被本闸门校验的产物编辑本身不触发这两个文档的重验，但也绝不补救或覆盖最终校验失败。该最终单文件闸门不替代本段四处摘要的集合比较、`INV-001`、任何 Human Gate 或 O2 的 `StructuredFileValidateCompose`。

`context` 的值必须是以下**完整 YAML 文本**，根键为 `handoff`；它不是另一条工具调用、不是顶层 Delegate 参数，也不能只发送其中的 `case_id`：

```yaml
handoff:
  case_id: ${case_id}
  to: contract-intake
  from: contract-review-lead
  intake_gate_steps_required: [S1, S2, S3, S4, S5, S6, S7, S8]
  review_context_path: /abs/path/to/lead-workspace/contract-review/review-context.yaml
  submitted_file_paths:                 # 全部用户提交；S1 必须完整批量复核
    - /abs/path/contract.md
    - /abs/path/appendix-a1.md
    - /abs/path/intake.json
  object:
    manifest_digest: <current_contract_manifest_digest> # 兼容镜像，仅 current 合同集
    documents:                          # 仅 current_contract.parts；不含 intake.json
      - {object_id: doc-main-001, kind: main_contract, path: /abs/path/contract.md}
      - {object_id: doc-att-002, kind: exhibit, path: /abs/path/appendix-a1.md}
  input_inventory:
    current_contract_manifest_digest: <64-lowercase-sha256-or-unknown>
    submission_inventory_manifest_digest: <64-lowercase-sha256-or-unknown>
```

仅在上述完整 `context` 已由刚刚 `Read` 的 O0 inventory、review-context 与 ledger 的当前事实构造，且本节全部闭合核验与最终结构重验均成功后，才调用**一次**该 `sync` Delegate。调用前保持 `O0_REGISTERED` / intake `not_started`；工具阻塞期间没有可供 Lead 写入的成功返回，不能先写 `O1_INTAKE`、`dispatched`、`waiting_or_unknown` 或任何 child/Work Context ID。任何必填交接字段缺失、不能从这些已读事实取得、或载荷不再与它们逐值一致时，记录 `O1_MANIFEST_CONTRACT_INVALID` 并 HOLD，**不得 Delegate**；不得把裸 `case_id` 当作交接、不得从 `task` / `intentId` / Work Context 推断或补写 `handoff.case_id`。返回后只按「编排账本状态写入硬闸」记录模型可见的真实 target/child run；没有平台公开可信续接 binding 时不 `continue`。Intake 只验证并返回其回执及后续所需的 handoff 事实；只有 Lead 完成既有 RC 与账本更新后，才可走唯一的 O2 `clause-extractor` 派发路径。

收到回执后：

- **先验证这是一份可读、可归属的 `contract-intake` 最终回执。**`Delegate` 返回或账本处于 `O1_INTAKE` 不等于输入治理完成。必须 `Read` 回读回执的绝对路径；若它返回 `artifact_path`，原样复制完整绝对路径（不删除 UUID 或 `agents` 路径段、不猜测或重拼）并对该精确路径再 `Read`。任一读取失败时不得凭最终文本、工具摘要或中间文件完成 RC-1..RC-6。确认作者为 `contract-intake`、对象身份与本案一致、回执通过 RC-1..RC-6，且含有其自身产生的 `verdict`（`blocked` / `passed` / `conditional`）与适用的 `pending`/`remediation`。在这之前不得写或编辑 `intake.yaml`、输入治理回执、`verdict` 或 `pending` 来填空。
- **两个 manifest 摘要必须分别镜像且完整相等。**从 exact 回执逐字段读取 `input_inventory.submission_inventory_manifest_digest` 与 `input_inventory.current_contract_manifest_digest`，分别和 Lead O0 inventory/ledger 中原先冻结的全部提交文件清单摘要、当前合同 parts 清单摘要比较。两项都可得时必须各自完全相等；总提交摘要不等即 RC-1 无效，即使当前合同子集摘要相等也不得降级为 `conditional`、不得进入 O2。返回 `contract-intake` 修正其回执并保留原 O0 事实；Lead 不得编辑回执、删掉非合同提交（包括冻结在 `reference_materials` 的 intake 业务上下文文件）或用合同子集摘要替代总提交摘要。
- **八项 Intake 步骤是有效回执的必要组成。**`checks[]` 必须逐项且恰好一次给出本节映射表中的真实 `S1`–`S8`，并保留其对应的真实检查语义；不得用相近名称猜测、重排或自造同名编号。只有先按 RC-1..RC-6 核验该回执，再按本节映射消费其有效 `checks[]`，Lead 才能更新相应的 `CHK-INTAKE-*` 矩阵行。`pass` 的真实检查及其回执证据才可按既有矩阵协议翻 `covered`；非 `pass` 的项保留原始状态与证据/阻断原因，不能由 Lead 补成 `covered`。
- **回执缺失或无效时停在 O1。**缺任一步、步骤重复、未知步骤 ID、检查语义与映射不符、或未通过 RC-1..RC-6 时，记录 `O1_INTAKE_GATE_STEPS_INVALID`（及具体缺失/错映原因）和 `O1_INTAKE_RECEIPT_INVALID` 到编排账本，不得迁移至 O2、不得派发下游、不得宣称输入治理完成。已可信绑定且 child 为 `active` 或状态未知时，记录 `O1_WAITING_OR_UNKNOWN` 并停在 O1；缺 ID 或 target/child run 不匹配才转 `HALTED_FOR_HUMAN`。只有终态不合格且「可信续接绑定」所定义的已登记 ID 匹配同一 target/child run，才可要求 `contract-intake` 以 `contextMode: continue` 补全或重做；达到打回上限转 `HALTED_FOR_HUMAN`。这不是由 lead 自行生成 intake 产物的例外。
- **未签署草稿例外必须是双证据，且 YAML 未验证不能结案。**当回执的 `freeze.execution_status.signature_status` 为 `unsigned_draft`，只接受回执该处与 handoff 根中的两个镜像：两处均须有 `review_purpose: draft_negotiation_assistance`，且 `exception_basis.request_scope_evidence` 与 `exception_basis.material_evidence` 必须字段齐全、逐值相同。前者必须保留本轮用户草稿/谈判辅助审查范围的原文，后者必须有材料绝对 `input_path`、`page`、`locator` 和明确未签草稿原文 `quote`；缺失、只在一侧出现、值不一致，或试图用 Lead 自己补写的一侧，均记录 `O1_UNSIGNED_DRAFT_EVIDENCE_INVALID` 并 HOLD/打回，不能由泛化 RC-6 放行。`yaml_unverified`（无论在回执、handoff 或其声明的 YAML 语法状态）表示本次只完成回读、未获 YAML 解析工具验证：记录 `O1_INTAKE_YAML_UNVERIFIED` 并 HOLD，不更新 O1 为已验证完成、不进入 O2，也不得因 `conditional` 或其他 RC 通过把它当作有效输入治理；只有 `contract-intake` 以后在可用专用 YAML 校验工具的真实成功证据下移除该标记，才可重新按全部 RC 检查接收。以上只约束回执的实际字段和回读，不声明平台已对 YAML 或签署事实作确定性验证。
- **四冻结逐字段镜像后再归一。**从 exact 回执逐项复制 `freeze.master_version.frozen`、`freeze.page_range.frozen`、`freeze.attachment_manifest.frozen`、`freeze.execution_status.frozen` 四个真实布尔值到 Lead ledger，不得用 O0 值、文字摘要、`unsigned_draft` 例外或 `verdict` 提升任何一项。Lead 本地计算 `normalized_all_frozen = master_version && page_range && attachment_manifest && execution_status`；`receipt.all_frozen` 必须与该 AND 完全相等，否则记录 `O1_INTAKE_FREEZE_NORMALIZATION_INVALID`、按无效回执打回并停在 O1，不进入 O2。只有 `normalized_all_frozen === true` 且回执 `consistency_conclusion_allowed === true` 时才写 `version_compare_allowed: true`；其余一律 false。矩阵基线保留四个镜像布尔值、AND 结果、原始 `receipt.all_frozen` 与结论开关，不能只留一句“已冻结”。本项与前述双 manifest 核验均在读取 verdict 的 O2 迁移之前完成。
- 先跑六项回执检查（见「回执检查」一节）。
- 读 `verdict` 字段：
  - `blocked` → 进 `X1`。**立刻停**：不派发、不预热、不询问「能不能先跑条款抽取」。把回执里的 `remediation` 原样交用户。
- `conditional` → 进 `O2`，**全量派发、范围不缩减**，把 `pending[]` 逐条登记为矩阵待确认行并原样传给下游。
- `passed` → 进 `O2`。
- 对有效回执的 S8，只能把实际 `jurisdiction_undetermined`、候选线索或版本可得性作为 `review-context` 的来源声明更新，并把同一 `case_binding` 的 revision 递增后 `Read` 回读。S8 未定时保留 `PEND-JURISDICTION-BASIS-REQUIRED`，不默认选包；S8 线索也不单独成为最终法律适用结论。已识别候选的包实际不可读、pin 不符或服务范围不支持时，写 `RULE_SOURCE_UNAVAILABLE`（`required_from: lead`）并按既有 H；不得把它伪装成用户澄清欠项。用户随后补充且不替换材料时，保留旧 revision 与同一冻结案件绑定，仅按普通 `isolated` 编排重跑受影响分支；不得把该澄清伪装为 Delegate `continue`、action resume 或从旧成员摘要取得身份。revision 更新只清理过期 review-context 澄清项，绝不关闭已经存在的 `HG-02`、其他 Human Gate、pending gate artifact 或 `blocked_by_human_gate`；账本、真人回执和 reporter 仍是这些 gate 的权威。

#### O1 Intake 覆盖映射（Lead 账本契约）

以下 `coverage_id` 是 Lead 覆盖矩阵中的独立行标识；`intake_gate_step` 才是 `contract-intake` 回执的 `checks[].id`。两者不得互换。O0 的 `contract.yaml#INV-001`（有且仅有一份 `main_contract`）仍完全由 Lead 执行，**不属于 Intake S6，也不得委派为任何 `CHK-INTAKE-*` 行。**

```yaml
intake_gate_coverage:
  required_steps: [S1, S2, S3, S4, S5, S6, S7, S8]
  entries:
    - coverage_id: CHK-INTAKE-S1-SCOPE
      intake_gate_step: S1
      receipt_check_name: 受理范围清点
    - coverage_id: CHK-INTAKE-S2-MASTER-VERSION
      intake_gate_step: S2
      receipt_check_name: 主版本冻结
    - coverage_id: CHK-INTAKE-S3-PAGE-RANGE
      intake_gate_step: S3
      receipt_check_name: 页码连续性
    - coverage_id: CHK-INTAKE-S4-ATTACHMENT-MANIFEST
      intake_gate_step: S4
      receipt_check_name: 附件清单对账
    - coverage_id: CHK-INTAKE-S5-EXECUTION-STATUS
      intake_gate_step: S5
      receipt_check_name: 签章状态
    - coverage_id: CHK-INTAKE-S6-PLACEHOLDER
      intake_gate_step: S6
      receipt_check_name: 占位符扫描
    - coverage_id: CHK-INTAKE-S7-PARTY-AND-AMOUNT
      intake_gate_step: S7
      receipt_check_name: 一致性（主体身份 / 金额大小写）
    - coverage_id: CHK-INTAKE-S8-VERSION-MATRIX
      intake_gate_step: S8
      receipt_check_name: 版本矩阵对齐
```

建矩阵时预生成以上八行，`check_source` 写为 `contract-intake.receipt.checks#S<n>`，`owner_agent` 为 `contract-intake`，初始 `status: blank`。Lead 只在上述有效回执的实际检查结果上更新行：不能将 `S6` 解释为唯一主合同、不能漏掉 `S8`，不能将任一 `CHK-INTAKE-*` 伪装成 Intake 产出的 `checks[].id`。
