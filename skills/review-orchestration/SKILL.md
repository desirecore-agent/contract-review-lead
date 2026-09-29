---
name: review-orchestration
description: 以 O0→O1→O2→O3 真并行→O4 独立取证→O5 报告交付→Lead 对账编排合同审查。
version: 1.4.0
type: procedural
risk_level: medium
status: enabled
requires:
  tools: [Read, Ls, Glob, Grep, Write, Edit, MathCalc, GenerateUUID, Delegate, SendMessage, FileDigest, StructuredFileValidate]
metadata:
  author: DesireCore
  version: 1.4.0
  updated_at: '2026-09-29'
---

# 有界合同审查编排

## O0 登记

只读取本轮明确提交/指向的材料。生成 case/object/version 身份，记录规范化绝对路径，并由 Lead 明确本案 canonical 根。对文件调用 `FileDigest`；只可为参数形态修正重试一次。失败则记录真实返回和 `frozen_without_digest`，摘要为 unknown，继续事实审查。摘要不是来源、对象或版本身份的替代。

`canonical_artifact_root` 的唯一语义：Lead 为本次 case/object/version/run 选定并核验过的绝对目录，已经包含这四项的唯一身份。成员只在该根下追加阶段目录及唯一产物名，绝不再次拼接 case_id、contract_object_id 或 workspace；这些身份仍写进回执，不靠重复目录表达。缺根、相对根或范围不符时先报路径欠账，不自行选择目录。根必须位于已授权 workspace，路径授权不是本约定自行授予的。

阶段相对目录固定为 O1 `intake/`、O2 `clause-extraction/`、O3 `risk-scan/` 与 `jurisdiction-audit/`、O4 `independent-verification/`、O5 `report-delivery/`；O4/O5 的输出逐项列入 write_allowlist。Lead 在每次 task 中传完整根、实际输入路径及允许输出路径，收回时校验实际返回文件仍在本轮根内。补料或新 run 使用新的根和标识，保留旧产物。

首次派发前建立并回读七行固定矩阵：`input-integrity`、`clause-facts`、`jurisdiction`、`risk`、`independent-review`、`version-comparison`、`report-and-delivery`。不得先收发现再建行。

## O1 输入治理

```json delegate-example:O1
{
  "target": "contract-intake",
  "task": "对 ${case_id} 调用你的输入治理技能，读取任务中给出的绝对路径和 canonical 根，提交真实 intake 回执；不得由 Lead 代写。",
  "mode": "sync",
  "contextMode": "isolated",
  "intentId": "${case_id}:o1-intake",
  "contextReason": "O1 是本案独立的输入治理与受理门禁任务。"
}
```

对实际落盘回执使用真实 `StructuredFileValidate`：`document_path` 为回执绝对路径，`schema_path` 为当前 intake 技能声明的回执 schema 绝对路径，`format` 与文档实际 YAML/JSON 格式一致；两个路径都必须获准读取。工具结果中的 `valid` 是结构校验结果，不能替代回执自己的 verdict，也不能由回执或 sidecar 自签。校验工具调用失败（`success:false`）与工具成功返回 `valid:false` 必须分别记录；任一情形都不启动下游。统筹官的非空工具允许清单必须含该工具，否则平台的父子工具交集会使 intake 也无法使用。

```json validator-example:O1
{
  "document_path": "${intake_receipt_absolute_path}",
  "schema_path": "${intake_receipt_schema_absolute_path}",
  "format": "yaml"
}
```

