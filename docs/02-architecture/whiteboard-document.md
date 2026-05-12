# Whiteboard Document

## 目标

`WorkspaceDocument` 是客户端无关的工作区真相。当前 Web 使用的渲染器可以更换，但这个协议不应被替换。

## 组成

- `whiteboard_nodes`
- `whiteboard_edges`
- `viewport`
- `conversation_refs`
- `simulation_bindings`
- `selection_state`
- `mastery`

## 首发节点类型

- `condition_card`
- `equation_block`
- `force_vector`
- `circuit_element`
- `ray_path`
- `simulation_object`
- `hint_card`
- `free_note`
- `image_asset`

## 约束

- 节点 payload 必须面向业务含义，而不是 renderer 私有格式。
- 所有图示编辑应可映射回结构化 node。

