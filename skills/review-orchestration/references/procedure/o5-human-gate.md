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
