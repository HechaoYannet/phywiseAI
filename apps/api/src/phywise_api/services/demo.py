from phywise_api.schemas import (
    Assignment,
    ConfirmationItem,
    DiagramEntity,
    DiagramRegion,
    KnowledgeLink,
    MasteryTrace,
    PageRegion,
    ProblemCondition,
    ProblemParseResult,
    ProblemSubquestion,
    ProviderTraceEntry,
    ReplayEvent,
    SimulationBinding,
    SimulationObject,
    SimulationParameter,
    SimulationScene,
    SourceAsset,
    TutorTurn,
    WorkspaceDocument,
)

NOW = "2026-05-13T00:00:00.000Z"
DEMO_SCENE_XML = (
    '<phy-canvas scene-kind="force_analysis" version="1" width="360" height="240">'
    '<body id="body-main" x="128" y="74" w="92" h="62" rotation="0" label="物块" shape="block" />'
    '<surface id="surface-main" x="78" y="154" w="210" h="12" rotation="-18" label="斜面" angle="theta" surface-kind="plane" />'
    '<force id="force-normal" x="206" y="88" w="100" h="14" rotation="-108" label="N" role="normal" target="body-main" />'
    '<label id="label-angle" x="242" y="160" text="theta" />'
    "</phy-canvas>"
)


def demo_asset() -> SourceAsset:
    return SourceAsset(
        id="asset-demo-001",
        kind="image",
        filename="inclined-plane-problem.png",
        mime_type="image/png",
        bytes=348120,
        storage_key="demo/inclined-plane-problem.png",
        object_key="demo/inclined-plane-problem.png",
        sha256="demo-sha256",
        preview_pages=[],
        source_provider="upload",
        created_at=NOW,
    )


def demo_knowledge_links() -> list[KnowledgeLink]:
    return [
        KnowledgeLink(
            id="kk-force-analysis",
            kind="concept",
            key="force-analysis",
            title="受力分析",
            grade_band="cross_stage",
            weight=0.95,
        ),
        KnowledgeLink(
            id="kk-newton-second-law",
            kind="formula",
            key="newton-second-law",
            title="牛顿第二定律",
            grade_band="high_school",
            weight=0.92,
        ),
        KnowledgeLink(
            id="kk-misread-equilibrium",
            kind="misconception",
            key="misread-equilibrium",
            title="把静止直接等同于受力为零",
            grade_band="cross_stage",
            weight=0.88,
        ),
    ]


def demo_parse_result() -> ProblemParseResult:
    return ProblemParseResult(
        problem_id="problem-demo-001",
        source_asset_id="asset-demo-001",
        stem="质量为 m 的物块静止在倾角为 theta 的粗糙斜面上，求摩擦力大小并判断方向。",
        subquestions=[
            ProblemSubquestion(
                id="subq-1",
                prompt="画出受力图，并写出沿斜面方向的平衡关系。",
                expected_output="diagrammatic",
                knowledge_keys=["force-analysis", "newton-second-law"],
            ),
            ProblemSubquestion(
                id="subq-2",
                prompt="判断摩擦力方向并写出大小表达式。",
                expected_output="algebraic",
                knowledge_keys=["force-analysis", "newton-second-law"],
            ),
        ],
        conditions=[
            ProblemCondition(id="cond-1", label="状态", value="静止", source="ocr"),
            ProblemCondition(id="cond-2", label="质量", value="m", source="ocr"),
            ProblemCondition(id="cond-3", label="倾角", value="theta", source="ocr"),
        ],
        diagram_entities=[
            DiagramEntity(
                id="entity-1",
                kind="body",
                description="位于斜面上的方块",
                confidence=0.98,
                linked_node_id="diagram-node-1",
            )
        ],
        knowledge_links=demo_knowledge_links(),
        provider_trace=[
            ProviderTraceEntry(provider="manual_text", status="used", detail="demo fixture")
        ],
        normalized_text="质量为 m 的物块静止在倾角为 theta 的粗糙斜面上，求摩擦力大小并判断方向。",
        page_regions=[
            PageRegion(
                id="page-demo-1",
                page=1,
                label="示例页",
                preview_key="demo/inclined-plane-problem.png",
                width=1280,
                height=720,
            )
        ],
        diagram_regions=[
            DiagramRegion(
                id="diagram-demo-1",
                page=1,
                label="整页示意",
                preview_key="demo/inclined-plane-problem.png",
                x=0,
                y=0,
                w=1280,
                h=720,
                diagram_type="force",
            )
        ],
        confirmation_items=[
            ConfirmationItem(
                id="confirm-demo-1",
                field="stem",
                label="确认题干",
                reason="demo fixture",
                suggested_value="质量为 m 的物块静止在倾角为 theta 的粗糙斜面上。",
            )
        ],
        confidence=0.91,
        needs_confirmation=False,
        warnings=[],
        created_at=NOW,
    )


