import type {
  Assignment,
  KnowledgeLink,
  ProblemParseResult,
  SimulationScene,
  SourceAsset,
  TutorTurn,
  WorkspaceDocument
} from "@phywise/contracts";

const NOW = "2026-05-13T00:00:00.000Z";

export const foundationalKnowledgeLinks: KnowledgeLink[] = [
  {
    id: "kk-force-analysis",
    kind: "concept",
    key: "force-analysis",
    title: "受力分析",
    grade_band: "cross_stage",
    weight: 0.95
  },
  {
    id: "kk-newton-second-law",
    kind: "formula",
    key: "newton-second-law",
    title: "牛顿第二定律",
    grade_band: "high_school",
    weight: 0.92
  },
  {
    id: "kk-misread-equilibrium",
    kind: "misconception",
    key: "misread-equilibrium",
    title: "把静止直接等同于受力为零",
    grade_band: "cross_stage",
    weight: 0.88
  }
];

export function createDemoSourceAsset(): SourceAsset {
  return {
    id: "asset-demo-001",
    kind: "image",
    filename: "inclined-plane-problem.png",
    mime_type: "image/png",
    bytes: 348120,
    object_key: "demo/inclined-plane-problem.png",
    created_at: NOW
  };
}

export function createDemoProblemParseResult(): ProblemParseResult {
  return {
    problem_id: "problem-demo-001",
    source_asset_id: "asset-demo-001",
    stem:
      "质量为 m 的物块静止在倾角为 theta 的粗糙斜面上。已知斜面对物块的动摩擦因数为 mu，求物块所受摩擦力的大小，并判断其方向。",
    subquestions: [
      {
        id: "subq-1",
        prompt: "先画出物块受力示意图，并写出沿斜面方向的受力关系。",
        expected_output: "diagrammatic",
        knowledge_keys: ["force-analysis", "newton-second-law"]
      },
      {
        id: "subq-2",
        prompt: "判断摩擦力方向并给出摩擦力大小表达式。",
        expected_output: "algebraic",
        knowledge_keys: ["force-analysis", "newton-second-law"]
      }
    ],
    conditions: [
      {
        id: "cond-1",
        label: "物体状态",
        value: "静止",
        source: "ocr"
      },
      {
        id: "cond-2",
        label: "质量",
        value: "m",
        source: "ocr"
      },
      {
        id: "cond-3",
        label: "倾角",
        value: "theta",
        source: "ocr"
      },
      {
        id: "cond-4",
        label: "动摩擦因数",
        value: "mu",
        source: "ocr"
      }
    ],
    diagram_entities: [
      {
        id: "entity-1",
        kind: "body",
        description: "位于斜面上的方块",
        confidence: 0.98,
        linked_node_id: "body-1"
      },
      {
        id: "entity-2",
        kind: "line",
        description: "倾斜平面",
        confidence: 0.96
      }
    ],
    knowledge_links: foundationalKnowledgeLinks,
    confidence: 0.91,
    needs_confirmation: false,
    warnings: []
  };
}

export function createDemoWorkspace(): WorkspaceDocument {
  return {
    id: "workspace-demo-001",
    title: "斜面静止问题工作台",
    source_asset_id: "asset-demo-001",
    problem_id: "problem-demo-001",
    whiteboard_nodes: [
      {
        id: "cond-node-1",
        kind: "condition_card",
        rect: { x: 36, y: 32, w: 220, h: 110 },
        payload: {
          label: "已知状态",
          value: "物块静止在粗糙斜面上",
          source: "ocr",
          confidence: 0.93
        }
      },
      {
        id: "eq-node-1",
        kind: "equation_block",
        rect: { x: 320, y: 180, w: 280, h: 140 },
        payload: {
          latex: "\\sum F_{\\parallel}=0",
          markdown: "先沿斜面方向列平衡关系。",
          status: "draft"
        }
      },
      {
        id: "hint-node-1",
        kind: "hint_card",
        rect: { x: 640, y: 48, w: 260, h: 120 },
        payload: {
          title: "引导",
          hint: "先判断物块有没有沿斜面向下滑动的趋势，再决定摩擦力方向。",
          level: 1
        }
      },
      {
        id: "sim-node-1",
        kind: "simulation_object",
        rect: { x: 640, y: 240, w: 260, h: 180 },
        payload: {
          simulation_object_id: "sim-object-1",
          title: "斜面示意",
          module: "forces"
        }
      }
    ],
    whiteboard_edges: [
      { id: "edge-1", from: "cond-node-1", to: "eq-node-1", label: "已知条件" }
    ],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    },
    conversation_refs: {
      turn_ids: ["turn-demo-001"]
    },
    simulation_bindings: [
      {
        id: "binding-1",
        source_node_id: "sim-node-1",
        target_object_id: "sim-object-1",
        property: "tilt_angle"
      }
    ],
    selection_state: {
      selected_node_ids: ["eq-node-1"],
      focused_subquestion_id: "subq-1"
    },
    mastery: {
      concept_states: [
        {
          knowledge_key: "force-analysis",
          status: "introduced",
          evidence_count: 1
        },
        {
          knowledge_key: "newton-second-law",
          status: "practicing",
          evidence_count: 2
        }
      ],
      misconceptions: ["misread-equilibrium"],
      updated_at: NOW
    }
  };
}

export function createDemoSimulationScene(): SimulationScene {
  return {
    id: "scene-demo-001",
    module: "forces",
    objects: [
      {
        id: "sim-object-1",
        kind: "body",
        label: "斜面上的物块",
        properties: {
          mass: "m",
          angle_deg: 30,
          static_state: true
        }
      }
    ],
    constraints: ["沿斜面方向合力为 0", "垂直斜面方向合力为 0"],
    parameters: [
      { key: "mass", label: "质量", value: "m" },
      { key: "theta", label: "倾角", value: 30, unit: "deg" },
      { key: "mu", label: "动摩擦因数", value: "mu" }
    ],
    equations: ["N = mg cos(theta)", "f = mg sin(theta)"],
    observables: ["摩擦力方向", "摩擦力大小", "支持力大小"],
    bindings: [
      {
        id: "binding-1",
        source_node_id: "sim-node-1",
        target_object_id: "sim-object-1",
        property: "angle_deg"
      }
    ],
    snapshot_label: "静止斜面示意"
  };
}

export function createDemoTutorTurn(): TutorTurn {
  return {
    id: "turn-demo-001",
    session_id: "session-demo-001",
    mode: "ask",
    prompt: "如果物块保持静止，沿斜面方向的合力应该满足什么条件？",
    hint: "先不要急着代公式，先判断平衡关系。",
    check: "你写出的沿斜面方向受力有哪些？",
    feedback: "正确方向是先做受力分析，再判断摩擦力方向。",
    reveal_state: "locked",
    suggested_actions: ["补画重力分解", "写出沿斜面方向平衡式", "标注摩擦力假设方向"],
    linked_knowledge_keys: ["force-analysis", "newton-second-law"],
    created_at: NOW
  };
}

export function createDemoAssignment(): Assignment {
  return {
    id: "assignment-demo-001",
    title: "斜面静止受力分析",
    teacher_view_mode: "light",
    workspace_template_id: "workspace-demo-001",
    share_code: "PHYWISE-DEMO",
    created_at: NOW
  };
}

export function isLowConfidenceParse(confidence: number): boolean {
  return confidence < 0.8;
}

