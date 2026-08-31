---
name: coverage-matrix
description: >-
  条款覆盖矩阵（欠账表）的建立与维护。派发任务**之前**按检查清单预先生成全部矩阵行并置为 blank，
  之后只根据成员的合格回执把行翻成 covered；未覆盖的检查项显式留白为 blank / blocked / deferred，
  绝不因为没人提就当通过。blank 与 blocked 不计入通过率、必须在报告正文单列。用户提到覆盖矩阵、
  响应矩阵、欠账表、检查项清单、漏检、留白、通过率、还差什么没查时使用。
  Use when building and maintaining the clause coverage matrix (a ledger of outstanding checks):
  rows are pre-generated from the check catalog before any dispatch, flipped to covered only by
  conforming member receipts, and uncovered items stay explicitly blank rather than silently passing.
version: 1.0.0
type: procedural
risk_level: low
status: enabled
tags:
  - contract-review
  - coverage-matrix
  - response-matrix
  - gap-tracking
  - anti-omission
requires:
  tools:
    - Read
    - Ls
    - Glob
    - Grep
    - Write
    - Edit
    - MathCalc
metadata:
  author: DesireCore
  version: 1.0.0
  updated_at: '2026-08-31'
---

# 条款覆盖矩阵（欠账表）

## 何时使用

- `review-orchestration` 的 O0 阶段建立初始矩阵（**在任何派发之前**）
- 每收到一份**通过回执检查**的成员产出后更新对应行
- 用户询问审查进度、还差什么没查、为什么某项没结论时
- 交付前做欠账终检

## 不可协商的前提

1. **矩阵的行由检查清单预先生成，不由成员产出反推。**
2. **每一行开局都是 `blank`。**`blank` 是欠账，不是「暂无」，更不是通过。
3. **只有通过回执六项检查的合格结论才能把行翻 `covered`。**
4. **`blank` 与 `blocked` 不计入通过率，且必须在报告正文单列**（`INV-012` / `rules.md#R-014`）。
5. **不得删行。**不适用的检查项标 `not_applicable` 并写理由，行仍然留在矩阵里。

---

## 为什么方向不能反

| | 成绩单（错误做法） | 欠账表（正确做法） |
|---|---|---|
| 行从哪来 | 成员输出了什么就记什么 | 检查清单预先生成全部行 |
| 没查的项 | **根本不出现** | 显式留白为 `blank`，带原因 |
| 报告观感 | 每条都有结论、都有证据，很完整 | 有一段刺眼的欠账清单 |
| 漏检在哪 | 藏在从未被列出的行里，不可见 | 就在欠账清单里，可见 |

一旦让矩阵跟着产出走，漏检就变成了不可见的失败——这正是本团队要消灭的失败样态。所以**先建矩阵，再派任务**；不是先收结论，再补矩阵。

---

## 字段定义

一行 = 一个检查项。字段与 `contract.yaml#entities.coverage_matrix_row` 对齐，本技能补充编排侧需要的四个字段（`stage` / `check_source` / `not_covered_reason` / `receipt_ref`）。

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `check_id` | 是 | string | 检查项标识，引用规则集条目 id（如 `liability-cap`、`cn-arbitration-agreement-validity`、`S4`） |
| `check_title` | 是 | string | 人类可读的检查项名称 |
| `check_source` | 是 | string | 该行来自哪个清单，写成 `<文件>#<id>`（如 `base/missing-clauses.yaml#liability-cap`）。**没有来源的行不允许存在**——它意味着有人临时加了一个无据可查的检查项 |
| `stage` | 是 | integer | 属于 7 步中的第几步（1-7），用于校验顺序未被调乱 |
| `owner_agent` | 是 | string | 负责该行的成员 ID。建矩阵时就要指定，不能等派发时才决定 |
| `source_location` | 条件 | evidence_ref | 原文位置（`object_ref` + `clause_no` + `page` + `quote` + `extraction_confidence`）。`status: covered` 时必填；`blank` 时允许缺省 |
| `conclusion` | 条件 | enum | 结论等级。`status: covered` 时必填 |
| `evidence` | 条件 | string | 支撑该结论的原文摘录，必须逐字、可 `Grep` 命中。`status: covered` 时必填 |
| `action` | 条件 | string | 对应动作，引用 `actions.yaml` 的 action id。`status: covered` 时必填 |
| `status` | 是 | enum | `covered` / `blank` / `blocked` / `deferred` / `not_applicable`（见下表） |
| `not_covered_reason` | 条件 | string | `status ≠ covered` 时**必填**。「未提及」不是合法理由，必须写明为什么没能覆盖 |
| `human_gate` | 否 | string | 命中的 Human Gate id（`HG-01`..`HG-04`），命中时该行在 gate 确认前不得计入通过 |
| `receipt_ref` | 条件 | string | 把该行翻 `covered` 所依据的回执条目 id。**没有 `receipt_ref` 的 `covered` 一律回退为 `blank`** |
| `identity_weakly_matched` | 否 | boolean | 因摘要缺失只能做 `object_id + version_label` 弱匹配时置 `true` |
| `updated_at` | 是 | string | 该行最后一次状态变更时间 |

