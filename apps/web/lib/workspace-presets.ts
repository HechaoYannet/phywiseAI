import type { RichBlockNode, WhiteboardNode } from "@phywise/whiteboard-schema";
import { makeNodeId } from "@phywise/whiteboard-schema";

export type BoardTool = "select" | "block" | "diagram" | "import";

export const DEFAULT_FORCE_SCENE_XML =
  '<phy-canvas scene-kind="force_analysis" version="1" width="360" height="240">' +
  '<body id="body-main" x="128" y="74" w="92" h="62" rotation="0" label="物块" shape="block" />' +
  '<surface id="surface-main" x="78" y="154" w="210" h="12" rotation="-18" label="斜面" angle="theta" surface-kind="plane" />' +
  '<label id="label-angle" x="242" y="160" text="theta" />' +
  "</phy-canvas>";

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

export function createRichBlockNode(
  x: number,
  y: number,
  options?: Partial<RichBlockNode["payload"]> & {
    width?: number;
    height?: number;
    semanticRole?: string;
    title?: string;
  }
): WhiteboardNode {
  return baseNode({
    id: makeNodeId("block"),
    kind: "rich_block",
    rect: { x, y, w: options?.width ?? 320, h: options?.height ?? 180 },
    payload: {
      title: options?.title ?? "笔记",
      content: options?.content ?? "在这里直接写题意、已知条件、推导或结论。",
      content_format: "markdown_math",
      block_role: options?.block_role ?? "note",
      status: options?.status ?? "draft"
    },
    anchors: [],
    layer: "student",
    z_index: 3,
    locked: false,
    semantic_role: options?.semanticRole ?? "working-note",
    source_refs: []
  });
}

export function createPhyCanvasNode(
  x: number,
  y: number,
  options?: {
    width?: number;
    height?: number;
    summary?: string;
    sceneXml?: string;
    semanticRole?: string;
  }
): WhiteboardNode {
  const width = options?.width ?? 360;
  const height = options?.height ?? 240;

  return baseNode({
    id: makeNodeId("diagram"),
    kind: "phy_canvas",
    rect: { x, y, w: width, h: height },
    payload: {
      scene_kind: "force_analysis",
      scene_xml: options?.sceneXml ?? DEFAULT_FORCE_SCENE_XML,
      version: 1,
      bounds: { width, height },
      summary: options?.summary ?? "受力分析图"
    },
    anchors: [],
    layer: "student",
    z_index: 4,
    locked: false,
    semantic_role: options?.semanticRole ?? "force-scene",
    source_refs: []
  });
}

export function createNodeFromTool(
  tool: Exclude<BoardTool, "select" | "import">,
  x: number,
  y: number
): WhiteboardNode {
  if (tool === "diagram") {
    return createPhyCanvasNode(x, y);
  }

  return createRichBlockNode(x, y, {
    title: "笔记",
    block_role: "note",
    status: "draft"
  });
}

export function createForceAnalysisTemplate(): WhiteboardNode[] {
  return [
    createPhyCanvasNode(460, 220, {
      summary: "受力分析图",
      semanticRole: "force-scene"
    }),
    createRichBlockNode(860, 88, {
      width: 290,
      height: 132,
      title: "已知条件",
      content: "静止\nm, theta, mu",
      block_role: "condition",
      status: "checked",
      semanticRole: "known-condition"
    }),
    createRichBlockNode(860, 248, {
      width: 320,
      height: 160,
      title: "推导",
      content: "沿斜面方向：`\\\\sum F_{\\\\parallel}=0`",
      block_role: "derivation",
      status: "draft",
      semanticRole: "derivation"
    }),
    baseNode({
      id: makeNodeId("ai"),
      kind: "ai_annotation",
      rect: { x: 860, y: 438, w: 300, h: 120 },
      payload: {
        title: "检查区",
        text: "在这里查看 AI 对受力完整性和列式步骤的检查。",
        tone: "check"
      },
      anchors: [],
      layer: "overlay",
      z_index: 5,
      locked: false,
      semantic_role: "check-zone",
      source_refs: []
    })
  ];
}