def demo_workspace() -> WorkspaceDocument:
    return WorkspaceDocument(
        id="workspace-demo-001",
        title="斜面静止问题工作台",
        source_asset_id="asset-demo-001",
        problem_id="problem-demo-001",
        whiteboard_nodes=[
            {
                "id": "source-node-1",
                "kind": "source_image",
                "rect": {"x": 40, "y": 40, "w": 300, "h": 220},
                "payload": {
                    "source_asset_id": "asset-demo-001",
                    "preview_key": "demo/inclined-plane-problem.png",
                    "alt": "斜面静止题图",
                    "caption": "原题图",
                },
                "anchors": [],
                "layer": "source",
                "z_index": 1,
                "semantic_role": "problem-source",
                "source_refs": ["asset-demo-001"],
            },
            {
                "id": "diagram-node-1",
                "kind": "phy_canvas",
                "rect": {"x": 460, "y": 220, "w": 360, "h": 240},
                "payload": {
                    "scene_kind": "force_analysis",
                    "scene_xml": DEMO_SCENE_XML,
                    "version": 1,
                    "bounds": {"width": 360, "height": 240},
                    "summary": "斜面静止受力图",
                },
                "anchors": [],
                "layer": "student",
                "z_index": 3,
                "semantic_role": "force-scene",
                "source_refs": ["asset-demo-001"],
            },
            {
                "id": "condition-node-1",
                "kind": "rich_block",
                "rect": {"x": 860, "y": 88, "w": 280, "h": 120},
                "payload": {
                    "title": "已知条件",
                    "content": "物块静止在粗糙斜面上\nm, theta, mu",
                    "content_format": "markdown_math",
                    "block_role": "condition",
                    "status": "checked",
                },
                "anchors": [],
                "layer": "student",
                "z_index": 4,
                "semantic_role": "known-condition",
                "source_refs": ["asset-demo-001"],
            },
            {
                "id": "formula-node-1",
                "kind": "rich_block",
                "rect": {"x": 860, "y": 244, "w": 320, "h": 150},
                "payload": {
                    "title": "推导",
                    "content": r"沿斜面方向：`\sum F_{\parallel}=0`",
                    "content_format": "markdown_math",
                    "block_role": "derivation",
                    "status": "draft",
                },
                "anchors": [],
                "layer": "student",
                "z_index": 4,
                "semantic_role": "derivation",
                "source_refs": ["asset-demo-001"],
            },
        ],
        whiteboard_edges=[],
        viewport={"x": 0, "y": 0, "zoom": 1},
        conversation_refs={"turn_ids": ["turn-demo-001"]},
        simulation_bindings=[
            SimulationBinding(
                id="binding-1",
                source_node_id="diagram-node-1",
                target_object_id="sim-object-1",
                property="tilt_angle",
            )
        ],
        selection_state={
            "selected_object_refs": ["node:formula-node-1"],
            "focused_subquestion_id": "subq-1",
            "active_tool": "select",
        },
        mastery=MasteryTrace(
            concept_states=[
                {
                    "knowledge_key": "force-analysis",
                    "status": "introduced",
                    "evidence_count": 1,
                }
            ],
            misconceptions=["misread-equilibrium"],
            updated_at=NOW,
        ),
        suggestions=[
            {
                "id": "suggestion-demo-1",
                "kind": "force_completion",
                "target_object_refs": ["node:diagram-node-1#child:body-main"],
                "patch": {
                    "upsert_nodes": [],
                    "remove_node_ids": [],
                    "upsert_edges": [],
                    "remove_edge_ids": [],
                    "object_mutations": [
                        {
                            "op": "phy_canvas_upsert_child",
                            "object_ref": "node:diagram-node-1",
                            "child_id": "force-gravity",
                            "child_xml": '<force id="force-gravity" x="166" y="74" w="102" h="14" rotation="90" label="G" magnitude="mg" role="gravity" target="body-main" />',
                        }
                    ],
                },
                "reason": "题目是静止斜面受力分析，通常先补全重力、支持力和摩擦力方向判断。",
                "status": "pending",
            }
        ],
        updated_at=NOW,
        revision_id="revision-demo-001",
    )


