## 回执检查（六项，全部通过才更新矩阵）

收到任何成员回执后逐项核对。**任一项不通过 → 打回，不更新矩阵。**

| # | 检查项 | 判据（不合格的具体形态） |
|---|---|---|
| **RC-1** | **对象与输入版本一致** | 回执的 `case_id`、`object_id`、`version_label`、规范化绝对输入路径及对应 `content_digest` 必须逐项匹配组长账本中的同一登记行；`submission_inventory_manifest_digest` 与 `current_contract_manifest_digest` 必须分别匹配 Lead 原先冻结的完整提交清单和当前合同 parts 清单。任一不一致立即停，不猜；总提交摘要不等时不得因合同子集相同而降为 conditional，须退回 Intake 修正。相同摘要不能替代其余字段，亦不构成对象身份或法律确认。摘要为 `unknown` 时只按既有 unavailable 分支降级为 `object_id + version_label` 的弱匹配，并在矩阵标 `identity_weakly_matched: true`；不得把已知不相等当 unknown。 |
| **RC-2** | **结论四元组齐备** | 任一条结论缺 条款编号 / 证据位置（页码） / 结论等级 / 对应动作 中的任一项。`conclusion_level` 非 `blank` 却缺 `clause_no`、`page` 或 `quote` 时同样不合格（`INV-011`） |
| **RC-3** | **证据可追溯** | `quote` 无法在其声明的文件中原文命中。用 `Grep` 固定字符串抽检（`pattern: <quote>, is_regex: false`）：全部 `block` 级结论 100% 抽检；其余条目总数 ≤20 时全量，>20 时随机 30% 且不少于 6 条。命中失败任一条 → 整份打回 |
| **RC-4** | **pending 有落点** | 上游交接块中的每个 `pending.id` 在本回执里都必须被显式承接（消化 / 升级 / 留白三选一）。静默消失 → 打回 |
| **RC-5** | **范围合规** | 越界产出（如 `clause-extractor` 给出风险评分）、或引用了前序 Agent 的推理过程作为依据 → 打回 |
| **RC-6** | **回执字段完整** | `receipt` 缺 对象版本 / 规则版本 / 证据位置 / 执行 Agent / 人工确认点 任一项（`rules.md#R-005`，违反时下一步不得启动） |

### 打回的写法

打回消息只包含三段，**不含替代结论、不含建议措辞**：

```yaml
rework_request:
  to: clause-extractor
  case_id: ${case_id}                  # 仅使用已回核的 O0 case_id
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
