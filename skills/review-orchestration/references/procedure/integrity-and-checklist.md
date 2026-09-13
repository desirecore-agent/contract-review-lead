## 摘要不可得时的如实表达

对当前提交的可读文件，先使用已获授权的 `FileDigest`，不使用 `Bash` 或其他 shell。它会为成功文件返回 SHA-256；只有完整文件集全部成功，才返回可记账的 aggregate `attachment_manifest_digest`。文件超出读取范围、消失、不是常规文件、超限、读取被拒绝或工具中止时，才进入本节的降级路径。

逐文件保留 `content_digest: unknown` 和 `FileDigest` 返回的精确失败原因；只有任一文件在允许的一次参数形态纠正后仍真实失败时，`attachment_manifest_digest` / `manifest_digest` 才均为 `unknown`，并标明 `manifest_digest_unavailable: true`。组长把这些事实和相应登记行绑定后写入账本；不编造摘要、不用 shell 补算，也不把相同摘要当作身份或法律确认。

**正确处理**（如实降级，不假装完整）：

```yaml
freeze:
  master_version: {frozen: true, evidence_level: field_matched}
  attachment_manifest: {frozen: true, evidence_level: field_matched}
  page_range: {frozen: true, evidence_level: field_matched}
  execution_status: {frozen: true, evidence_level: field_matched}
  all_frozen: true
  freeze_evidence_level: frozen_without_digest    # 冻结成立，但无摘要凭证
  digest_unavailable_reason: FileDigest 返回：读取被拒绝（逐字记录本次失败原因）
  consistency_conclusion_allowed: false           # 因摘要缺失强制为 false
```

**由此产生的三条硬约束**：

1. 对象身份判定降级为 `object_id + version_label` 弱匹配，矩阵标 `identity_weakly_matched: true`。
2. **禁止输出任何一致性结论**（「一致」「无差异」「差异为 0」）。
3. 版本对比的 `risk_direction` 只能是 `undetermined`，或有实证支撑的「上升 / 下调」；**永远不能是「持平」**——「持平」是一个一致性结论，需要摘要作证。

**错误处理**（禁止）：跳过 `FileDigest`、以 `Bash` / `PowerShell` 代算、把 `content_digest` 填成文件路径、文件大小、修改时间或任意占位值；或省略该字段让下游以为已核验；或因为「四项字段都对上了」就把 `freeze_evidence_level` 写成完整。也不得把相同摘要当作同一登记行、对象身份、文件版本或法律确认。

---

## 自检清单（每次案件推进前逐条确认）

**门禁**

- [ ] 用户已明确授权完整审查后，第一个派发的任务是 `contract-intake`，没有任何任务在它之前发出
- [ ] `verdict: blocked` 时没有派发任何下游、没有并行预热、没有询问能否放宽
- [ ] `verdict: conditional` 时下游范围**未缩减**，`pending` 已原样传递
- [ ] 没有因为「阻断只涉及某份附件」而自行放宽——例外范围由 `contract-intake` 判定

**顺序**

- [ ] 7 步按 1→2→3→4/5→6→7 执行，没有跳步、并步、调序
- [ ] 第 3 步完成并检查合格后，才发起第 4-5 步的 fan-out
- [ ] 第 6 步若不适用，是标了 `not_applicable` 并记录，不是静默跳过

**Delegate**

