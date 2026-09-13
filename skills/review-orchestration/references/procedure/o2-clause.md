### O2 条款抽取（第 3 步）

#### Clause v2.1 单主合同自动消费（候选未部署时保持 HOLD）

Clause 的 `ready_for_handoff`、成员自报 schema/digest、路径、统计、quote、工具摘要，以及 worker 内部消息类型都不是 Lead 自动验收证据。只有已注册、实际可调用的 `StructuredFileValidateCompose` 返回公共成功 envelope，Lead 才能自动消费这个**单主合同、单 part** v2.1 策略；当前候选未部署、native 读取不支持或安全错误均不是通过。

先保留 O1 的有效 `passed`/`conditional` verdict、O2 本次平台 Delegate 可信 child/work-context binding、以及终态与最终回执的 exact absolute-path `Read`。`active`/unknown 保持 `O2_WAITING_OR_UNKNOWN`；缺可信 binding 是 `O2_BINDING_UNAVAILABLE`/H。最终回执的 `artifact_path` 必须原样复制，不得删 UUID/`agents` 路径段、猜测或重拼。Read 失败、摘要、中间文件或空骨架不得形成工具输入。

**单 part 基线前置。**只接受当前 Lead O0 ledger 的 `inv_001.main_contract_count: 1`、`objects[0].kind: main_contract`，且该对象的 `object_id`、`version_label`、`canonical_path`、`content_digest`、`size_bytes` 与 `digest_binding` 五元组都可用且自洽。O0 ledger 是 baseline；Intake handoff 不得取代或重建它。任一字段缺失、unknown、第二 part/main-contract 或 index 0 不是主合同，写 `O2_CLAUSE_V21_SINGLE_PART_BASELINE_UNAVAILABLE` 并 HOLD。

在同一次 `StructuredFileValidateCompose` 调用中，仅使用下列五个原生 `inputs`，不传 inline schema/rules 或模型给出的替代 digest/path：

```yaml
inputs:
  - {name: artifact, path: <final-receipt.artifact_path>, format: yaml}
  - {name: baseline, path: <current Lead O0 ledger absolute path>, format: yaml}
  - {name: pinned_schema, path: <published AgentFS clause-extractor schema path>, format: json}
  - {name: rules, path: <published AgentFS review-orchestration rules path>, format: json}
  - {name: part_0, path: <O0 objects[0].canonical_path>, format: text}
schema_source: pinned_schema
schema_target: artifact
rules_source: rules
```

AgentFS path 只能从 release-owned pin 的相对 source 解析：schema SHA-256 必须为 `a5ffb1525f027f878ab9c89adaf6a4fc8d3255d5bd47f0d25b807df83c46c671`，LF rules SHA-256 必须为 `c515bd9b4f6873a1e7acb071e1e991f29f12a076253c85bf7e8581c6d6590ef7`。五路径仍由平台既有 read scope 授权；任一拒绝、消失、解析/Schema/Compose/native/unsupported 错误均记录实际 code，写 `O2_CLAUSE_V2_COMPOSE_UNAVAILABLE` 并 HOLD，绝不以另一次 Read/FileDigest/Grep 补证。

**只消费公共 envelope。**要求 `ToolExecutionResult.success: true`，且唯一 text `content` 能严格 JSON parse 为 receipt；`success:false`、空/多内容、非 JSON 或缺字段一律 HOLD。不得读取或引用 worker 内部 `source-bound-receipt`。解析 receipt 必须 `ok: true`，其 schema/assertions/literal observations 均通过，并同时满足：

1. `snapshots` 名称集合恰为 `artifact`、`baseline`、`pinned_schema`、`rules`、`part_0`；每项均有 name/format/sha256/size_bytes，无额外或同名项。
2. `binding.schema_source`、`binding.rules_source`、`binding.schema_target` 分别与 snapshots 中 `pinned_schema`、`rules`、`artifact` 的四字段逐项相等；前两项 format 为 json、name 正确且 SHA 分别等于上述 schema/rules pin；artifact format 为 yaml。
3. `part_0` snapshot 的 SHA/size 等于 O0 `objects[0].content_digest`/`size_bytes`。baseline snapshot 是账本文件字节，不得冒充合同 digest；它只与本次调用的 exact baseline input 和 release rules 内的 O0 tuple relation 关联。
4. `binding.rule_manifest` 精确为 assertion_count `38`，selectors 依序为 `payloadEvidence`、`coverageEvidence`、`ambiguityEv`，每项 `required_source_names: []`、`exhaustive_negative: false`。