Lead 不写 intake 回执。回执落盘后必须从实际路径完整回读，并用标准 YAML/JSON 解析器解析；不得自建简化 YAML parser。对完整回读字节计算 SHA-256，并要求真实工具报告的 `document_sha256` 与它一致；同样完整读取实际 schema 字节并要求报告的 `schema_sha256` 一致，同时保留 `report_sha256`。任何解析失败、schema `additionalProperties`/必需字段错误、摘要不一致、无回执、超时、取消或身份不符都不合格：失败产物原路径保留，另记失败回执，`handoff.to:null`，O2/O3/O4/O5 dispatch 均为 0。只有工具调用成功、工具报告 `valid:true`、两个摘要完全绑定，且回执 verdict 严格为白名单 `passed` 或 `conditional` 时进入 O2；`blocked`、`unknown`、缺失或其他值均不派发，conditional 的 pending 原样携带。不得通过字符串匹配、sidecar 或内存中未落盘对象绕过门禁。

`<intake_id>.receipt.yaml` 是唯一机器摘要；`<intake_id>.detail.yaml` 保存原文证据、签章观察、四元组、版本矩阵和补料动作，机器摘要中的 finding id/source_scope/action 必须可追到 detail，但 detail 不能覆盖或授权机器摘要。`<intake_id>.validation.json` 只记录真实 validator 报告的摘要绑定和诊断，是审计 sidecar，不是自主授权。三者都只读取本次任务明确列出的绝对路径，且必须在同一 `<canonical_artifact_root>/intake/` 下；不得借此枚举目录、读取父目录或其他 run。

## O2 条款事实

以 sync + isolated 调用 `clause-extractor`，传对象、原件、范围、预定检查目标与 canonical 根。技能要求写在 `task` 正文，不使用虚构 `skill` 参数。要求事实、原文位置、未知/缺失及附件状态；不得要求它做风险或法律判断。合格回执后更新 `clause-facts`。

```json delegate-example:O2
{
  "target": "clause-extractor",
  "task": "对 ${case_id} 调用你的条款事实提取技能；只提交可回原文的事实、未知项和附件状态，并使用任务中给出的 canonical 根。",
  "mode": "sync",
  "contextMode": "isolated",
  "intentId": "${case_id}:o2-clause-facts",
  "contextReason": "O2 是区别于输入治理的条款事实提取任务。"
}
```

## O3 真正并行

```json delegate-example:O3
{
  "targets": ["risk-scanner", "jurisdiction-auditor"],
  "task": "并行处理 ${case_id}：各目标调用自己的运行技能，只读相同的 O2 净化事实与原件；risk-scanner 产出风险证据，jurisdiction-auditor 产出法域范围或转介边界；不得读取或代填另一分支。",
  "mode": "fan-out",
  "strategy": "parallel",
  "contextSelections": [
    {
      "target": "risk-scanner",
      "contextMode": "isolated",
      "intentId": "${case_id}:o3-risk",
      "contextReason": "O3 风险扫描是独立于法域审计的并行任务。"
    },
    {
      "target": "jurisdiction-auditor",
      "contextMode": "isolated",
      "intentId": "${case_id}:o3-jurisdiction",
      "contextReason": "O3 法域审计是独立于风险扫描的并行任务。"
    }
  ]
}
```

两支只接收相同的原件身份、O2 净化事实、范围与各自预定检查目标，不读对方输出。分别更新 `risk`、`jurisdiction`。某支失败就保留该行欠账；已有证据仍可进入范围受限报告，但不得冒充完整合规或完整评分。

## O4 独立取证

首次独立调用 `review-reporter`：

```json delegate-example:O4
{
  "target": "review-reporter",
  "task": "对 ${case_id} 调用 independent-verification 技能；仅据任务逐项列出的 read_allowlist 具体文件、冻结范围、预定清单及净化事实候选完成独立取证，候选结果仅三态并另列 additional[]；只向 write_allowlist 列出的唯一 O4 回执绝对路径写入并回读。禁止目录枚举、读取未列路径及读取 O3 推理、严重度、评分或建议。memoryScope:none 不强制文件隔离，须记录平台欠账。",
  "mode": "sync",
  "contextMode": "isolated",
  "intentId": "${case_id}:o4-independent-verification",
  "contextReason": "O4 必须在不继承 O3 推理与历史记忆的新 Work Context 中独立取证。",
  "childContext": { "memoryScope": "none" }
}
```

