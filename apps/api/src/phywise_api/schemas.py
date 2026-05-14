from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class PageRegion(BaseModel):
    id: str
    page: int
    label: str
    preview_key: str
    width: int
    height: int


class DiagramRegion(BaseModel):
    id: str
    page: int
    label: str
    preview_key: str
    x: float
    y: float
    w: float
    h: float
    diagram_type: Literal["force", "circuit", "optics", "generic"]


class ProviderTraceEntry(BaseModel):
    provider: Literal["manual_text", "paddleocr", "tencent_ocr", "hybrid"]
    status: Literal["used", "skipped", "unavailable", "fallback"]
    detail: str


class ConfirmationItem(BaseModel):
    id: str
    field: Literal["stem", "subquestion", "condition", "diagram"]
    label: str
    reason: str
    suggested_value: str | None = None


class SourceAsset(BaseModel):
    id: str
    kind: Literal["pdf", "image", "markdown", "latex", "photo", "other"]
    filename: str
    mime_type: str
    bytes: int
    object_key: str | None = None
    storage_key: str
    sha256: str | None = None
    page_count: int | None = None
    preview_pages: list[PageRegion] = Field(default_factory=list)
    source_provider: Literal["upload", "manual_text"] = "upload"
    created_at: str


class KnowledgeLink(BaseModel):
    id: str
    kind: Literal["concept", "formula", "problem_type", "misconception", "experiment"]
    key: str
    title: str
    grade_band: Literal["middle_school", "high_school", "cross_stage"]
    weight: float
    notes: str | None = None


class ProblemCondition(BaseModel):
    id: str
    label: str
    value: str
    unit: str | None = None
    source: Literal["ocr", "student", "teacher", "agent"]


class DiagramEntity(BaseModel):
    id: str
    kind: Literal[
        "point",
        "line",
        "body",
        "force",
        "circuit",
        "ray",
        "lens",
        "mirror",
        "axis",
        "label",
        "other",
    ]
    description: str
    confidence: float
    linked_node_id: str | None = None


class ProblemSubquestion(BaseModel):
    id: str
    prompt: str
    expected_output: Literal["numeric", "algebraic", "explanatory", "diagrammatic"]
    knowledge_keys: list[str] = Field(default_factory=list)


class ProblemParseResult(BaseModel):
    problem_id: str
    source_asset_id: str
    stem: str
    subquestions: list[ProblemSubquestion] = Field(default_factory=list)
    conditions: list[ProblemCondition] = Field(default_factory=list)
    diagram_entities: list[DiagramEntity] = Field(default_factory=list)
    knowledge_links: list[KnowledgeLink] = Field(default_factory=list)
    provider_trace: list[ProviderTraceEntry] = Field(default_factory=list)
    normalized_text: str | None = None
    page_regions: list[PageRegion] = Field(default_factory=list)
    diagram_regions: list[DiagramRegion] = Field(default_factory=list)
    confirmation_items: list[ConfirmationItem] = Field(default_factory=list)
    confidence: float
    needs_confirmation: bool
    warnings: list[str] = Field(default_factory=list)
    created_at: str | None = None


class ParseJob(BaseModel):
    id: str
    source_asset_id: str
    provider_strategy: Literal["manual_text", "paddleocr", "tencent_ocr", "hybrid"]
    status: Literal["queued", "processing", "completed", "failed"]
    progress: int
    error_code: str | None = None
    error_message: str | None = None
    result_problem_id: str | None = None
    created_at: str
    updated_at: str


class WhiteboardRect(BaseModel):
    x: float
    y: float
    w: float
    h: float
    rotation: float | None = None


class WhiteboardAnchor(BaseModel):
    id: str
    x: float
    y: float
    label: str | None = None


