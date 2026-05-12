# 部署拓扑

## 目标拓扑

- 反向代理：Nginx 或同类网关。
- `apps/web`: Next.js 进程，负责页面与 BFF。
- `apps/api`: FastAPI 进程，负责解析、Tutor 和仿真 API。
- Worker：异步 OCR 和重解析任务。
- Postgres：持久化用户、题目、回放、作业和知识链接。
- Redis：缓存、短态和任务队列。
- Object Storage：PDF、图片、快照、导出文件。

## 原则

- 托管层可替换，业务协议不变。
- 流式响应与多实例缓存由自托管环境自行保证。
- 未来如接入托管平台，只替换部署层，不重写业务核心。

