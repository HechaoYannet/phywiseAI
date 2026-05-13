import type { WhiteboardNode } from "@phywise/whiteboard-schema";
import { makeNodeId } from "@phywise/whiteboard-schema";

export type BoardTool =
  | "select"
  | "text"
  | "formula"
  | "body"
  | "surface"
  | "force"
  | "condition"
  | "import";

function baseNode(node: WhiteboardNode): WhiteboardNode {
  return {
    ...node,
    anchors: node.anchors ?? [],
    layer: node.layer ?? "student",
    z_index: node.z_index ?? 2,
    locked: node.locked ?? false,
    source_refs: node.source_refs ?? []
  };
}

export function createNodeFromTool(tool: Exclude<BoardTool, "select" | "import">, x: number, y: number): WhiteboardNode {
  switch (tool) {
    case "text":
      return baseNode({
        id: makeNodeId("text"),
        kind: "free_text",
        rect: { x, y, w: 260, h: 160 },
        payload: { text: "在这里写题意、假设或结论。", markdown: "在这里写题意、假设或结论。" },
        anchors: [],
        layer: "student",
        z_index: 2,
        locked: false,
        semantic_role: "working-note",
        source_refs: []
      });
    case "formula":
      return baseNode({
        id: makeNodeId("formula"),
        kind: "formula_block",
        rect: { x, y, w: 300, h: 150 },
        payload: {
          latex: "\\sum F = 0",
          explanation: "把平衡式、分解式或牛顿第二定律写在这里。",
          status: "draft"
        },
        anchors: [],
        layer: "student",
        z_index: 3,
        locked: false,
        semantic_role: "derivation",
        source_refs: []
      });
    case "body":
      return baseNode({
        id: makeNodeId("body"),
        kind: "physics_body",
        rect: { x, y, w: 120, h: 84 },
        payload: { label: "物体", body_shape: "block", notes: "" },
        anchors: [{ id: "center", x: 0.5, y: 0.5, label: "中心" }],
        layer: "student",
        z_index: 4,
        locked: false,
        semantic_role: "main-body",
        source_refs: []
      });
    case "surface":
      return baseNode({
        id: makeNodeId("surface"),
        kind: "surface_line",
        rect: { x, y, w: 220, h: 14, rotation: -18 },
        payload: { label: "斜面", angle_text: "theta", surface_kind: "plane" },
        anchors: [],
        layer: "student",
        z_index: 2,
        locked: false,
        semantic_role: "inclined-plane",
        source_refs: []
      });
    case "force":
      return baseNode({
        id: makeNodeId("force"),
        kind: "force_arrow",
        rect: { x, y, w: 140, h: 18, rotation: 0 },
        payload: { label: "F", magnitude_text: "", direction_deg: 0, notes: "" },
        anchors: [{ id: "base", x: 0, y: 0.5 }, { id: "tip", x: 1, y: 0.5 }],
        layer: "student",
        z_index: 5,
        locked: false,
        semantic_role: "unknown-force",
        source_refs: []
      });
    case "condition":
      return baseNode({
        id: makeNodeId("condition"),
        kind: "condition_card",
        rect: { x, y, w: 260, h: 120 },
        payload: { label: "已知条件", value: "填写状态、已知量或限制条件。", source: "student" },
        anchors: [],
        layer: "student",
        z_index: 3,
        locked: false,
        semantic_role: "known-condition",
        source_refs: []
      });
  }
}

export function createForceAnalysisTemplate(): WhiteboardNode[] {
  return [
    createNodeFromTool("body", 480, 240),
    createNodeFromTool("surface", 400, 360),
    createNodeFromTool("condition", 860, 80),
    createNodeFromTool("formula", 860, 250),
    baseNode({
      id: makeNodeId("check"),
      kind: "ai_annotation",
      rect: { x: 860, y: 430, w: 300, h: 140 },
      payload: {
        title: "检查区",
        text: "在这里记录 AI 或你自己对受力完整性、方向和列式的检查结果。",
        tone: "check"
      },
      anchors: [],
      layer: "overlay",
      z_index: 6,
      locked: false,
      semantic_role: "check-zone",
      source_refs: []
    })
  ];
}
