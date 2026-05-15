# Whiteboard Document

## 目标

`WorkspaceDocument` 是客户端无关的业务真相。Web 端可以换 renderer，但不能换掉这个协议。

## 当前阶段约束

- 主入口是空白工作台，不以 `problem_id` 作为创建前提。
- Web renderer 只负责运行时交互；不得持久化 renderer 私有 JSON。
- 所有 AI 输出都先落成 `BoardSuggestion`，由学生接受或拒绝后才更新文档。
- 修订历史通过 `WorkspaceRevision` 独立存储，客户端只依赖 `revision_id` 做恢复与回放。

## 当前文档组成

- `whiteboard_nodes`
- `whiteboard_edges`
- `viewport`
- `conversation_refs`
- `simulation_bindings`
- `selection_state`
- `mastery`
- `suggestions`
- `revision_id`
- `updated_at`

## 首发节点集合

- `source_image`
- `rich_block`
- `phy_canvas`
- `ai_annotation`

当前 Web 端不再把力、物块、斜面、公式和条件分别持久化成顶层白板节点。顶层节点保持粗粒度：

- `source_image` 承载导入图片/PDF 页预览及来源资源引用。
- `rich_block` 承载题干、条件、推导、公式等 Markdown + math 文本块。当前 Web 端用 Chromium 兼容的 Markdown + KaTeX 渲染链路展示这些内容，协议中只保存原始 `content` 与 `content_format`，不持久化 renderer 私有结构。
- `phy_canvas` 承载受力分析场景，内部对象通过稳定 XML 与 `BoardObjectRef` 子引用寻址。
- `ai_annotation` 承载 AI 检查、提示和下一步建议的可见卡片。

受力图内部对象如 body、surface、force、label 属于 `phy_canvas` 子对象，不作为 `whiteboard_nodes` 的顶层 kind。AI 对这些对象的建议必须通过 `BoardSuggestion.target_object_refs` 与 `BoardPatch.object_mutations` 指向子对象，仍然由学生接受或拒绝后才写回。

## 统一语义字段

每个白板节点都应携带以下业务字段，而不是依赖 renderer 内部结构：

- `anchors`
- `layer`
- `z_index`
- `locked`
- `semantic_role`
- `source_refs`

## Renderer Adapter

当前 Web 端需要显式存在 adapter 层，负责：

- `WorkspaceDocument -> runtime shapes`
- `runtime user edits -> WorkspaceDocument patches`
- `rich_block.content_format = markdown_math` 的显示层渲染，不改变文档协议本身。

这样可以保证未来切换到 `tldraw` 或其他 renderer 时，不影响服务端保存、回放和 AI 分析协议。
