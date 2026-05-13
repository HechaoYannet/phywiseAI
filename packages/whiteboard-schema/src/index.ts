export type WhiteboardNodeKind =
  | "source_image"
  | "free_text"
  | "formula_block"
  | "physics_body"
  | "surface_line"
  | "force_arrow"
  | "condition_card"
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

export type FreeTextNode = WhiteboardNodeBase<
  "free_text",
  {
    text: string;
    markdown?: string;
  }
>;

export type FormulaBlockNode = WhiteboardNodeBase<
  "formula_block",
  {
    latex: string;
    explanation?: string;
    status: "draft" | "checked" | "final";
  }
>;

export type PhysicsBodyNode = WhiteboardNodeBase<
  "physics_body",
  {
    label: string;
    body_shape: "block" | "particle" | "cart" | "custom";
    notes?: string;
  }
>;

export type SurfaceLineNode = WhiteboardNodeBase<
  "surface_line",
  {
    label?: string;
    angle_text?: string;
    surface_kind: "plane" | "ground" | "wall";
  }
>;

export type ForceArrowNode = WhiteboardNodeBase<
  "force_arrow",
  {
    label: string;
    magnitude_text?: string;
    direction_deg: number;
    target_node_id?: string;
    notes?: string;
  }
>;

export type ConditionCardNode = WhiteboardNodeBase<
  "condition_card",
  {
    label: string;
    value: string;
    source: "ocr" | "student" | "teacher" | "agent";
    confidence?: number;
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
  | FreeTextNode
  | FormulaBlockNode
  | PhysicsBodyNode
  | SurfaceLineNode
  | ForceArrowNode
  | ConditionCardNode
  | AiAnnotationNode;

export interface WhiteboardDocumentSnapshot {
  nodes: WhiteboardNode[];
  edges: WhiteboardEdge[];
  viewport: ViewportState;
}

export function makeNodeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
