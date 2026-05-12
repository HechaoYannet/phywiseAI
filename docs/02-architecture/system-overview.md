# 系统总览

## 核心分层

- `apps/web`: 学生工作台、教师轻入口、上传与展示层。
- `apps/api`: OCR 编排、解析、Tutor、仿真和回放 API。
- `packages/contracts`: Web 与未来 App 共用的共享协议。
- `packages/whiteboard-schema`: 与具体白板实现解耦的工作区文档结构。
- `packages/domain`: 领域辅助逻辑和演示数据。

## 主链路

1. 用户上传题图或 PDF。
2. API 触发 OCR 与解析流水线。
3. 解析结果转成 `ProblemParseResult`。
4. 系统生成 `WorkspaceDocument`。
5. 学生在白板中交互并触发 `TutorTurn`。
6. 相关节点可驱动 `SimulationScene`。
7. 回放与错因通过 `ReplayEvent` 与 `MasteryTrace` 保存。

## 自托管基线

- Web：Next.js。
- API：FastAPI。
- 数据库：Postgres。
- 队列与缓存：Redis。
- 文件存储：S3 兼容对象存储。

