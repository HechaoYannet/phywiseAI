# 系统总览

## 核心分层

- `apps/web`: 画板优先的学生工作台和内部调试页面。
- `apps/api`: 工作台、资源导入、解析、建议、Tutor 和仿真 API。
- `packages/contracts`: Web 与未来 App 共用的共享协议。
- `packages/whiteboard-schema`: 与 renderer 解耦的业务节点模型。
- `packages/domain`: 领域辅助逻辑与示例数据。

## 当前主流程

1. 用户打开首页，直接进入空白工作台。
2. 学生可以在板内空白开始、导入题目，或插入受力分析模板。
3. 工作台把图片、PDF 或文本先落成 `SourceAsset` 与板上 source 节点。
4. `analyze-source` 把导入资源转成 `BoardSuggestion`，例如条件卡、受力图候选、列式提示。
5. 学生在同一块板上拖拽、补画、写公式并触发自动保存。
6. `analyze-board` 只对当前板面返回新的建议，不直接改写内容。
7. 接受建议后，`BoardPatch` 才会写回 `WorkspaceDocument` 并生成新 revision。

## 当前阶段边界

- 首发只打透受力分析，不覆盖电路、光学和完整仿真闭环。
- Teacher、完整 Tutor 聊天主界面和教学级动态仿真不作为当前主交付。
- 旧上传确认页仍保留，但只作为内部调试链路。

## 自托管基线

- Web：Next.js
- API：FastAPI
- 数据库：默认 `SQLite`
- 队列与缓存：默认同步解析，可选 `Redis + RQ`
- 文件存储：默认本地文件系统