每次调用必须显式列出具体文件绝对路径的 `read_allowlist` 与 `write_allowlist`；禁止列目录、通配目录、canonical 根或成员工作区目录。只传 allowlist 内原件、对象/范围、预定检查清单，以及事实候选 `id`、断言、来源位置。禁止传 O3 推理、严重度、评分、建议和对话历史。每个候选仅允许 `confirmed/refuted/unlocatable`；unlocatable 写检索范围和原因；补漏单列 `additional[]`，可为 0。污染拒收后必须发起新的 isolated 调用，不能在旧调用续做。`memoryScope:none` 仅关闭记忆注入，平台尚无 per-call 文件能力沙箱，必须作为未验隔离欠账，不能谎称文件隔离已被强制。

## O5 评分、报告与修订建议

第二次独立调用同一 `review-reporter`：

```json delegate-example:O5
{
  "target": "review-reporter",
  "task": "对 ${case_id} 依次调用 review-scoring 与 report-composition 技能；只读取 read_allowlist 逐项列出的合格 O4 回执、scoring-rules-cn-v1.0.3 绝对路径及适用 CN 规则文件；只写 write_allowlist 逐项列出的 scorecard、report、pending receipt 与导出尝试回执并逐一回读。禁止目录枚举和未列路径，不得重做 O4；memoryScope:none 不强制文件隔离，须记录平台欠账。",
  "mode": "sync",
  "contextMode": "isolated",
  "intentId": "${case_id}:o5-report-delivery",
  "contextReason": "O5 是消费 O4 回执的评分交付任务，不继承 O3 或 O4 的会话推理。",
  "childContext": { "memoryScope": "none" }
}
```

只接收合格 O4 回执、适用规则/标尺来源、canonical 根和交付要求。Lead 必须把 reporter 安装包内 `resources/scoring-rules-cn-v1.0.3.json` 解析为实际绝对路径，调用 `FileDigest`，并在 O5 任务中传 `rule_id=scoring-rules-cn`、`version=1.0.3`、实际绝对路径、真实摘要及规则计数；摘要失败则停止 O5，不得凭记忆评分。每次 O5 都逐项列具体文件的 `read_allowlist`/`write_allowlist`，禁止目录枚举或读取未列出的 O3/O4 会话外文件。不得要求或允许它隐式重做完整 O4。只有中国大陆范围且适用 CN 规则来源完整时才计算；域外只做通用文档治理与转介。任何维度未覆盖仍保留固定分母和该维欠账，不重归一；不得输出伪装完整的五维总分。

Human Gate pending 不阻止文件交付。O5 先写并回读 scorecard、report、pending receipt；有证据支持且 anchors 在原始文件各恰好匹配一次时，先预检真实导出入口。当前平台未发现 `ExportRedlineDocument` 时记录真实 tool-not-found/blocked，入口待协调者核验；禁止发明工具或用外部脚本冒充自主导出。除非缺失事实阻止识别审查对象，或明确要求立即业务决定，否则不调用 `AskUserQuestion` 阻塞同步委派。

## Lead 对账

回读账本、矩阵和每个实际路径。风险方向仅 `up/down/flat/undetermined`；单版本比较适用状态为 `not_applicable`。范围缺项不能 flat；局部下降可描述但全局可为 undetermined。R7 附件正文未交与 R9 权威清单不完整分别列示。

超时/取消以真实返回为准；sync 等待时不宣称已停止。有界重试，不无限 poll。控制已有 run 使用独立 `DelegateControl`，不得在 Delegate 参数中造 `action`/`stop`；若未获准控制工具，登记“不能中止”而非伪称已停止。最终交付区分完整结果、范围受限结果、业务 pending 与导出 failed/blocked，绝不把工具结束或模拟批准写成业务批准。
