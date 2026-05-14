export type WhiteboardNodeKind =
  | "source_image"
  | "rich_block"
  | "phy_canvas"
  | "ai_annotation";

export type WhiteboardLayer = "source" | "student" | "ai" | "overlay";

export interface WhiteboardRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

export interface WhiteboardAnchor {
  id: string;
  x: number;
  y: number;
  label?: string;
}

export interface WhiteboardEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

interface WhiteboardNodeBase<TKind extends WhiteboardNodeKind, TPayload> {
  id: string;
  kind: TKind;
  rect: WhiteboardRect;
  payload: TPayload;
  anchors: WhiteboardAnchor[];
  layer: WhiteboardLayer;
  z_index: number;
  locked: boolean;
  semantic_role?: string;
  source_refs: string[];
  metadata?: Record<string, unknown>;
}

export type SourceImageNode = WhiteboardNodeBase<
  "source_image",
  {
    source_asset_id: string;
    preview_key?: string;
    alt: string;
    page?: number;
    width?: number;
    height?: number;
    caption?: string;
  }
>;

export type RichBlockNode = WhiteboardNodeBase<
  "rich_block",
  {
    content: string;
    content_format: "markdown_math";
    block_role: "note" | "derivation" | "equation" | "condition";
    status: "draft" | "checked" | "final";
    title?: string;
  }
>;

export type PhyCanvasNode = WhiteboardNodeBase<
  "phy_canvas",
  {
    scene_kind: "force_analysis";
    scene_xml: string;
    version: number;
    bounds: {
      width: number;
      height: number;
    };
    summary?: string;
  }
>;

export type AiAnnotationNode = WhiteboardNodeBase<
  "ai_annotation",
  {
    title: string;
    text: string;
    tone: "hint" | "warning" | "check" | "next_step";
    suggestion_id?: string;
  }
>;

export type WhiteboardNode =
  | SourceImageNode
  | RichBlockNode
  | PhyCanvasNode
  | AiAnnotationNode;

export interface WhiteboardDocumentSnapshot {
  nodes: WhiteboardNode[];
  edges: WhiteboardEdge[];
  viewport: ViewportState;
}

export function makeNodeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
