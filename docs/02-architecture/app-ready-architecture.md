# 面向未来 App 的架构铺垫

## 目标

为未来 PWA、壳化 App、原生 iPad/Android Pad 保留同一份业务协议。

## 现在必须做的事

- 让 `WorkspaceDocument` 成为单一工作区真相。
- 共享类型放入 `packages/contracts`。
- 视觉 token 放入 `packages/design-tokens`。
- Tutor、仿真、回放都走 API 契约。
- 不把业务逻辑塞进 Web 专属组件状态中。

## 后续路径

- 第一阶段：继续强化 Web 与 PWA。
- 第二阶段：为 `apps/mobile` 预留 `Expo/React Native` 工程。
- 第三阶段：替换手写、文件选择、离线缓存等关键原生能力。

