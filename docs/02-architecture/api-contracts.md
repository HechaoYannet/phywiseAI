# API 契约

## 当前主链路

- `POST /api/workspaces`: 创建空白工作台或调试态解析工作台。
- `GET /api/workspaces/{workspace_id}`: 读取工作台。
- `PATCH /api/workspaces/{workspace_id}`: 保存工作台并生成新 revision。
- `POST /api/workspaces/{workspace_id}/sources`: 在当前工作台内导入图片、PDF 或文本。
- `POST /api/workspaces/{workspace_id}/analyze-source`: 把导入资源转成板上 AI 建议。
- `POST /api/workspaces/{workspace_id}/analyze-board`: 分析当前板面并返回 AI 建议。
- `POST /api/workspaces/{workspace_id}/suggestions/{suggestion_id}/accept`: 接受建议并应用 patch。
- `POST /api/workspaces/{workspace_id}/suggestions/{suggestion_id}/reject`: 拒绝建议并更新状态。
- `GET /api/workspaces/{workspace_id}/revisions`: 读取修订历史。

## 保留的内部调试链路

- `POST /api/uploads`
- `GET /api/uploads/{asset_id}/content`
- `GET /api/uploads/previews/{preview_key}`
- `POST /api/problems/parse-jobs`
- `GET /api/problems/parse-jobs/{job_id}`
- `GET /api/problems/{problem_id}`

这些接口仍保留给确认页和调试流程，但不再是主产品入口。

## 关键结构

- `SourceAsset`: 记录导入资源的类型、存储键、预览页和来源方式。
- `ProblemParseResult`: 表示题干、条件、小问和 provider trace 的结构化解析结果。
- `WorkspaceDocument`: 跨端业务真相，包含白板节点、视口、掌握度、suggestions 和修订信息。
- `BoardSuggestion`: AI 只能输出的建议结构，包含 `kind`、`target_node_ids`、`patch`、`reason`、`status`。
- `BoardPatch`: 工作台节点和边的增删改补丁，不允许携带 renderer 私有格式。

## 设计约束

- AI 结果必须先以 suggestion 形式返回，不能静默覆盖学生内容。
- 低置信度解析仍要显式返回 `needs_confirmation` 和 `provider_trace`。
- 工作台保存必须生成新的 `revision_id`。
- 工作台导入和板面分析都应只写业务协议，不写 renderer 内部文档。
