---
name: coverage-matrix
description: 在任何派发前建立并维护七行固定最小覆盖欠账表；按真实回执更新，不由发现反推检查目标。
version: 1.1.0
type: procedural
risk_level: low
status: enabled
requires:
  tools: [Read, Write, Edit, MathCalc]
metadata:
  author: DesireCore
  version: 1.1.0
  updated_at: '2026-09-29'
---

# 固定最小覆盖矩阵

O0 在首次委派前建立以下七行，全部初始为 `blank`：

| check_id | owner/stage | 完成判据 |
|---|---|---|
| `input-integrity` | intake / O1 | 合格 intake 回执及对象、范围、缺项证据 |
| `clause-facts` | extractor / O2 | 可回原文的条款事实与未知项 |
| `jurisdiction` | jurisdiction / O3 | 法域线索、规则包范围或转介边界 |
| `risk` | risk / O3 | 有证据风险、反例和未知项 |
| `independent-review` | reporter / O4 | 候选三态独立取证及独立 additional 补漏结果 |
| `version-comparison` | reporter / O4/O5 | 范围与方向；单版本为 `not_applicable` |
| `report-and-delivery` | reporter + lead / O5/对账 | 已回读报告、回执、待决清单和真实 DOCX 状态 |

每行至少记录 `check_id`、`owner`、`status`、`evidence_or_reason`、`receipt_ref`、`updated_at`。状态使用 `blank`、`covered`、`blocked`、`deferred`、`not_applicable`；不能把 `unknown` 当通过状态。需要细化时可在行内增加预定子项，但不得从成员发现反向增减这七个覆盖目标，也不得引用未预先建立的行。

## 更新规则

- `covered` 必须指向合格真实回执及证据位置。
- O1 blocked：`input-integrity` 记 blocked，其余行保留欠账并停止下游。
- conditional：`input-integrity` 可 covered，但 pending 作为行内欠账继续贯穿全链。
- O3 两支分别更新 `jurisdiction` 与 `risk`；任一失败不得由另一支代填。
- O4 更新 `independent-review`，并仅在具备比较范围时更新 `version-comparison`。
- 单版本时 `version-comparison.status=not_applicable`，`risk_direction` 不填写第五个值。
- O5 文件已回读但有业务 pending 时，`report-and-delivery` 可 covered；pending 单列，不将报告交付写成待决。
- 导出失败时该行可记录“报告已交付、DOCX failed”的范围受限状态，不伪造完整成功。

覆盖摘要必须给出各状态绝对数量。未覆盖行与其原因在报告正文单列；不得删行或用 `not_applicable` 掩盖没查。