class WhiteboardEdge(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    from_node: str = Field(alias="from")
    to: str
    label: str | None = None


class WhiteboardNode(BaseModel):
    id: str
    kind: Literal[
        "source_image",
        "rich_block",
        "phy_canvas",
        "ai_annotation",
    ]
    rect: WhiteboardRect
    payload: dict[str, Any]
    anchors: list[WhiteboardAnchor] = Field(default_factory=list)
    layer: Literal["source", "student", "ai", "overlay"] = "student"
    z_index: int = 0
    locked: bool = False
    semantic_role: str | None = None
    source_refs: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class BoardPatch(BaseModel):
    upsert_nodes: list[WhiteboardNode] = Field(default_factory=list)
    remove_node_ids: list[str] = Field(default_factory=list)
    upsert_edges: list[WhiteboardEdge] = Field(default_factory=list)
    remove_edge_ids: list[str] = Field(default_factory=list)
    object_mutations: list[dict[str, Any]] = Field(default_factory=list)


class BoardSuggestion(BaseModel):
    id: str
    kind: Literal["diagram_rebuild", "force_completion", "equation_hint", "next_step", "label_fix"]
    target_object_refs: list[str] = Field(default_factory=list)
    patch: BoardPatch = Field(default_factory=BoardPatch)
    reason: str
    status: Literal["pending", "accepted", "rejected"]


class SimulationObject(BaseModel):
    id: str
    kind: Literal["body", "surface", "circuit_node", "lens", "mirror", "light_source"]
    label: str
    properties: dict[str, str | int | float | bool] = Field(default_factory=dict)


class SimulationParameter(BaseModel):
    key: str
    label: str
    value: str | int | float
    unit: str | None = None


class SimulationBinding(BaseModel):
    id: str
    source_node_id: str
    target_object_id: str
    property: str


class SimulationScene(BaseModel):
    id: str
    module: Literal["kinematics", "forces", "circuits", "geometric_optics"]
    objects: list[SimulationObject] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    parameters: list[SimulationParameter] = Field(default_factory=list)
    equations: list[str] = Field(default_factory=list)
    observables: list[str] = Field(default_factory=list)
    bindings: list[SimulationBinding] = Field(default_factory=list)
    snapshot_label: str


class ConceptMasteryState(BaseModel):
    knowledge_key: str
    status: Literal["unseen", "introduced", "practicing", "mastered", "at_risk"]
    evidence_count: int


class MasteryTrace(BaseModel):
    concept_states: list[ConceptMasteryState] = Field(default_factory=list)
    misconceptions: list[str] = Field(default_factory=list)
    updated_at: str


class WorkspaceDocument(BaseModel):
    id: str
    title: str
    source_asset_id: str | None = None
    problem_id: str | None = None
    whiteboard_nodes: list[WhiteboardNode] = Field(default_factory=list)
    whiteboard_edges: list[WhiteboardEdge] = Field(default_factory=list)
    viewport: dict[str, float]
    conversation_refs: dict[str, list[str]] = Field(default_factory=dict)
    simulation_bindings: list[SimulationBinding] = Field(default_factory=list)
    selection_state: dict[str, Any] = Field(default_factory=dict)
    mastery: MasteryTrace
    suggestions: list[BoardSuggestion] = Field(default_factory=list)
    updated_at: str | None = None
    revision_id: str | None = None


class TutorTurn(BaseModel):
    id: str
    session_id: str
    mode: Literal["ask", "hint", "check", "feedback", "reveal", "summary"]
    prompt: str
    hint: str | None = None
    check: str | None = None
    feedback: str | None = None
    reveal_state: Literal["locked", "available", "revealed"]
    suggested_actions: list[str] = Field(default_factory=list)
    linked_knowledge_keys: list[str] = Field(default_factory=list)
    created_at: str


class ReplayEvent(BaseModel):
    id: str
    workspace_id: str
    type: Literal[
        "upload",
        "parse",
        "node_added",
        "node_updated",
        "tutor_turn",
        "simulation_updated",
        "answer_submitted",
    ]
    actor: Literal["student", "teacher", "system", "agent"]
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class Assignment(BaseModel):
    id: str
    title: str
    teacher_view_mode: Literal["light", "review"]
    workspace_template_id: str
    share_code: str
    expires_at: str | None = None
    created_at: str


class CreateWorkspaceInput(BaseModel):
    title: str
    source_asset_id: str | None = None
    problem_id: str | None = None
    parse_overrides: "ParseOverrides | None" = None


class ParseOverrides(BaseModel):
    stem: str | None = None
    subquestions: list[ProblemSubquestion] = Field(default_factory=list)
    conditions: list[ProblemCondition] = Field(default_factory=list)


class CreateParseJobInput(BaseModel):
    source_asset_id: str
    provider_strategy: Literal["manual_text", "paddleocr", "tencent_ocr", "hybrid"] = "hybrid"


class AnalyzeSourceInput(BaseModel):
    source_asset_id: str | None = None


class AnalyzeBoardInput(BaseModel):
    selected_object_refs: list[str] = Field(default_factory=list)


class TutorTurnInput(BaseModel):
    session_id: str
    workspace_id: str
    student_input: str
    selected_object_refs: list[str] = Field(default_factory=list)


class RebuildSimulationInput(BaseModel):
    workspace_id: str
    simulation_scene_id: str
    parameter_updates: list[dict[str, str | int | float]] = Field(default_factory=list)


class AssignmentCreateInput(BaseModel):
    title: str
    workspace_template_id: str
    teacher_view_mode: Literal["light", "review"] = "light"


class UpdateWorkspaceInput(BaseModel):
    document: WorkspaceDocument


class WorkspaceRevision(BaseModel):
    id: str
    workspace_id: str
    created_at: str


CreateWorkspaceInput.model_rebuild()
