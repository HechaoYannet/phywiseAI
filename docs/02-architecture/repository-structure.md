# 仓库结构

## 顶层目录

- `apps/web`: Web 客户端。
- `apps/api`: Python API。
- `packages/contracts`: 共享业务协议。
- `packages/domain`: 示例数据与领域帮助函数。
- `packages/whiteboard-schema`: 白板节点和边定义。
- `packages/design-tokens`: 视觉 token。
- `docs`: 项目正式文档。

## 约束

- Web 不直接把 renderer 内部结构当持久化格式。
- API 不直接返回自由文本作为业务结果。
- 所有跨端共享数据结构优先进入 `packages/contracts`。

