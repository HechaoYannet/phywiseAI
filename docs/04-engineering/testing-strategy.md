# 测试策略

## 单元与协议测试

- contracts 类型形状。
- domain helper 行为。
- API schema 序列化与反序列化。
- `python -m pytest apps/api/tests -q` 作为 Python 基线检查。

## 集成测试

- 空白工作台创建与保存。
- 板内导入到 source 节点生成。
- `analyze-source` 到 suggestions 生成。
- `accept/reject` 到 `WorkspaceDocument` patch 应用。
- Tutor 回合生成。
- 仿真重建。
- `pnpm typecheck` 与 `pnpm build:web` 作为 Node 侧基线检查。

## 端到端测试

- 学生完成一次空白建题/导题到受力分析检查流程。
- 教师查看一次过程回放。

## 关键验收

- 低置信度题目进入确认模式。
- Tutor 不泄露原始推理链。
- 同一 `WorkspaceDocument` 可被不同客户端消费。
