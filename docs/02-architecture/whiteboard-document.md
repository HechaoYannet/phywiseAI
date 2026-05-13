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
- `free_text`
- `formula_block`
- `physics_body`
- `surface_line`
- `force_arrow`
- `condition_card`
- `ai_annotation`

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

这样可以保证未来切换到 `tldraw` 或其他 renderer 时，不影响服务端保存、回放和 AI 分析协议。
