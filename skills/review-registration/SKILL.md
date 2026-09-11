---
name: review-registration
description: >-
  仅用于用户已经提交或明确指向合同材料、并明确要求只登记案件或补充 review context，且明确不委派、抽取或开始实质审查时。
  建立或更新闭合 review-context 后立即结束；不启动完整合同审查流水线。
version: 1.0.0
type: procedural
risk_level: low
status: enabled
tags: [contract-review, review-context, registration]
requires:
  tools: [Read, Write, GenerateUUID, FileDigest]
metadata:
  author: DesireCore
  version: 1.0.0
  updated_at: '2026-09-11'
---

# 合同审查受限登记

## 使用边界

只在本轮已有用户提交的合同材料或用户明确指向的合同文件，且用户自然语言已明确限定为“仅登记”“建立/补充待补 review context”、不委派、不抽取、不实质审查时使用。本技能不是完整审查入口；普通“请审查这份合同”等完整审查请求交给 `review-orchestration`。范围确实含混时，不把它擅自当作受限登记或完整审查。

用户只咨询需要什么材料、没有本轮材料或明确文件指向时，保持零工具咨询：不扫描工作区、不生成案件 ID、不写 context。本技能不增加或调用 `Delegate`、覆盖矩阵、规则包预检、材料抽取或实质判断。

## 受限登记步骤

1. 首次 `Write` 前，实际 `Read` `review-context/review-context.schema.json` 与 `review-context/review-context.template.yaml`。任一不可读、不可解析或不一致则停止并如实说明，不能自由编写替代 YAML。按 schema/template 的闭合枚举、required、`allOf` 填写；写后 `Read` 回核，不把“成功写入”当成 schema 合规。
2. 新案件调用 `GenerateUUID` 后，直接保留其真实返回值作为唯一 `case_id`（可加固定 `case-` 前缀，但不得改写为日期/序号或丢弃 UUID）；在 Lead canonical 根的具体 `review-context.yaml` 写入。补充登记先 `Read` 当前 context；仅同一 case、同一材料状态且闭合字段实际变化时写 `revision + 1`。没有实际变化则不写、不虚增 revision。
3. 对当前明确指向且可读的文件，可用 `FileDigest` 记录最小真实对象身份和返回摘要。内容摘要或 aggregate 只证明被读取的内容，**不**证明 current 合同、附件或历史集合完整。首次受限登记没有同一案件、同一材料状态、已核验的完整 current 库存时，`current_contract_manifest` 必须是 schema 允许的 `unavailable`，理由如实说明“完整 current 集合尚未建立”；不得从单文件或 aggregate 推断完整 manifest。只有已有同案同材料的已核验完整库存才可保留；未被本轮提交或明确指向的附件、历史与集合保持未知，不称“未提交/缺失”、不冻结，也不伪造页码、清单摘要或工具失败。
4. 用户明确声明且唯一的候选审查基准可按 schema 写 `candidate_basis` 与 `pack.status: not_prechecked`，并使用 `not_issued_pack_preflight_pending` 和 `PEND-JURISDICTION-PACK-PREFLIGHT`。它只记录尚未获预检授权，既不是 pin、工具失败、平台认证或 Human Gate。冲突候选保留 `HG-02`，不能被该 pending 消除；缺审查视角只限制方向性建议，未定/冲突法域只限制法域实体结论，事实提取的允许范围仍以 schema 为准。

## 停止与回复

本轮在登记或补充登记后停止。不得继续完整 O0 清点、规则包预检、覆盖矩阵、O1 或 `Delegate`；用户补充信息本身也不扩大授权。结束回复只说明：本轮已登记并停止、当前 typed pending 所对应的**输出限制**、以及用户可选择补充的事实。不得把 pending 说成完整审查、O1 或事实提取的启动前提，不承诺补齐后自动开始；只有之后明确要求完整审查，才由 `review-orchestration` 另行执行完整 O0。
