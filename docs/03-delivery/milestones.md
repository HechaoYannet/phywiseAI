# 里程碑

## M0 仓库与协议基线

状态：已完成

- monorepo 结构
- 共享 contracts
- Web/API 骨架
- docs 文档体系

## M1 画板优先受力分析工作台

状态：进行中

- 空白工作台创建
- 板内资源导入
- `WorkspaceDocument` 业务真相
- suggestions 驱动的 AI 补全与检查

当前已落地：

- 首页直接进入空白工作台
- 工作台内导入图片、PDF、文本
- `BoardSuggestion` 与 `BoardPatch` 协议
- `source/analyze-board/accept/reject` API
- 工作台保存、修订历史与板面自动保存

M1 收口条件：

- 打通受力分析闭环：导入/建题 -> 画受力图 -> 写公式 -> AI 检查
- 保证 `WorkspaceDocument` round-trip 不依赖 renderer 私有格式
- 空白工作台与导入工作台都能稳定保存、恢复和生成 revision

## M2 Tutor 工作流

- 局部提示、检查和反馈卡片
- 回放事件与错因标签
- 更细粒度的节点级教学建议

## M3 教学级仿真

- 静态受力正确性检查深化
- 运动学
- 基础电路
- 几何光学

## M4 教师轻功能

- 布题链接
- 过程回放
- 关键停滞点与错因汇总