只有上述全部成立才写 O2 step completed，登记 artifact path、同次 Compose receipt 的五个命名 SHA/size 及双 pin，随后进入 O3。不得因此提前更新 coverage、替代 RC-1..RC-6、弱化 Human Gate，或声明多 part/C13、动态 join、语义 absence、Delegate binding 已支持。

`receipt.ok:false` 或 schema/assertion/literal observation 不合格，只能在同一 child 已终态且已有可信 continue binding 时按既有最多两次 rework 打回；否则 H。缺 envelope/binding/命名观察、工具不可用或 native failure 是 HOLD，不归责为成员返工且不得进入 O3。


#### Clause v2.2 单主合同 DOCX 自动消费（候选未部署时保持 HOLD）

v2.2 是 v2.1 的并存 sibling，不替换 v2.1。它只接纳一个已交付的主合同 DOCX；text 继续只按 v2.1 text 策略处理，不能因缺少派生来源而把 text 冒充 v2.2 成功。O0 现有账本不声明可信 format：这里的 `docx` 仅为本次 release-owned v2.2 capture policy，必须由同次 snapshot format、成功的 worker derivation 与 artifact 声明共同证明，不能从扩展名、成员自报或 O0 路径推断。

先执行上节同一 O0 单 part 五元组、Delegate 可信 binding 与 exact final artifact-path 前置。仅当成员最终 artifact 的 `contract_schema.version: 22`，才可选择本节；不满足或任何 v2.2 source representation 不完整时 HOLD，不能回落为 v2.1、重新拼装 artifact 或以 Read/Grep/FileDigest 代替。

在同一次 `StructuredFileValidateCompose` 中，仍仅捕获五个原生输入；无 inline schema/rules、无成员给出的替代 path/digest，也不传递 `derived_text_ref`：

```yaml
inputs:
  - {name: artifact, path: <final-receipt.artifact_path>, format: yaml}
  - {name: baseline, path: <current Lead O0 ledger absolute path>, format: yaml}
  - {name: pinned_schema, path: <published AgentFS clause-extractor v2.2 schema path>, format: json}
  - {name: rules, path: <published AgentFS review-orchestration v2.2 rules path>, format: json}
  - {name: part_0, path: <O0 objects[0].canonical_path>, format: docx}
schema_source: pinned_schema
schema_target: artifact
rules_source: rules
```

仅从 release-owned pin 的相对 source 解析路径：schema 为 `clause-extractor/schemas/clause-extraction-artifact-v22.schema.json`，rules 为 `${SKILL_DIR}/references/compose-contracts/clause-v22-single-main-contract.rules.json`。只接受 `clause-extraction@1.0.13`；schema SHA-256 必须为 `fc5355dfc349bde3ff52e0b05171010f7b6d8db0d5d3811576baf02ae7090d3d`，LF rules SHA-256 必须为 `4ca27f8d9e8566a2e9ae989d18377d864f646eeb91cd0aece8c93170f9b63fb8`。同次 capture 的 `part_0` snapshot format 必须为 `docx`；worker 必须成功派生 canonical text。任何 native、derivation、scope、schema、rules、deadline 或 public-envelope 错误均写 `O2_CLAUSE_V22_DOCX_COMPOSE_UNAVAILABLE` 并 HOLD，不归责为成员返工，也不能让成员自报派生 SHA/codec/长度替代平台结果。