def demo_tutor_turn() -> TutorTurn:
    return TutorTurn(
        id="turn-demo-001",
        session_id="session-demo-001",
        mode="ask",
        prompt="如果物块保持静止，沿斜面方向的合力应该满足什么条件？",
        hint="先判断是否平衡，再决定要不要列牛顿第二定律。",
        check="你列出的沿斜面方向受力有哪些？",
        feedback="先受力分析，再判断摩擦力方向，这样更稳。",
        reveal_state="locked",
        suggested_actions=["补画重力分解", "标注摩擦力方向", "写平衡式"],
        linked_knowledge_keys=["force-analysis", "newton-second-law"],
        created_at=NOW,
    )


def demo_simulation_scene() -> SimulationScene:
    return SimulationScene(
        id="scene-demo-001",
        module="forces",
        objects=[
            SimulationObject(
                id="sim-object-1",
                kind="body",
                label="斜面上的物块",
                properties={"mass": "m", "angle_deg": 30, "static_state": True},
            )
        ],
        constraints=["沿斜面方向合力为 0", "垂直斜面方向合力为 0"],
        parameters=[
            SimulationParameter(key="mass", label="质量", value="m"),
            SimulationParameter(key="theta", label="倾角", value=30, unit="deg"),
            SimulationParameter(key="mu", label="动摩擦因数", value="mu"),
        ],
        equations=["N = mg cos(theta)", "f = mg sin(theta)"],
        observables=["摩擦力方向", "摩擦力大小", "支持力大小"],
        bindings=[
            SimulationBinding(
                id="binding-1",
                source_node_id="diagram-node-1",
                target_object_id="sim-object-1",
                property="angle_deg",
            )
        ],
        snapshot_label="静止斜面示意",
    )


def demo_assignment() -> Assignment:
    return Assignment(
        id="assignment-demo-001",
        title="斜面静止受力分析",
        teacher_view_mode="light",
        workspace_template_id="workspace-demo-001",
        share_code="PHYWISE-DEMO",
        created_at=NOW,
    )


def demo_replay_events() -> list[ReplayEvent]:
    return [
        ReplayEvent(
            id="replay-1",
            workspace_id="workspace-demo-001",
            type="upload",
            actor="student",
            payload={"source_asset_id": "asset-demo-001"},
            created_at=NOW,
        ),
        ReplayEvent(
            id="replay-2",
            workspace_id="workspace-demo-001",
            type="tutor_turn",
            actor="agent",
            payload={"turn_id": "turn-demo-001", "mode": "ask"},
            created_at=NOW,
        ),
    ]
