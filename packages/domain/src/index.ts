import type {
  Assignment,
  BoardSuggestion,
  KnowledgeLink,
  ProblemParseResult,
  SimulationScene,
  SourceAsset,
  TutorTurn,
  WorkspaceDocument
} from "@phywise/contracts";

const NOW = "2026-05-13T00:00:00.000Z";
const DEMO_SCENE_XML =
  '<phy-canvas scene-kind="force_analysis" version="1" width="360" height="240">' +
  '<body id="body-main" x="128" y="74" w="92" h="62" rotation="0" label="物块" shape="block" />' +
  '<surface id="surface-main" x="78" y="154" w="210" h="12" rotation="-18" label="斜面" angle="theta" surface-kind="plane" />' +
  '<force id="force-normal" x="206" y="88" w="100" h="14" rotation="-108" label="N" role="normal" target="body-main" />' +
  '<label id="label-angle" x="242" y="160" text="theta" />' +
  "</phy-canvas>";

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
    storage_key: "demo/inclined-plane-problem.png",
    object_key: "demo/inclined-plane-problem.png",
    sha256: "demo-sha256",
    preview_pages: [],
    source_provider: "upload",
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
        linked_node_id: "diagram-node-1"
      },
      {
        id: "entity-2",
        kind: "line",
        description: "倾斜平面",
        confidence: 0.96
      }
    ],
    knowledge_links: foundationalKnowledgeLinks,
    provider_trace: [
      {
        provider: "manual_text",
        status: "used",
        detail: "demo fixture"
      }
    ],
    normalized_text:
      "质量为 m 的物块静止在倾角为 theta 的粗糙斜面上。已知斜面对物块的动摩擦因数为 mu，求物块所受摩擦力的大小，并判断其方向。",
    page_regions: [],
    diagram_regions: [],
    confirmation_items: [],
    confidence: 0.91,
    needs_confirmation: false,
    warnings: [],
    created_at: NOW
  };
}

export function createDemoSuggestions(): BoardSuggestion[] {
  return [
    {
      id: "suggestion-demo-1",
      kind: "force_completion",
      target_object_refs: ["node:diagram-node-1#child:body-main"],
      patch: {
        upsert_nodes: [],
        remove_node_ids: [],
        upsert_edges: [],
        remove_edge_ids: [],
        object_mutations: [
          {
            op: "phy_canvas_upsert_child",
            object_ref: "node:diagram-node-1",
            child_id: "force-gravity",
            child_xml:
              '<force id="force-gravity" x="166" y="74" w="102" h="14" rotation="90" label="G" magnitude="mg" role="gravity" target="body-main" />'
          }
        ]
      },
      reason: "题目是静止斜面受力分析，通常先补全重力、支持力和摩擦力方向判断。",
      status: "pending"
    }
  ];
}

export function createDemoWorkspace(): WorkspaceDocument {
  return {
    id: "workspace-demo-001",
    title: "斜面静止问题工作台",
    source_asset_id: "asset-demo-001",
    problem_id: "problem-demo-001",
    whiteboard_nodes: [
      {
        id: "source-node-1",
        kind: "source_image",
        rect: { x: 40, y: 40, w: 300, h: 220 },
        payload: {
          source_asset_id: "asset-demo-001",
          preview_key: "demo/inclined-plane-problem.png",
          alt: "斜面静止题图",
          caption: "原题图"
        },
        anchors: [],
        layer: "source",
        z_index: 1,
        locked: false,
        semantic_role: "problem-source",
        source_refs: ["asset-demo-001"]
      },
      {
        id: "diagram-node-1",
        kind: "phy_canvas",
        rect: { x: 460, y: 220, w: 360, h: 240 },
        payload: {
          scene_kind: "force_analysis",
          scene_xml: DEMO_SCENE_XML,
          version: 1,
          bounds: { width: 360, height: 240 },
          summary: "斜面静止受力图"
        },
        anchors: [],
        layer: "student",
        z_index: 3,
        locked: false,
        semantic_role: "force-scene",
        source_refs: ["asset-demo-001"]
      },
      {
        id: "condition-node-1",
        kind: "rich_block",
        rect: { x: 860, y: 88, w: 280, h: 120 },
        payload: {
          title: "已知条件",
          content: "静止在粗糙斜面上\nm, theta, mu",
          content_format: "markdown_math",
          block_role: "condition",
          status: "checked"
        },
        anchors: [],
        layer: "student",
        z_index: 4,
        locked: false,
        semantic_role: "known-condition",
        source_refs: ["asset-demo-001"]
      },
      {
        id: "formula-node-1",
        kind: "rich_block",
        rect: { x: 860, y: 244, w: 320, h: 150 },
        payload: {
          title: "推导",
          content: "沿斜面方向：`\\\\sum F_{\\\\parallel}=0`",
          content_format: "markdown_math",
          block_role: "derivation",
          status: "draft"
        },
        anchors: [],
        layer: "student",
        z_index: 4,
        locked: false,
        semantic_role: "derivation",
        source_refs: ["asset-demo-001"]
      }
    ],
    whiteboard_edges: [],
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
        source_node_id: "diagram-node-1",
        target_object_id: "sim-object-1",
        property: "tilt_angle"
      }
    ],
    selection_state: {
      selected_object_refs: ["node:formula-node-1"],
      focused_subquestion_id: "subq-1",
      active_tool: "select"
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
    },
    suggestions: createDemoSuggestions(),
    updated_at: NOW,
    revision_id: "revision-demo-001"
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
        source_node_id: "diagram-node-1",
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