### `status` 五态

| 状态 | 含义 | 计入通过率 | 报告处理 |
|---|---|---|---|
| `covered` | 拿到了通过六项回执检查的合格结论 | **是** | 正常列入 |
| `blank` | 欠账。检查项存在，但没有拿到合格结论 | 否 | **正文单列** |
| `blocked` | 负责 Agent 未返回合格产出（并行分支缺失、打回两次未果、门禁终止） | 否 | **正文单列** |
| `deferred` | 事实上无法覆盖：所需材料未随本次提交送达（上游 `SCOPE-*` 事实） | 否 | **正文单列**，注明缺什么材料 |
| `not_applicable` | 该检查项对本合同类型不适用，或第 6 步无历史基线 | 否 | 列出并写明理由，**不得删行** |

---

## 「欠账」判定规则（本技能的核心）

一行不是 `covered`，就是欠账。判定按顺序执行，**先命中先定**：

```
R1  没有 receipt_ref                                    → blank
R2  有 receipt_ref，但该回执未通过 RC-1..RC-6 六项检查   → blank
R3  结论四元组缺任一项（clause_no / page+quote / conclusion / action）→ blank
R4  evidence 无法在声明的文件中原文 Grep 命中           → blank
R5  extraction_confidence 低于规则包阈值（默认 0.85）    → blank（记为失败标记，不是结论）
R6  负责 Agent 未返回、或打回 2 次仍不合格              → blocked
R7  并行分支缺失，本行属于缺失分支                      → blocked
R8  所需材料未随本次提交送达（上游 SCOPE-* 事实）       → deferred
R9  命中 Human Gate 且尚未获得人工确认                  → blank（human_gate 字段记 gate id）
R10 该检查项对本合同类型不适用 / 第 6 步无历史基线      → not_applicable（必须写理由）
R11 以上都不命中且四元组齐备、证据可命中                → covered
```

**三条禁止**：

- ❌ **不得因为「没人提到这一项」就判 `covered`。**没人提 = `blank`，这是本矩阵存在的全部理由。
- ❌ **不得用另一个成员的结论去填补某一行。**`owner_agent` 是谁，就只能由谁的回执翻转该行。用风险结论解释法域问题（或反过来）会产生看似合理、实则跨域的推断。
- ❌ **不得为了让通过率好看而删行、合并行、或把 `blank` 改写成 `not_applicable`。**`not_applicable` 需要合同类型层面的理由，「这次没查到」不是理由。

---

## 通过率计算

```
覆盖率 = covered / (covered + blank + blocked + deferred)
```

`not_applicable` 不进分母（它是「本来就不该查」，不是欠账）；`blank` / `blocked` / `deferred` **必须进分母**（`INV-012`）。

用 `MathCalc` 计算，并在输出中**同时给出四个绝对数**，不只给百分比：

```
覆盖矩阵 31 项：covered 22 / blank 6 / blocked 3 / deferred 0 / not_applicable 0
覆盖率 22/31 = 70.9%
```

只报百分比会让欠账被平均掉——`70.9%` 听起来还行，`6 项没查 + 3 项被阻断` 才是事实。

---

## 建矩阵：检查清单从哪来

O0 阶段按以下五个来源穷举生成行。**每一行都要有 `check_source`。**

| 来源 | 行数 | `stage` | `owner_agent` |
|---|---|---|---|
| `contract-intake` 的 S1–S8 八项硬校验 | 8 | 1-2 | `contract-intake` |
| `base/missing-clauses.yaml` 九项关键缺失条款 | 9 | 3、5 | `clause-extractor`（抽取）+ `risk-scanner`（缺失判定） |
| `base/market-benchmarks.yaml` 四项市场标尺 | 4 | 5 | `risk-scanner` |
| 生效法域包 `rules.yaml` 中适用的规则条目 | 按包 | 4 | `jurisdiction-auditor` |
| `custom` 层企业红线（如已加载） | 按配置 | 5 | `risk-scanner` |
| 蓝本第十五节五类拆分检查的收口行 | 5 | 6-7 | `review-reporter` |

