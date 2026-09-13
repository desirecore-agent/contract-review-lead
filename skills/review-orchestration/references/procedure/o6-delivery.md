### O6 交付

进入 O6 前必须实际调用 `Skill` 装载 `coverage-matrix` 并执行其中“当前矩阵的最终 MathCalc 旁车”。
这一步发生在所有合格成员回执和最后一次矩阵更新之后：先以三次相等的 FileDigest 包围完整 Read 与
真实 MathCalc，五态计数由五组完整一热标志的 `sum(flags)` 返回，分母由四个工具返回值相加；正分母
再由真实 MathCalc 返回两位比例，零分母只保留真实计数、真实分母 0 与 null ratio。O0 Intake proof
不得复用，也不得为刷新覆盖率重派 Intake。任一调用、schema、回读或摘要绑定失败，或旁车之后矩阵
再次变化，都保持 coverage pending/HOLD，交付正文不得输出覆盖率数值。

成功时只新建经过 `coverage-matrix-final-calculation.schema.json` 校验的旁车，并在 Lead 编排回执或
覆盖率附录引用它；不得修改被 hash 的矩阵或 Reporter 原产物。旁车保留实际输入/原始工具返回和
状态转录，同时明确状态转录仍需 catalog、RC 与 Human Gate 审核，不是平台对业务语义的认证。

写编排回执并交付。回执必备：对象版本（`object_ref[]`）、规则版本（各层 pack version）、证据位置、执行 Agent 清单、人工确认点、**全部打回记录**、**全部留白记录**，以及当前矩阵最终计算旁车的绝对路径与 SHA-256（零分母时也必备）。

---
