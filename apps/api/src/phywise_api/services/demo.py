from phywise_api.schemas import (
    Assignment,
    DiagramEntity,
    KnowledgeLink,
    MasteryTrace,
    ProblemCondition,
    ProblemParseResult,
    ProblemSubquestion,
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


def demo_asset() -> SourceAsset:
    return SourceAsset(
        id="asset-demo-001",
        kind="image",
        filename="inclined-plane-problem.png",
        mime_type="image/png",
        bytes=348120,
        object_key="demo/inclined-plane-problem.png",
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
                linked_node_id="body-1",
            )
        ],
        knowledge_links=demo_knowledge_links(),
        confidence=0.91,
        needs_confirmation=False,
        warnings=[],
    )


def demo_workspace() -> WorkspaceDocument:
    return WorkspaceDocument(
        id="workspace-demo-001",
        title="斜面静止问题工作台",
        source_asset_id="asset-demo-001",
        problem_id="problem-demo-001",
        whiteboard_nodes=[
            {
                "id": "cond-node-1",
                "kind": "condition_card",
                "rect": {"x": 36, "y": 32, "w": 220, "h": 110},
                "payload": {
                    "label": "已知状态",
                    "value": "物块静止在粗糙斜面上",
                    "source": "ocr",
                    "confidence": 0.93,
                },
            },
            {
                "id": "eq-node-1",
                "kind": "equation_block",
                "rect": {"x": 320, "y": 180, "w": 280, "h": 140},
                "payload": {
                    "latex": r"\sum F_{\parallel}=0",
                    "markdown": "先沿斜面方向列平衡关系。",
                    "status": "draft",
                },
            },
        ],
        whiteboard_edges=[
            {
                "id": "edge-1",
                "from": "cond-node-1",
                "to": "eq-node-1",
                "label": "已知条件",
            }
        ],
        viewport={"x": 0, "y": 0, "zoom": 1},
        conversation_refs={"turn_ids": ["turn-demo-001"]},
        simulation_bindings=[
            SimulationBinding(
                id="binding-1",
                source_node_id="sim-node-1",
                target_object_id="sim-object-1",
                property="tilt_angle",
            )
        ],
        selection_state={
            "selected_node_ids": ["eq-node-1"],
            "focused_subquestion_id": "subq-1",
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
                source_node_id="sim-node-1",
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

