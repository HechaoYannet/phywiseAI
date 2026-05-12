export type WhiteboardNodeKind =
  | "condition_card"
  | "equation_block"
  | "force_vector"
  | "circuit_element"
  | "ray_path"
  | "simulation_object"
  | "hint_card"
  | "free_note"
  | "image_asset";

export interface WhiteboardRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
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
  locked?: boolean;
  metadata?: Record<string, unknown>;
}

export type ConditionCardNode = WhiteboardNodeBase<
  "condition_card",
  {
    label: string;
    value: string;
    source: "ocr" | "student" | "teacher" | "agent";
    confidence?: number;
  }
>;

export type EquationBlockNode = WhiteboardNodeBase<
  "equation_block",
  {
    latex: string;
    markdown?: string;
    status: "draft" | "verified" | "incorrect";
  }
>;

export type ForceVectorNode = WhiteboardNodeBase<
  "force_vector",
  {
    label: string;
    magnitude?: string;
    angle_deg?: number;
    anchor: string;
  }
>;

export type CircuitElementNode = WhiteboardNodeBase<
  "circuit_element",
  {
    element: "resistor" | "battery" | "switch" | "ammeter" | "voltmeter" | "wire";
    label?: string;
    value?: string;
  }
>;

export type RayPathNode = WhiteboardNodeBase<
  "ray_path",
  {
    ray_type: "incident" | "reflected" | "refracted" | "normal";
    label?: string;
  }
>;

export type SimulationObjectNode = WhiteboardNodeBase<
  "simulation_object",
  {
    simulation_object_id: string;
    title: string;
    module: "kinematics" | "forces" | "circuits" | "geometric_optics";
  }
>;

export type HintCardNode = WhiteboardNodeBase<
  "hint_card",
  {
    title: string;
    hint: string;
    level: 1 | 2 | 3;
  }
>;

export type FreeNoteNode = WhiteboardNodeBase<
  "free_note",
  {
    markdown: string;
  }
>;

export type ImageAssetNode = WhiteboardNodeBase<
  "image_asset",
  {
    source_asset_id: string;
    alt: string;
    page?: number;
  }
>;

export type WhiteboardNode =
  | ConditionCardNode
  | EquationBlockNode
  | ForceVectorNode
  | CircuitElementNode
  | RayPathNode
  | SimulationObjectNode
  | HintCardNode
  | FreeNoteNode
  | ImageAssetNode;

export interface WhiteboardDocumentSnapshot {
  nodes: WhiteboardNode[];
  edges: WhiteboardEdge[];
  viewport: ViewportState;
}

export function makeNodeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