仍只消费公共 `ToolExecutionResult.success: true` 的唯一 text JSON receipt。除上节公共 envelope 规则外，receipt 必须 `ok: true`，快照名称集合仍恰为五项，schema/rules/artifact binding 与双 release pin 必须逐项匹配；`binding.rule_manifest` 必须精确为 assertion_count `58`，selectors 依序为 `payloadEvidence`、`coverageEvidence`、`ambiguityEv`。其 `derived_sources` 必须恰有一项 `part_0`，且含原件 SHA/size、derived text SHA、`text_offset_codec: utf16_code_unit` 与 UTF-16 code-unit 长度，不含正文、路径或 lease ref。release-owned v2.2 rules 使用同次 worker 内的封闭 `derived_source` operand，把 artifact `source_representations[0]` 的原件 SHA/size、`format: docx`、`canonical_text`、派生 SHA、codec 和长度逐项绑定；Lead 不手工比较这些字符串。

只有上述 v2.2 contract 全部成立，才登记 artifact 与同次 receipt 并进入 O3。任何 `ok:false`、缺失/多余 derived source、source representation 与 snapshot/provenance 不一致、或 native 不可用均 HOLD；不得宣称 C13 已通过，且不得削弱 RC-1..RC-6、Human Gate、多 part/dynamic join 或语义 absence 的既有边界。
`Delegate`，`mode: sync`，目标 `clause-extractor`，为条款抽取创建独立 Work Context：

```yaml
target: clause-extractor
mode: sync
contextMode: isolated
intentId: "${case_id}:extract"
contextReason: "合同案件条款结构化，供后续分析环节共同使用。"
```

`sync` 的理由：条款结构表是 `risk-scanner`、`jurisdiction-auditor`、`review-reporter` 三者的共同输入。非阻塞会让三个下游在输入未定时启动，产出无法复现。

**O2 等待、归属与收口硬闸：**

- O2 task 只能传入本案已核验的输入、`receipt_path`、账本路径与 Lead canonical 根；**不得**指定 `clauses.yaml`、任何成员输出文件名或 Lead 工作区作为 `clause-extractor` 的写入目标。条款结构化官必须在自己的确认 workspace 创建唯一产物，并在自己的最终回执中返回绝对 `artifact_path`。团队同步时，该 workspace 只能是本次实际确认的 team effective cwd 内 member-owned `members/clause-extractor/<case_id>/<extraction_id>/artifact/` 子树：Lead 不得为成员创建、写入、改名或重组该产物；只可消费最终回执原样返回、且在当前团队 read scope 中可 `Read` 的绝对路径。
- `sync` 等待超时、取消提示、Delegate 返回文本不完整，或只看到中间文件/空骨架时，均不是 O2 成功或子任务终止的证据。Lead 不得读取、消费或登记这类中间产物为最终条款回执，也不得据此启动 O3。
- 已知本次 child run / Work Context 为 `active` 或状态未知时，账本写 `O2_WAITING_OR_UNKNOWN`、保留现有绑定并停在 O2；不得对同一 `case_id:extract` 另发 `isolated`、不得让两次 run 写同名共享输出。
- 无可信 child run 与 Work Context 绑定时，写 `O2_BINDING_UNAVAILABLE` 并转 `HALTED_FOR_HUMAN`；不得猜测 ID、从路径反推绑定或创建替代 `isolated`。
- 只有本次绑定任务已终态，且 v2 Compose/contract 结果不合格时，才可用「可信续接绑定」中同一目标/child run 的已登记 ID 以 `contextMode: continue` 打回。达到同环节两次上限仍不合格时转 `H`；不得以 `isolated` 重置计数或把 `continue` 当作 action resume。RC-1..RC-6 不能单独触发或替代 v2 自动验收。
- 最终回执路径与 O2 Compose 的精确 public-envelope/receipt 检查遵循所选的单 part v2.1 text 或 v2.2 DOCX 契约。只有同次五 capture、双 release pin、全量 binding/snapshot/rule_manifest、以及所需 v2.2 derived_sources 与 `receipt.ok:true` 全部成立，才可登记 artifact path、完成 O2 并进入 O3；Compose 未注册、失败、native/unsupported 或缺任一命名观察一律 HOLD。RC-1..RC-6 不得形成替代自动放行路径。

#### Clause v2.3 current multipart 候选（未发布，必须显式选择）

