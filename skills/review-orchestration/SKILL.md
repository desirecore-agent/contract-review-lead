---
name: review-orchestration
description: >-
  合同审查团队的有界编排入口。按 O0→O1→O2→O3→O4 固定顺序委派，
  以真实回执、磁盘回读、证据位置和明确的覆盖目标作为完成判据；能力不可用时如实降级，
  不伪造结论，也不让单个非关键工具错误拖死整个审查。
version: 1.2.1
type: procedural
risk_level: medium
status: enabled
tags: [contract-review, orchestration, bounded-loop, receipt-audit, kpi]
requires:
  tools: [Read, Ls, Glob, Grep, Write, Edit, MathCalc, GenerateUUID, Delegate, SendMessage, FileDigest]
metadata:
  author: DesireCore
  updated_at: '2026-09-15'
---

# 有界合同审查编排

## 成功定义与 KPI

这是一条可复核的工作流，不是一组必须填满的字段。每个成员只需用自然语言完成清晰、可执行的任务，
但必须留下下面的可观察结果：

| KPI | 合格标准 |
|---|---|
| 输入覆盖 | 当前提交的每个文件都被读取并在账本中列出；未读取的文件明确写明原因 |
| 事实可回查 | 每个重要发现都有原文引用、文件名和条款/行位置；引用能在原文件中找到 |
| 责任可定位 | 每个结论只归属于一个成员，并带真实回执和产物路径 |
| 流程一致 | 每次都按 O0→O1→O2→O3→O4；同一类输入使用同一组检查目标和状态词 |
| 失败诚实 | 超时、无回执、工具不可用都写为 blocked 或 capability_debt，不补写成员成果 |
| 交付安全 | O3/O4 未完成时只交付阻塞摘要；Human Gate 未确认时不得宣称通过 |

没有回执就是没有完成。单次成员回合超过 120 秒没有新的工具进展，或一个回合结束仍无回执，
立即停止该分支并记录原因；不要继续等待、无限重试或替成员写产物。

## O0 登记（一个最小可验证环）

1. 只读取用户本轮明确提交或明确指向的文件，生成 case_id，在 contract-review/ 下建立编排账本和一张简明覆盖矩阵。
2. 对已确认存在的文件优先调用一次 `FileDigest`。正确调用形态是：

   ```json
   {"paths":["contract.md","appendix-a1.md","intake.json"]}
   ```

   paths 可以是一个字符串或字符串数组；不要把数组再包成字符串。成功时把逐文件摘要和 `aggregate.digest` 记入同一登记行。
3. 如果 FileDigest 返回错误、读取范围不允许或协议适配器无法提供摘要，只重试一次且只修正参数形态；仍失败就记录真实错误，
   将对象标为 `frozen_without_digest`，摘要写 `unknown`，继续 O1。摘要是增强一致性的凭证，不是阻止读取和审查的前置条件。
4. O0 的完成判据只有：账本存在、矩阵列出本案的固定检查组、首次 Write 后能 Read 回读。不要在 O0 预加载大段规则包，
   不要为了生成矩阵调用另一个技能，也不要等待成员回执。

矩阵使用固定的检查组即可：input-integrity、clause-facts、jurisdiction、risk、report-and-delivery。
每行至少包含 check_id、owner、status、evidence_or_reason；初始状态为 blank。这张表是欠账表，不是强制 schema。

## O1 输入治理

用 Delegate 的 sync + isolated 委派 `contract-intake`，只传对象身份、绝对路径、审查范围和输出根：

```yaml
target: contract-intake
mode: sync
contextMode: isolated
intentId: ${case_id}:intake
contextReason: 合同案件输入治理与受理门禁。
```

- `passed` 或 `conditional`：回读回执，确认对象、范围、证据和产物路径；合格后立即回写矩阵：将 `contract-intake#S1`–`#S8` 逐行更新为 `covered`、`unknown` 或 `not_applicable`，每行填写 `receipt_ref` 与 `evidence_or_reason`，并同步 `summary` 计数，再进入 O2。只写账本而不回写矩阵不算完成。
- `blocked`、无回执、超时或身份不一致：账本进入 `HALTED_FOR_HUMAN`，相关行标为 `blocked`，停止下游。

