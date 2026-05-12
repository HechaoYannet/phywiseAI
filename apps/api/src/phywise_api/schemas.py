from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class SourceAsset(BaseModel):
    id: str
    kind: Literal["pdf", "image", "markdown", "latex", "photo", "other"]
    filename: str
    mime_type: str
    bytes: int
    object_key: str
    page_count: int | None = None
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
    confidence: float
    needs_confirmation: bool
    warnings: list[str] = Field(default_factory=list)


class WhiteboardRect(BaseModel):
    x: float
    y: float
    w: float
    h: float
    rotation: float | None = None


class WhiteboardEdge(BaseModel):
    id: str
    from_node: str = Field(alias="from")
    to: str
    label: str | None = None


class WhiteboardNode(BaseModel):
    id: str
    kind: str
    rect: WhiteboardRect
    payload: dict[str, Any]
    locked: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


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


class TutorTurnInput(BaseModel):
    session_id: str
    workspace_id: str
    student_input: str
    selected_node_ids: list[str] = Field(default_factory=list)


class RebuildSimulationInput(BaseModel):
    workspace_id: str
    simulation_scene_id: str
    parameter_updates: list[dict[str, str | int | float]] = Field(default_factory=list)


class AssignmentCreateInput(BaseModel):
    title: str
    workspace_template_id: str
    teacher_view_mode: Literal["light", "review"] = "light"