v2.3 是 v2.2 schema 的多材料候选，不替代已 pin 的 v2.1/v2.2 分支，也不表示平台或团队版本已发布。Lead 必须先在既有 O2 决策记录中明确选择**本节具名的 `v2.3 current multipart` 分支**；未选择、不能确认当前安装团队，或未能从该团队实际 read scope 解析 controls 的精确绝对路径时一律 HOLD，不能借用 Lead Skill、旧个人 workspace、其他 AgentFS 或猜测的根路径。仅当 O0 已用完整库存 schema 验证并冻结同次 baseline，且 `current_contract.parts` 中恰有一份 `main_contract`、所有当前已交付 part 不超过 28 份时，才可准备一次 Compose：`pinned_schema`、`artifact`、`rules`、同次完整 O0 `baseline` 四个 control captures，加上每个已交付 current part 的实际 capture。历史合同、reference、operator、commercial、resume 和 unclassified 材料不得进入 Clause parts、frozen baseline、source representations 或 delivered captures；这些桶可合法非空，Compose 链只绑定 O0 已声明的 current 集合，不证明 Agent 分类语义本身。

固定 schema 与 rules 均必须从**当前实际安装团队**的 `shared/resources/compose-contracts/` 在当前 read scope 内解析并 `Read` 精确字节：只接受 `clause-extraction@1.0.13`，且 `clause-extraction-artifact-v22.schema.json` 的 SHA-256 必须为 `fc5355dfc349bde3ff52e0b05171010f7b6d8db0d5d3811576baf02ae7090d3d`；`clause-v23-current-multipart.rules.json` 必须保持 LF-only，SHA-256 必须为 `161a1eeb124db1f69320930d81c3076d2f8a8940bb63627490bacd4da040b82f`。Compose 的 `pinned_schema` 与 `rules` 分别使用这两个已解析的绝对路径；不得从 `${SKILL_DIR}`、Lead workspace、成员 workspace 或其他 AgentFS 复制、换根或替代。任一 exact `Read`、scope 或 hash 检查失败均记录实际 code 并 HOLD。Clause 委派仍必须按 v2.2 schema 输出：每个 delivered part 在 `parts`、`frozen_baseline.parts` 和 `source_representations` 中保持一致；未交付 part 保留 typed `part_not_delivered` debt，且不得有 representation 或 capture。Lead 不从 part index 猜 source name/format，也不把 artifact 自报 metadata 当 capture 事实。

三个正向 evidence selector 使用 release-owned dynamic part-to-capture mapping；receipt 的 `source_requirement: captured_representation_part` 只说明动态来源账务。所有动态 required sources 都必须 complete，且 receipt `ok:true`、binding、snapshot、schema/rules pin、metadata/provenance 与 public envelope 均通过才可进入 O3。无 quote 只可能完成来源可读性，不能证明条款不存在、语义结论或 Human Gate。任一 capture 超限、动态 map/metadata/provenance 不匹配、未交付 part 被引用、native/unsupported/deadline 或 receipt 缺失都 HOLD；不得删件、降级为旧静态规则，或提前发布团队版本。

v2.3 的固定 receipt 消费合同也必须逐项核对：同次 capture 恰有 `pinned_schema`、`artifact`、`rules`、`baseline` 四个 control，外加每个 delivered current part 的命名 capture；每个 capture 的公开 snapshot `name`、format、SHA-256、size 必须与本次请求和 artifact→representation→trusted metadata 链一致。`binding.schema_source`、`binding.schema_target`、`binding.rules_source` 必须分别是前三个 control，且 rules SHA 与上述 pin 相等。`binding.rule_manifest.assertion_count` 必须为 24；selector 按 `payloadEvidence`、`coverageEvidence`、`ambiguityEv` 的固定顺序，各自只能是闭合四字段 `{ id, required_source_names, exhaustive_negative, source_requirement }`，其中 `source_requirement` 必须为 `captured_representation_part`、`exhaustive_negative:false`，而 `required_source_names` 必须恰等于本次 delivered capture 名称集合。对应 public literal receipt 的 required/completed 名称集合也必须恰等于该集合、failed 为空且 `all_required_sources_completed:true`；任一缺失、额外、重复、顺序/哈希/大小/格式不匹配或三字段旧形状均 HOLD。该消费检查只验证固定发布规则和本次可信回执，不从模型文字、artifact 自报 provenance 或 receipt 外字段补全来源。