Lead 不写 intake 回执，不改 verdict，不复制成员推理。conditional 继续向下游传递 pending；blocked 终止流程。

## O2 条款事实

以 sync + isolated 委派 clause-extractor。要求一次最小事实检查点：重要条款、原文引文、文件和位置、
covered/not_applicable/unknown 状态。收到并回读后才更新矩阵：把条款回执中的 `category` / `key_missing_facts` 映射到预先存在的固定 `check_id`，逐行写入 `status`、`receipt_ref`、证据位置和未知原因，并重算 `summary`。缺证据就打回一次；第二次仍不合格转人工。不得只追加成员产物而留下矩阵初始 `blank`。

## O3 两条独立分支

以 fan-out/parallel 委派 jurisdiction-auditor 与 risk-scanner，两支只读原文和 O2 事实，不读对方推理。
每支只允许一个最小回合。法域支报告法域线索、适用性和缺口；风险支报告固定风险检查、精确证据和未知项。
两支都回执才可进入 O4；收到每支回执后立即把该支负责的固定行更新为 `covered` / `unknown` / `not_applicable` 并写 `receipt_ref`，重算 `summary`；缺一支只阻塞该支负责的矩阵行，不得用另一支填补。

## O4 报告与交付门禁

只有 O3 两支都回执，才委派 review-reporter 做版本对比和报告。无历史基线时显式标记 not_applicable。
报告必须列出：已覆盖检查、欠账/阻塞、证据位置、待人工确认和下一步动作。任何 Human Gate 保持 pending，不得自动通过。报告回执返回后，必须再读一次矩阵，把 `REPORT-*` 行和已确认的前置行更新并重算 `summary`；最终交付前若矩阵仍有 `blank`，必须逐行说明原因，不能只在报告正文中概括。
O3/O4 未完成时不生成风险评级、最终评分或修订版 DOCX。

## 账本与输出不变量

- 每次委派前写 dispatch，每次返回后立即回读账本和矩阵，并更新状态、负责人、回执、产物路径及矩阵 `summary`。矩阵的 `blank` 计数只能在确实没有对应回执时保留。
- covered 必须能指向真实回执和文件；blank、blocked、unknown、not_applicable 必须有自然语言原因。
- 矩阵行集合固定，不能因成员漏提而消失；同一类输入必须使用相同的状态词和检查组。
- 摘要缺失时可以继续事实审查，但不得宣称“同一版本”“无差异”或“差异为零”；一致性结论记为 undetermined。

## 交付前验收

先读账本，再读矩阵，再列出实际文件。给出 KPI 结果：文件覆盖、证据可回查、成员回执、矩阵逐行状态及 `summary`、欠账数量、Human Gate 和交付物路径。逐项核对：每个 `covered` 必须指向真实回执；每个 `blank` / `blocked` / `unknown` / `deferred` 必须有原因；若计数与行状态不一致，先修正矩阵再交付。
明确哪些步骤有真实回执、哪些步骤阻塞、哪些结论不存在。只有所有必需步骤均有合格回执且人工门禁已处理时，才可交付最终报告；
否则交付阻塞摘要和可执行的补齐清单。


## Redline DOCX 状态收口

当 O4 调用 `ExportRedlineDocument` 成功后，交付前必须完成一次状态收口：

1. 使用 canonical 相对路径 `contract-review/redline/<case-id>-redline.docx` 写入账本的 `RedlineDOCX` 节，至少包含 `status: success`、`path`、目标发现和可回读的包验证摘要。
2. 重新读取账本、报告和覆盖矩阵；若任一文件仍保留 `RedlineDOCX.status: failed` 或 `redline_docx_status: failed`，必须用 `Write` 重写完整目标文件后再次 `Read`，不得以“已调用工具”代替一致性验收。
3. 报告交付物清单必须包含同一 DOCX 路径；若工具失败或无法验证，保持 `failed` 并记录真实原因，不得把草稿路径标为成功。
