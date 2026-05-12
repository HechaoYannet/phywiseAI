# API 契约

## 核心接口

- `POST /api/uploads`: 创建上传资产，返回 `SourceAsset`。
- `POST /api/problems/parse`: 解析题目，返回 `ProblemParseResult`。
- `POST /api/workspaces`: 创建工作区，返回 `WorkspaceDocument`。
- `POST /api/tutor/turns`: 生成教学回合，返回 `TutorTurn`。
- `POST /api/simulations/rebuild`: 重建仿真场景，返回 `SimulationScene`。
- `POST /api/assignments`: 创建教师分享任务，返回 `Assignment`。
- `GET /api/replays/{session_id}`: 读取过程回放，返回 `ReplayEvent[]`。

## 设计约束

- 所有 AI 结果必须先过类型层。
- 低置信度解析要显式返回 `needs_confirmation`。
- Tutor 不允许直接返回原始思维链。
- 仿真重建是纯结构化协议，不依赖特定渲染端。

