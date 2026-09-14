---
name: review-orchestration
description: >-
  合同审查团队的有界编排入口。登记同一份合同对象，按 O0→O1→O2→O3→O4 的固定顺序委派，
  每一步都以真实回执和磁盘回读作为完成判据；成员超时或无回执就记录 blocked/capability_debt，
  不等待、不代写、不把中间事实伪装成最终结论。
version: 1.1.0
type: procedural
risk_level: medium
status: enabled
tags: [contract-review, orchestration, bounded-loop, receipt-audit]
requires:
  tools: [Read, Ls, Glob, Grep, Write, Edit, MathCalc, GenerateUUID, Delegate, SendMessage]
metadata:
  author: DesireCore
  updated_at: '2026-09-15'
---

# 有界合同审查编排

## 成功定义

本技能只负责编排，不判断法律结论。一次运行只有在每个已执行步骤都同时满足以下条件时才算完成：

1. 目标成员返回最终回执；
2. 回执中的案件对象、版本和输入摘要与本案一致；
3. 回执文件真实写入 canonical `contract-review/` 根并被 Read 回读；
4. 回执的证据能在原始文件中命中；
5. Lead 立即回读账本，把该步骤和对应矩阵行同步更新。

没有回执就是没有完成。任何步骤超过一个成员回合仍无回执，或 120 秒没有新的工具进展，立即停止该分支，写明 `blocked`、`capability_debt`、耗时和最后可见状态；不得继续等待，也不得自行补写成员产物。

## 固定最小循环

### O0 登记

只处理当前用户明确提交的合同与附件。生成案件 ID，登记正文、附件、版本、路径和可用摘要，建立 `contract-review/orchestration-ledger.yaml` 与覆盖矩阵。矩阵的行来自检查清单，初始状态为 `blank`；首次 Write 后必须 Read 回读。

### O1 输入治理

用 `Delegate` 的 `sync + isolated` 委派 `contract-intake`。只传对象身份、绝对路径、审查范围和输出根。等待真实回执：

- `passed` 或 `conditional`：回读回执，做身份、证据、范围、字段和可追溯性检查；通过后把 O1 行翻为 `covered`，再进入 O2。
- `blocked`、无回执、超时或身份不一致：账本进入 `HALTED_FOR_HUMAN`，相关行记 `blocked`，停止下游。

Lead 不写 intake 回执，不改 verdict，不复制成员的推理。

### O2 条款事实

以 `sync + isolated` 委派 `clause-extractor`。要求一次最小事实检查点：固定事实类别、原文引文、文件和页码锚点、`covered/not_applicable/unknown` 状态。收到并回读后才把对应矩阵行翻为 `covered`。

### O3 两条独立分支

以 `fan-out/parallel` 委派 `jurisdiction-auditor` 与 `risk-scanner`，两支只读原文和 O2 事实，不读对方推理。每支只允许一个最小回合：

- 法域支：识别法域、读取匹配规则包、报告适用性和缺口；不确定就 `unknown`；
- 风险支：检查固定缺失条款与触发词、记录精确证据和 `unknown`；不做法域或最终评分。

两支都回执才继续 O4。缺一支时，只把该支负责的矩阵行记为 `blocked`，写 `timeout_no_receipt` 或实际错误，禁止用另一支填补。

### O4 报告与交付门禁

只有 O3 两支都回执，才委派 `review-reporter` 做版本对比和报告。无历史基线时版本对比为 `not_applicable`；任何 Human Gate 都必须保留为 `pending`，不得自动通过。报告回执通过回读后，Lead 才能把账本置为 `O5_HUMAN_GATE` 或 `O6_DELIVERED`。

## 账本不变量

- 每次委派前写 `dispatch`，每次返回后立即回读账本并更新 `status`、`steps`、`completed_steps`、`receipts`、`blocked_reasons` 和产物路径。
- `covered` 必须有 `receipt_ref`；`blank`、`blocked`、`unknown`、`not_applicable` 必须有原因。
- 账本显示的完成步骤必须与磁盘文件同时存在；不一致就停在 `HALTED_FOR_HUMAN`。
- `blocked`、超时和 capability debt 必须出现在阻塞摘要中；不得把覆盖率或中间事实描述成最终审查结论。

## 交付前验收

先读账本，再列出实际文件。明确哪些步骤有真实回执、哪些步骤阻塞、覆盖率分子分母如何计算、哪些结论不存在。若 O3 或 O4 未完成，只交付阻塞摘要，不生成风险评级、法域结论、最终评分或修订版 DOCX。