**九项关键缺失条款**（`base/missing-clauses.yaml`）：`liability-cap` / `breach-remedy` / `grace-period` / `termination-convenience` / `subcontracting` / `audit-right` / `dispute-resolution` / `force-majeure` / `data-export`。

**四项市场标尺**（`base/market-benchmarks.yaml`）：`liability-cap-months` / `renewal-notice-days` / `non-compete-years` / `data-export-window-days`。

**五类拆分检查**（蓝本第十五节，不得退化成「全文润色」）：完整性检查 / 一致性检查 / 阻断风险检查 / 条款实质检查 / 文档检查。

### custom 层未加载时的处理

`custom` 层未配置时，**不是零行**，而是一行显式声明：

```yaml
- check_id: CUSTOM-LAYER-ABSENT
  check_title: 企业自定义红线未加载
  check_source: jurisdiction-packs/custom
  stage: 5
  owner_agent: risk-scanner
  status: deferred
  not_covered_reason: custom 层规则包未配置，企业内部红线本次未参与检查
```

理由：欠账表只能保护它知道的检查项。custom 层缺席若不留一行，就没有任何地方记录「这次没查企业红线」——正是「没人提就当通过」的原型。

---

## 矩阵文件格式

落盘为 YAML，路径写在编排账本里（绝对路径，不写用户主目录字面量）。

```yaml
coverage_matrix:
  case_id: case-2026-0831-001
  ontology_version: onto-v1
  rule_versions: {base: base-v1, jurisdiction: cn-v1, custom: absent}
  generated_at: '2026-08-31T02:10:00+08:00'
  generated_before_dispatch: true       # 必须为 true，否则整份矩阵不可信

  summary:
    total: 31
    covered: 22
    blank: 6
    blocked: 3
    deferred: 0
    not_applicable: 0
    coverage_rate: '70.9%'

  rows:
    - check_id: liability-cap
      check_title: 限制责任与索赔上限
      check_source: base/missing-clauses.yaml#liability-cap
      stage: 5
      owner_agent: risk-scanner
      source_location:
        object_ref: {object_id: doc-main-001, version_label: YCIT-SAAS-2025-0206, content_digest: unknown}
        clause_no: '8.2'
        page: 14
        quote: 乙方的累计赔偿责任以本协议项下三个月服务费为限
        extraction_confidence: 0.94
      conclusion: 严重
      evidence: 乙方的累计赔偿责任以本协议项下三个月服务费为限
      action: request_negotiation
      status: covered
      human_gate: HG-03
      receipt_ref: RS-2026-0831-014
      identity_weakly_matched: true
      updated_at: '2026-08-31T02:41:00+08:00'

    - check_id: audit-right
      check_title: 审计权与数据操作流程
      check_source: base/missing-clauses.yaml#audit-right
      stage: 5
      owner_agent: risk-scanner
      status: blank
      not_covered_reason: risk-scanner 回执中该项结论缺 action 字段，RC-2 不通过，已打回（attempt 1）
      updated_at: '2026-08-31T02:41:00+08:00'

    - check_id: cn-arbitration-agreement-validity
      check_title: 仲裁协议效力
      check_source: jurisdiction-cn/rules.yaml#cn-arbitration-agreement-validity
      stage: 4
      owner_agent: jurisdiction-auditor
      status: blocked
      not_covered_reason: 并行分支 jurisdiction-auditor 未返回合格产出，本行不得由 risk-scanner 结论填补
      updated_at: '2026-08-31T02:41:00+08:00'
```

---

## 交付前的欠账终检

交付或转人工之前必须逐条确认：

- [ ] `generated_before_dispatch` 为 `true`——矩阵是在派发之前建的，不是事后补的
- [ ] 每一行都有 `check_source`，没有来源不明的行
- [ ] 行数与五个来源穷举出的行数一致，**没有删行**
- [ ] 每个 `covered` 都有 `receipt_ref`，且该回执通过了 RC-1..RC-6
- [ ] 每个非 `covered` 的行都有 `not_covered_reason`，且理由不是「未提及」
- [ ] `blank` / `blocked` / `deferred` 全部进了分母
- [ ] `not_applicable` 的理由是合同类型层面的，不是「这次没查到」
- [ ] 命中 Human Gate 且未确认的行，状态是 `blank` 不是 `covered`
- [ ] 没有任何一行是被别的成员的结论填上的（`owner_agent` 与 `receipt_ref` 的来源一致）
- [ ] 输出同时给了四个绝对数，不只有百分比
- [ ] 摘要缺失时 `identity_weakly_matched` 已标记，且全文未出现「一致 / 无差异 / 差异为 0 / 持平」
