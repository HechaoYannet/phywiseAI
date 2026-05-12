import type {
  ViewportState,
  WhiteboardEdge,
  WhiteboardNode
} from "@phywise/whiteboard-schema";

export type SourceAssetKind = "pdf" | "image" | "markdown" | "latex" | "photo" | "other";
export type GradeBand = "middle_school" | "high_school" | "cross_stage";
export type KnowledgeLinkKind =
  | "concept"
  | "formula"
  | "problem_type"
  | "misconception"
  | "experiment";

export interface SourceAsset {
  id: string;
  kind: SourceAssetKind;
  filename: string;
  mime_type: string;
  bytes: number;
  object_key: string;
  page_count?: number;
  created_at: string;
}

export interface KnowledgeLink {
  id: string;
  kind: KnowledgeLinkKind;
  key: string;
  title: string;
  grade_band: GradeBand;
  weight: number;
  notes?: string;
}

export interface ProblemCondition {
  id: string;
  label: string;
  value: string;
  unit?: string;
  source: "ocr" | "student" | "teacher" | "agent";
}

export interface DiagramEntity {
  id: string;
  kind:
    | "point"
    | "line"
    | "body"
    | "force"
    | "circuit"
    | "ray"
    | "lens"
    | "mirror"
    | "axis"
    | "label"
    | "other";
  description: string;
  confidence: number;
  linked_node_id?: string;
}

export interface ProblemSubquestion {
  id: string;
  prompt: string;
  expected_output: "numeric" | "algebraic" | "explanatory" | "diagrammatic";
  knowledge_keys: string[];
}

export interface ProblemParseResult {
  problem_id: string;
  source_asset_id: string;
  stem: string;
  subquestions: ProblemSubquestion[];
  conditions: ProblemCondition[];
  diagram_entities: DiagramEntity[];
  knowledge_links: KnowledgeLink[];
  confidence: number;
  needs_confirmation: boolean;
  warnings: string[];
}

export interface SimulationObject {
  id: string;
  kind: "body" | "surface" | "circuit_node" | "lens" | "mirror" | "light_source";
  label: string;
  properties: Record<string, string | number | boolean>;
}

export interface SimulationParameter {
  key: string;
  label: string;
  value: string | number;
  unit?: string;
}

export interface SimulationBinding {
  id: string;
  source_node_id: string;
  target_object_id: string;
  property: string;
}

export interface SimulationScene {
  id: string;
  module: "kinematics" | "forces" | "circuits" | "geometric_optics";
  objects: SimulationObject[];
  constraints: string[];
  parameters: SimulationParameter[];
  equations: string[];
  observables: string[];
  bindings: SimulationBinding[];
  snapshot_label: string;
}

export interface ConceptMasteryState {
  knowledge_key: string;
  status: "unseen" | "introduced" | "practicing" | "mastered" | "at_risk";
  evidence_count: number;
}

export interface MasteryTrace {
  concept_states: ConceptMasteryState[];
  misconceptions: string[];
  updated_at: string;
}

export interface WorkspaceDocument {
  id: string;
  title: string;
  source_asset_id?: string;
  problem_id?: string;
  whiteboard_nodes: WhiteboardNode[];
  whiteboard_edges: WhiteboardEdge[];
  viewport: ViewportState;
  conversation_refs: {
    turn_ids: string[];
  };
  simulation_bindings: SimulationBinding[];
  selection_state: {
    selected_node_ids: string[];
    focused_subquestion_id?: string;
  };
  mastery: MasteryTrace;
}

export interface TutorTurn {
  id: string;
  session_id: string;
  mode: "ask" | "hint" | "check" | "feedback" | "reveal" | "summary";
  prompt: string;
  hint?: string;
  check?: string;
  feedback?: string;
  reveal_state: "locked" | "available" | "revealed";
  suggested_actions: string[];
  linked_knowledge_keys: string[];
  created_at: string;
}

export interface ReplayEvent {
  id: string;
  workspace_id: string;
  type:
    | "upload"
    | "parse"
    | "node_added"
    | "node_updated"
    | "tutor_turn"
    | "simulation_updated"
    | "answer_submitted";
  actor: "student" | "teacher" | "system" | "agent";
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Assignment {
  id: string;
  title: string;
  teacher_view_mode: "light" | "review";
  workspace_template_id: string;
  share_code: string;
  expires_at?: string;
  created_at: string;
}

export interface CreateWorkspaceInput {
  title: string;
  source_asset_id?: string;
  problem_id?: string;
}

export interface TutorTurnInput {
  session_id: string;
  workspace_id: string;
  student_input: string;
  selected_node_ids: string[];
}

export interface RebuildSimulationInput {
  workspace_id: string;
  simulation_scene_id: string;
  parameter_updates: Array<{
    key: string;
    value: string | number;
  }>;
}