- [ ] `contract-intake` / `clause-extractor` / `review-reporter` 用的是 `mode: sync`，并显式提供 `contextMode: isolated`、稳定 `intentId` 和 `contextReason`
- [ ] `risk-scanner` + `jurisdiction-auditor` 用的是 `mode: fan-out` + `strategy: parallel`，同时提供 `targets` 和每个目标的 `contextSelections`
- [ ] 每个 `contextSelections` 项都含目标、`contextMode: isolated`、该案件稳定的 `intentId` 和 `contextReason`
- [ ] 同环节返工/续跑只使用本次平台 Delegate 可信续接绑定中、已与同一目标和 child run 登记的 `work_context_id`，参数为 `contextMode: continue` + `workContextId`，没有自行发明 ID 或混作 action resume
- [ ] `mode: worker` 没有携带任何 Work Context 字段
- [ ] **没有对 `review-reporter` 使用 `mode: subtask`**
- [ ] 交接块里没有对话历史、没有前序推理、没有其他成员的结论草稿
- [ ] 发给 `clause-extractor` 的交接块带有可读的绝对 `receipt_path`，且指向本案 `contract-intake` 回执
- [ ] 发给 `review-reporter` 的交接块含 `object.submission_mode`、`confirmed[]`、`pending[]`、`scope.frozen_baseline`、`consistency_conclusion_allowed`、`compliance_conclusion_allowed`、`do_not_pass` 与四类绝对产物路径
- [ ] O3 与 reporter 交接均带五个 `review_context_*` 字段；成员回执的 `review_context_echo` 回显 `case_id`、`revision`、`current_manifest` 与 `actual_output_constraints`，RC/矩阵/O4 前重新 `Read` 当前 context 比较，不符已 `REJECT-STALE-REVIEW-CONTEXT` 并标记 `superseded_context_revision` 后普通 isolated 重派
- [ ] context revision 没有关闭任何既有 Human Gate、pending gate artifact 或 `blocked_by_human_gate`；缺视角只限制方向性建议，未定/冲突法域只限制法域实体结论，均未冒充成员或平台已验证
- [ ] 发给 `review-reporter` 的字段名没有使用 `confirmed_facts` / `source_artifacts` 替代契约字段
- [ ] `task` / `context` 中每一个文件引用都是绝对路径

**回执与打回**

- [ ] RC-1..RC-6 六项全跑，没有因为「看起来没问题」而略过 RC-3 的原文抽检
- [ ] 打回内容只写缺什么与规则依据，没有写「应该改成……」
- [ ] 没有自己补齐任何缺项
- [ ] 同环节打回次数 ≤2，达到 2 次已转 `H` 而不是第三次派发
- [ ] 续跑前已记录本次平台 Delegate 可信续接绑定的 `work_context_id`、target 与 child_run_id；缺失或归属不明时没有尝试从业务文件、成员文本、摘要拼接、猜测或新建替代 ID

**并行分支**

- [ ] 部分成功时，缺失分支的 `check_id` 全部记 `blocked`
- [ ] **没有用一支的结论去填补另一支缺失的矩阵行**
- [ ] 缺支时已禁止 `release_to_legal`，并在给 `review-reporter` 的交接块写明缺口范围

**Human Gate**

- [ ] 命中的 HG 已暂停对应受限动作，没有预填确认结果、没有设超时自动通过
- [ ] 确认结果已写入 `human_confirmations` 四字段

**摘要与冻结**

- [ ] `content_digest` 不可得时写的是 `unknown` + reason，不是路径、大小或占位值
- [ ] 已优先对本次提交的精确文件调用 `FileDigest`；每个成功摘要和完整集合 aggregate 都与账本中的同一登记行绑定
- [ ] 任一未被允许的参数形态纠正解决的真实 `FileDigest` 失败都逐字记录工具原因，且没有用 shell 替代；没有把相同摘要当作对象身份、版本或法律确认
- [ ] **仅当完整集合摘要最终不可得时**，`freeze_evidence_level` 如实写为 `frozen_without_digest`；摘要成功后不得保留 `unknown`、unavailable 或该降级等级
- [ ] 摘要成功本身不允许推导「一致」「无差异」「差异为 0」或「持平」；任何一致性结论仍须满足既有 `consistency_conclusion_allowed`、四大冻结均成立，以及所有适用 Human Gate 已按既有规则完成

**留痕**

- [ ] 编排账本记了每次派发、每份回执、每次打回、每处留白、每个人工确认
- [ ] 账本落在已确认可写的绝对路径下，没有写死用户主目录字面量
