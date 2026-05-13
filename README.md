# Phywise

Phywise 当前阶段是一个面向中学物理受力分析的“画板优先”学生工作台。
默认入口直接进入空白工作台；上传 PDF、图片或文本只是工作台内部的导入能力。

## 当前产品边界

- 首发只打透受力分析闭环：导入题目、画受力图、写公式、接受 AI 建议、保存过程。
- `WorkspaceDocument` 是唯一业务真相，保存、回放和 AI 输入输出都基于它。
- Web 端 renderer 只是运行时交互层，不能反客为主成为持久化格式。
- AI 默认强自动触发，但只能返回可接受/可拒绝的建议，不能静默改写学生内容。

## Repository Layout

- `apps/web`: Next.js 学生工作台与内部调试页面。
- `apps/api`: FastAPI 工作台、资源导入、解析和建议接口。
- `packages/contracts`: 前后端共享的工作台、题目和建议协议。
- `packages/domain`: 领域辅助逻辑与示例数据。
- `packages/whiteboard-schema`: 与 renderer 解耦的白板业务节点模型。
- `packages/design-tokens`: Web 与未来 App 共享的设计令牌。
- `docs`: 产品、架构、交付和工程文档。

## Quick Start

先读 [docs/README.md](/E:/otherProject/phywise/docs/README.md)，再看
[docs/04-engineering/quickstart.md](/E:/otherProject/phywise/docs/04-engineering/quickstart.md)。

本地默认使用 `conda` 管理 Python 环境，使用 `pip` 安装 API 依赖。
