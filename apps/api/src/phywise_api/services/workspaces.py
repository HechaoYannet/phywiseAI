from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from phywise_api.models import ProblemRecord, SourceAssetRecord, WorkspaceRecord, WorkspaceRevisionRecord
from phywise_api.schemas import (
    AnalyzeBoardInput,
    BoardPatch,
    BoardSuggestion,
    CreateWorkspaceInput,
    MasteryTrace,
    ParseOverrides,
    ProblemParseResult,
    UpdateWorkspaceInput,
    WhiteboardEdge,
    WhiteboardNode,
    WorkspaceDocument,
    WorkspaceRevision,
)
from phywise_api.services.common import make_id, now_iso
from phywise_api.services.parsing import image_dimensions, parse_asset_to_problem
from phywise_api.storage import storage


def apply_parse_overrides(parse_result: ProblemParseResult, overrides: ParseOverrides | None) -> ProblemParseResult:
    if overrides is None:
        return parse_result

    payload = parse_result.model_dump(mode="json")
    if overrides.stem:
        payload["stem"] = overrides.stem
    if overrides.subquestions:
        payload["subquestions"] = [item.model_dump(mode="json") for item in overrides.subquestions]
    if overrides.conditions:
        payload["conditions"] = [item.model_dump(mode="json") for item in overrides.conditions]
    payload["needs_confirmation"] = False
    payload["confirmation_items"] = []
    payload["warnings"] = []
    return ProblemParseResult.model_validate(payload)


def _node(
    *,
    node_id: str,
    kind: str,
    rect: dict[str, float],
    payload: dict,
    anchors: list[dict] | None = None,
    layer: str = "student",
    z_index: int = 1,
    locked: bool = False,
    semantic_role: str | None = None,
    source_refs: list[str] | None = None,
    metadata: dict | None = None,
) -> WhiteboardNode:
    return WhiteboardNode.model_validate(
        {
            "id": node_id,
            "kind": kind,
            "rect": rect,
            "payload": payload,
            "anchors": anchors or [],
            "layer": layer,
            "z_index": z_index,
            "locked": locked,
            "semantic_role": semantic_role,
            "source_refs": source_refs or [],
            "metadata": metadata or {},
        }
    )


def _clone_document(document: WorkspaceDocument) -> WorkspaceDocument:
    return WorkspaceDocument.model_validate(document.model_dump(mode="json", by_alias=True))


def _sorted_nodes(nodes: Iterable[WhiteboardNode]) -> list[WhiteboardNode]:
    return sorted(nodes, key=lambda item: (item.z_index, item.rect.y, item.rect.x, item.id))


def _documents_equal(left: WorkspaceDocument, right: WorkspaceDocument) -> bool:
    return left.model_dump(mode="json", by_alias=True, exclude={"updated_at", "revision_id"}) == right.model_dump(
        mode="json", by_alias=True, exclude={"updated_at", "revision_id"}
    )


def build_blank_workspace_document(input_data: CreateWorkspaceInput) -> WorkspaceDocument:
    now = now_iso()
    return WorkspaceDocument(
        id=make_id("workspace"),
        title=input_data.title,
        source_asset_id=input_data.source_asset_id,
        problem_id=input_data.problem_id,
        whiteboard_nodes=[],
        whiteboard_edges=[],
        viewport={"x": 0, "y": 0, "zoom": 1},
        conversation_refs={"turn_ids": []},
        simulation_bindings=[],
        selection_state={"selected_node_ids": [], "active_tool": "select"},
        mastery=MasteryTrace(concept_states=[], misconceptions=[], updated_at=now),
        suggestions=[],
        updated_at=now,
        revision_id=None,
    )


def _append_source_nodes_from_asset(document: WorkspaceDocument, asset: SourceAssetRecord) -> WorkspaceDocument:
    next_document = _clone_document(document)
    source_refs = [asset.id]

    if asset.kind in {"markdown", "latex", "other"}:
        text = storage.read_text(asset.storage_key).strip()
        next_document.whiteboard_nodes.append(
            _node(
                node_id=make_id("source"),
                kind="free_text",
                rect={"x": 80, "y": 80, "w": 420, "h": 220},
                payload={"text": text or asset.filename, "markdown": text or asset.filename},
                layer="source",
                z_index=1,
                semantic_role="problem-source",
                source_refs=source_refs,
            )
        )
        next_document.whiteboard_nodes = _sorted_nodes(next_document.whiteboard_nodes)
        next_document.source_asset_id = asset.id
        return next_document

    if asset.kind in {"image", "photo"}:
        width, height = image_dimensions(asset.storage_key)
        next_document.whiteboard_nodes.append(
            _node(
                node_id=make_id("source"),
                kind="source_image",
                rect={"x": 80, "y": 80, "w": 360, "h": 260},
                payload={
                    "source_asset_id": asset.id,
                    "preview_key": asset.storage_key,
                    "alt": asset.filename,
                    "width": width,
                    "height": height,
                    "caption": "导入题图",
                },
                layer="source",
                z_index=1,
                semantic_role="problem-source",
                source_refs=source_refs,
            )
        )
        next_document.whiteboard_nodes = _sorted_nodes(next_document.whiteboard_nodes)
        next_document.source_asset_id = asset.id
        return next_document

    preview_pages = asset.preview_pages or []
    for index, page in enumerate(preview_pages[:3], start=1):
        next_document.whiteboard_nodes.append(
            _node(
                node_id=make_id(f"source{index}"),
                kind="source_image",
                rect={"x": 80 + (index - 1) * 300, "y": 80, "w": 280, "h": 220},
                payload={
                    "source_asset_id": asset.id,
                    "preview_key": page["preview_key"],
                    "alt": page["label"],
                    "page": page["page"],
                    "width": page["width"],
                    "height": page["height"],
                    "caption": page["label"],
                },
                layer="source",
                z_index=1,
                semantic_role="problem-source",
                source_refs=source_refs,
            )
        )
    next_document.whiteboard_nodes = _sorted_nodes(next_document.whiteboard_nodes)
    next_document.source_asset_id = asset.id
    return next_document


def _apply_parse_context(document: WorkspaceDocument, parse_result: ProblemParseResult) -> WorkspaceDocument:
    next_document = _clone_document(document)
    source_refs = [parse_result.source_asset_id]
    if not any(node.semantic_role == "source-summary" for node in next_document.whiteboard_nodes):
        next_document.whiteboard_nodes.append(
            _node(
                node_id=make_id("summary"),
                kind="free_text",
                rect={"x": 80, "y": 380, "w": 420, "h": 200},
                payload={"text": parse_result.stem, "markdown": parse_result.stem},
                layer="source",
                z_index=1,
                semantic_role="source-summary",
                source_refs=source_refs,
            )
        )
    next_document.whiteboard_nodes = _sorted_nodes(next_document.whiteboard_nodes)
    next_document.problem_id = parse_result.problem_id
    next_document.source_asset_id = parse_result.source_asset_id
    next_document.selection_state["focused_subquestion_id"] = (
        parse_result.subquestions[0].id if parse_result.subquestions else None
    )
    next_document.mastery = MasteryTrace(
        concept_states=[
            {
                "knowledge_key": link.key,
                "status": "introduced",
                "evidence_count": 1,
            }
            for link in parse_result.knowledge_links
        ],
        misconceptions=[],
        updated_at=now_iso(),
    )
    return next_document


def build_workspace_document(
    input_data: CreateWorkspaceInput,
    parse_result: ProblemParseResult | None = None,
    source_asset: SourceAssetRecord | None = None,
) -> WorkspaceDocument:
    document = build_blank_workspace_document(input_data)
    if source_asset is not None:
        document = _append_source_nodes_from_asset(document, source_asset)
    if parse_result is not None:
        document = _apply_parse_context(document, parse_result)
        document.suggestions = generate_source_suggestions(document, parse_result)
    return document


def _workspace_bounds(document: WorkspaceDocument) -> tuple[float, float]:
    if not document.whiteboard_nodes:
        return (80, 80)
    max_x = max(node.rect.x + node.rect.w for node in document.whiteboard_nodes)
    max_y = max(node.rect.y + node.rect.h for node in document.whiteboard_nodes)
    return (max_x, max_y)


def _upsert_patch_nodes(*nodes: WhiteboardNode) -> BoardPatch:
    return BoardPatch(upsert_nodes=list(nodes), remove_node_ids=[], upsert_edges=[], remove_edge_ids=[])


def generate_source_suggestions(document: WorkspaceDocument, parse_result: ProblemParseResult) -> list[BoardSuggestion]:
    _, max_y = _workspace_bounds(document)
    source_refs = [parse_result.source_asset_id]
    suggestions: list[BoardSuggestion] = []

    if parse_result.conditions:
        condition_nodes = [
            _node(
                node_id=make_id("condition"),
                kind="condition_card",
                rect={"x": 560 + (index % 2) * 300, "y": max_y + 40 + (index // 2) * 150, "w": 260, "h": 120},
                payload={
                    "label": condition.label,
                    "value": condition.value,
                    "source": condition.source,
                    "confidence": parse_result.confidence,
                },
                layer="ai",
                z_index=3,
                semantic_role="known-condition",
                source_refs=source_refs,
            )
            for index, condition in enumerate(parse_result.conditions)
        ]
        suggestions.append(
            BoardSuggestion(
                id=make_id("suggestion"),
                kind="next_step",
                target_node_ids=[],
                patch=_upsert_patch_nodes(*condition_nodes),
                reason="已从题干抽出已知条件，接受后会生成可编辑条件卡。",
                status="pending",
            )
        )

    if any("force-analysis" == link.key for link in parse_result.knowledge_links):
        body_node_id = make_id("body")
        diagram_nodes = [
            _node(
                node_id=body_node_id,
                kind="physics_body",
                rect={"x": 560, "y": max_y + 60, "w": 120, "h": 82},
                payload={"label": "物块", "body_shape": "block", "notes": "候选受力主体"},
                anchors=[{"id": "center", "x": 0.5, "y": 0.5, "label": "中心"}],
                layer="ai",
                z_index=4,
                semantic_role="main-body",
                source_refs=source_refs,
            ),
            _node(
                node_id=make_id("surface"),
                kind="surface_line",
                rect={"x": 500, "y": max_y + 180, "w": 240, "h": 14, "rotation": -18},
                payload={"label": "斜面", "angle_text": "theta", "surface_kind": "plane"},
                layer="ai",
                z_index=3,
                semantic_role="inclined-plane",
                source_refs=source_refs,
            ),
            _node(
                node_id=make_id("force"),
                kind="force_arrow",
                rect={"x": 620, "y": max_y + 76, "w": 130, "h": 18, "rotation": 90},
                payload={"label": "G", "magnitude_text": "mg", "direction_deg": 90},
                anchors=[{"id": "base", "x": 0, "y": 0.5}, {"id": "tip", "x": 1, "y": 0.5}],
                layer="ai",
                z_index=5,
                semantic_role="gravity",
                source_refs=source_refs,
            ),
            _node(
                node_id=make_id("force"),
                kind="force_arrow",
                rect={"x": 642, "y": max_y + 126, "w": 120, "h": 18, "rotation": -108},
                payload={"label": "N", "direction_deg": -108, "target_node_id": body_node_id},
                anchors=[{"id": "base", "x": 0, "y": 0.5}, {"id": "tip", "x": 1, "y": 0.5}],
                layer="ai",
                z_index=5,
                semantic_role="normal",
                source_refs=source_refs,
            ),
            _node(
                node_id=make_id("force"),
                kind="force_arrow",
                rect={"x": 512, "y": max_y + 100, "w": 132, "h": 18, "rotation": 162},
                payload={"label": "f?", "direction_deg": 162, "target_node_id": body_node_id, "notes": "摩擦力方向待确认"},
                anchors=[{"id": "base", "x": 0, "y": 0.5}, {"id": "tip", "x": 1, "y": 0.5}],
                layer="ai",
                z_index=5,
                semantic_role="friction",
                source_refs=source_refs,
            ),
        ]
        suggestions.append(
            BoardSuggestion(
                id=make_id("suggestion"),
                kind="diagram_rebuild",
                target_node_ids=[],
                patch=_upsert_patch_nodes(*diagram_nodes),
                reason="根据题干重建了一版斜面受力图候选，接受后可继续拖拽和修改。",
                status="pending",
            )
        )

    if parse_result.subquestions:
        formula_node = _node(
            node_id=make_id("formula"),
            kind="formula_block",
            rect={"x": 860, "y": max_y + 60, "w": 320, "h": 150},
            payload={
                "latex": r"\sum F_{\parallel}=0",
                "explanation": parse_result.subquestions[0].prompt,
                "status": "draft",
            },
            layer="ai",
            z_index=4,
            semantic_role="derivation",
            source_refs=source_refs,
        )
        suggestions.append(
            BoardSuggestion(
                id=make_id("suggestion"),
                kind="equation_hint",
                target_node_ids=[],
                patch=_upsert_patch_nodes(formula_node),
                reason="题目含有静止或平衡信息，建议先补出沿斜面方向的平衡式。",
                status="pending",
            )
        )

    return suggestions


def _node_text(node: WhiteboardNode) -> str:
    text_parts = []
    for key in ("text", "markdown", "label", "value", "latex", "explanation", "notes", "caption", "title"):
        value = node.payload.get(key)
        if isinstance(value, str):
            text_parts.append(value)
    if node.semantic_role:
        text_parts.append(node.semantic_role)
    return " ".join(text_parts)


def _is_static_board(document: WorkspaceDocument) -> bool:
    combined = " ".join(_node_text(node) for node in document.whiteboard_nodes)
    return any(token in combined for token in ("静止", "平衡", "合力为0", "ΣF", "sum f"))


def _has_force_role(document: WorkspaceDocument, role: str) -> bool:
    for node in document.whiteboard_nodes:
        if node.kind != "force_arrow":
            continue
        if node.semantic_role == role:
            return True
        label = str(node.payload.get("label", "")).lower()
        if role == "gravity" and label in {"g", "mg", "重力"}:
            return True
        if role == "normal" and label in {"n", "fn", "支持力", "法向力"}:
            return True
        if role == "friction" and label in {"f", "f?", "摩擦力"}:
            return True
    return False


def _has_formula(document: WorkspaceDocument) -> bool:
    return any(node.kind == "formula_block" for node in document.whiteboard_nodes)


def _has_decomposition_formula(document: WorkspaceDocument) -> bool:
    formula_text = " ".join(_node_text(node) for node in document.whiteboard_nodes if node.kind == "formula_block")
    return any(token in formula_text for token in ("sin", "cos", "parallel", "垂直", "分解"))


def _pending_signatures(document: WorkspaceDocument) -> set[str]:
    return {f"{item.kind}:{','.join(sorted(item.target_node_ids))}:{item.reason}" for item in document.suggestions if item.status == "pending"}


def generate_board_suggestions(document: WorkspaceDocument, selected_node_ids: list[str] | None = None) -> list[BoardSuggestion]:
    selected_node_ids = selected_node_ids or []
    selected_set = set(selected_node_ids)
    body_nodes = [node for node in document.whiteboard_nodes if node.kind == "physics_body"]
    if selected_set:
        body_nodes = [node for node in body_nodes if node.id in selected_set]
    surface_nodes = [node for node in document.whiteboard_nodes if node.kind == "surface_line"]
    suggestions: list[BoardSuggestion] = []
    _, max_y = _workspace_bounds(document)

    for body in body_nodes:
        if not _has_force_role(document, "gravity"):
            suggestions.append(
                BoardSuggestion(
                    id=make_id("suggestion"),
                    kind="force_completion",
                    target_node_ids=[body.id],
                    patch=_upsert_patch_nodes(
                        _node(
                            node_id=make_id("force"),
                            kind="force_arrow",
                            rect={"x": body.rect.x + body.rect.w, "y": body.rect.y + 18, "w": 130, "h": 18, "rotation": 90},
                            payload={"label": "G", "magnitude_text": "mg", "direction_deg": 90, "target_node_id": body.id},
                            anchors=[{"id": "base", "x": 0, "y": 0.5}, {"id": "tip", "x": 1, "y": 0.5}],
                            layer="ai",
                            z_index=body.z_index + 1,
                            semantic_role="gravity",
                            source_refs=body.source_refs,
                        )
                    ),
                    reason="当前受力图里还没有明确的重力箭头。",
                    status="pending",
                )
            )
        if surface_nodes and not _has_force_role(document, "normal"):
            suggestions.append(
                BoardSuggestion(
                    id=make_id("suggestion"),
                    kind="force_completion",
                    target_node_ids=[body.id, surface_nodes[0].id],
                    patch=_upsert_patch_nodes(
                        _node(
                            node_id=make_id("force"),
                            kind="force_arrow",
                            rect={"x": body.rect.x + body.rect.w * 0.8, "y": body.rect.y + body.rect.h * 0.8, "w": 120, "h": 18, "rotation": -108},
                            payload={"label": "N", "direction_deg": -108, "target_node_id": body.id},
                            anchors=[{"id": "base", "x": 0, "y": 0.5}, {"id": "tip", "x": 1, "y": 0.5}],
                            layer="ai",
                            z_index=body.z_index + 1,
                            semantic_role="normal",
                            source_refs=body.source_refs,
                        )
                    ),
                    reason="物体已经贴着斜面，但还没有法向力候选。",
                    status="pending",
                )
            )
        if surface_nodes and not _has_force_role(document, "friction"):
            suggestions.append(
                BoardSuggestion(
                    id=make_id("suggestion"),
                    kind="force_completion",
                    target_node_ids=[body.id],
                    patch=_upsert_patch_nodes(
                        _node(
                            node_id=make_id("force"),
                            kind="force_arrow",
                            rect={"x": body.rect.x - 120, "y": body.rect.y + 20, "w": 130, "h": 18, "rotation": 162},
                            payload={"label": "f?", "direction_deg": 162, "target_node_id": body.id, "notes": "方向待确认"},
                            anchors=[{"id": "base", "x": 0, "y": 0.5}, {"id": "tip", "x": 1, "y": 0.5}],
                            layer="ai",
                            z_index=body.z_index + 1,
                            semantic_role="friction",
                            source_refs=body.source_refs,
                        )
                    ),
                    reason="粗糙斜面题里通常还要判断摩擦力是否存在以及方向。",
                    status="pending",
                )
            )

    if body_nodes and _is_static_board(document) and not _has_formula(document):
        suggestions.append(
            BoardSuggestion(
                id=make_id("suggestion"),
                kind="equation_hint",
                target_node_ids=[body_nodes[0].id],
                patch=_upsert_patch_nodes(
                    _node(
                        node_id=make_id("formula"),
                        kind="formula_block",
                        rect={"x": 860, "y": max_y + 50, "w": 320, "h": 150},
                        payload={
                            "latex": r"\sum F_{\parallel}=0",
                            "explanation": "静止题先写沿斜面方向平衡式，再决定是否需要分解。",
                            "status": "draft",
                        },
                        layer="ai",
                        z_index=4,
                        semantic_role="derivation",
                        source_refs=body_nodes[0].source_refs,
                    )
                ),
                reason="已有物体和静止信息，但还没有平衡关系公式块。",
                status="pending",
            )
        )

    if _has_formula(document) and surface_nodes and not _has_decomposition_formula(document):
        suggestions.append(
            BoardSuggestion(
                id=make_id("suggestion"),
                kind="next_step",
                target_node_ids=[surface_nodes[0].id],
                patch=_upsert_patch_nodes(
                    _node(
                        node_id=make_id("annotation"),
                        kind="ai_annotation",
                        rect={"x": 860, "y": max_y + 50, "w": 300, "h": 140},
                        payload={
                            "title": "分解检查",
                            "text": "斜面题通常还要补出重力沿斜面和垂直斜面的分解，避免直接把摩擦力写成 muN。",
                            "tone": "check",
                        },
                        layer="overlay",
                        z_index=8,
                        semantic_role="check-zone",
                        source_refs=[],
                    )
                ),
                reason="公式区已经开始列式，但还没看到沿斜面/垂直斜面的分解提示。",
                status="pending",
            )
        )

    for node in document.whiteboard_nodes:
        if node.kind != "force_arrow":
            continue
        label = str(node.payload.get("label", "")).strip()
        if label:
            continue
        next_payload = dict(node.payload)
        next_payload["label"] = "F?"
        suggestions.append(
            BoardSuggestion(
                id=make_id("suggestion"),
                kind="label_fix",
                target_node_ids=[node.id],
                patch=_upsert_patch_nodes(
                    _node(
                        node_id=node.id,
                        kind=node.kind,
                        rect=node.rect.model_dump(mode="json"),
                        payload=next_payload,
                        anchors=[anchor.model_dump(mode="json") for anchor in node.anchors],
                        layer=node.layer,
                        z_index=node.z_index,
                        locked=node.locked,
                        semantic_role=node.semantic_role,
                        source_refs=node.source_refs,
                        metadata=node.metadata,
                    )
                ),
                reason="存在未标注名称的力箭头，建议先补标签再继续检查。",
                status="pending",
            )
        )

    existing_pending = _pending_signatures(document)
    return [item for item in suggestions if f"{item.kind}:{','.join(sorted(item.target_node_ids))}:{item.reason}" not in existing_pending]


def apply_board_patch(document: WorkspaceDocument, patch: BoardPatch) -> WorkspaceDocument:
    next_document = _clone_document(document)
    node_map = {node.id: node.model_dump(mode="json") for node in next_document.whiteboard_nodes}
    for node in patch.upsert_nodes:
        node_map[node.id] = node.model_dump(mode="json")
    for node_id in patch.remove_node_ids:
        node_map.pop(node_id, None)
    next_document.whiteboard_nodes = _sorted_nodes(WhiteboardNode.model_validate(item) for item in node_map.values())

    edge_map = {edge.id: edge.model_dump(mode="json", by_alias=True) for edge in next_document.whiteboard_edges}
    for edge in patch.upsert_edges:
        edge_map[edge.id] = edge.model_dump(mode="json", by_alias=True)
    for edge_id in patch.remove_edge_ids:
        edge_map.pop(edge_id, None)
    next_document.whiteboard_edges = [WhiteboardEdge.model_validate(item) for item in edge_map.values()]
    return next_document


def _merge_suggestions(document: WorkspaceDocument, new_suggestions: list[BoardSuggestion]) -> WorkspaceDocument:
    next_document = _clone_document(document)
    signatures = {f"{item.kind}:{','.join(sorted(item.target_node_ids))}:{item.reason}" for item in new_suggestions}
    retained = [
        item
        for item in next_document.suggestions
        if item.status != "pending"
        or f"{item.kind}:{','.join(sorted(item.target_node_ids))}:{item.reason}" not in signatures
    ]
    next_document.suggestions = retained + new_suggestions
    return next_document


def _persist_document(session: Session, workspace_id: str, document: WorkspaceDocument) -> WorkspaceDocument:
    record = session.get(WorkspaceRecord, workspace_id)
    if record is None:
        raise ValueError("Workspace not found.")

    now = now_iso()
    revision = WorkspaceRevisionRecord(
        id=make_id("revision"),
        workspace_id=workspace_id,
        document=document.model_dump(mode="json", by_alias=True),
        created_at=now,
    )
    session.add(revision)

    document.updated_at = now
    document.revision_id = revision.id
    record.title = document.title
    record.source_asset_id = document.source_asset_id
    record.problem_id = document.problem_id
    record.document = document.model_dump(mode="json", by_alias=True)
    record.updated_at = now
    session.commit()
    return document


def create_workspace(
    session: Session,
    input_data: CreateWorkspaceInput,
    parse_result: ProblemParseResult | None = None,
) -> WorkspaceDocument:
    source_asset: SourceAssetRecord | None = None
    source_asset_id = input_data.source_asset_id or (parse_result.source_asset_id if parse_result else None)
    if source_asset_id:
        source_asset = session.get(SourceAssetRecord, source_asset_id)

    document = build_workspace_document(input_data, parse_result=parse_result, source_asset=source_asset)
    now = now_iso()
    record = WorkspaceRecord(
        id=document.id,
        title=document.title,
        source_asset_id=document.source_asset_id,
        problem_id=document.problem_id,
        document=document.model_dump(mode="json", by_alias=True),
        created_at=now,
        updated_at=now,
    )
    session.add(record)
    session.commit()
    return _persist_document(session, document.id, document)


def load_workspace(session: Session, workspace_id: str) -> WorkspaceDocument | None:
    record = session.get(WorkspaceRecord, workspace_id)
    if record is None:
        return None
    return WorkspaceDocument.model_validate(record.document)


def save_workspace(session: Session, workspace_id: str, input_data: UpdateWorkspaceInput) -> WorkspaceDocument | None:
    record = session.get(WorkspaceRecord, workspace_id)
    if record is None:
        return None
    return _persist_document(session, workspace_id, input_data.document)


def load_workspace_revisions(session: Session, workspace_id: str) -> list[WorkspaceRevision]:
    revisions = session.query(WorkspaceRevisionRecord).filter_by(workspace_id=workspace_id).all()
    return [WorkspaceRevision(id=item.id, workspace_id=item.workspace_id, created_at=item.created_at) for item in revisions]


def attach_source_to_workspace(session: Session, workspace_id: str, asset_id: str) -> WorkspaceDocument | None:
    workspace = load_workspace(session, workspace_id)
    if workspace is None:
        return None

    asset = session.get(SourceAssetRecord, asset_id)
    if asset is None:
        return None

    next_document = _append_source_nodes_from_asset(workspace, asset)
    return _persist_document(session, workspace_id, next_document)


def _ensure_problem_for_asset(session: Session, asset_id: str) -> ProblemParseResult | None:
    existing = session.scalar(select(ProblemRecord).where(ProblemRecord.source_asset_id == asset_id))
    if existing is not None:
        return ProblemParseResult.model_validate(existing.parse_result)

    asset = session.get(SourceAssetRecord, asset_id)
    if asset is None:
        return None

    problem_id = make_id("problem")
    parse_result = parse_asset_to_problem(asset, "hybrid", problem_id)
    record = ProblemRecord(
        id=problem_id,
        source_asset_id=asset.id,
        parse_result=parse_result.model_dump(mode="json"),
        created_at=now_iso(),
        updated_at=now_iso(),
    )
    session.add(record)
    session.commit()
    return parse_result


def analyze_workspace_source(session: Session, workspace_id: str, asset_id: str | None = None) -> WorkspaceDocument | None:
    workspace = load_workspace(session, workspace_id)
    if workspace is None:
        return None

    effective_asset_id = asset_id or workspace.source_asset_id
    if not effective_asset_id:
        return workspace

    parse_result = _ensure_problem_for_asset(session, effective_asset_id)
    if parse_result is None:
        return None

    next_document = _apply_parse_context(workspace, parse_result)
    next_document = _merge_suggestions(next_document, generate_source_suggestions(next_document, parse_result))
    if _documents_equal(workspace, next_document):
        return workspace
    return _persist_document(session, workspace_id, next_document)


def analyze_workspace_board(session: Session, workspace_id: str, input_data: AnalyzeBoardInput) -> WorkspaceDocument | None:
    workspace = load_workspace(session, workspace_id)
    if workspace is None:
        return None

    suggestions = generate_board_suggestions(workspace, input_data.selected_node_ids)
    if not suggestions:
        return workspace
    next_document = _merge_suggestions(workspace, suggestions)
    if _documents_equal(workspace, next_document):
        return workspace
    return _persist_document(session, workspace_id, next_document)


def accept_workspace_suggestion(session: Session, workspace_id: str, suggestion_id: str) -> WorkspaceDocument | None:
    workspace = load_workspace(session, workspace_id)
    if workspace is None:
        return None

    next_document = _clone_document(workspace)
    for index, suggestion in enumerate(next_document.suggestions):
        if suggestion.id != suggestion_id:
            continue
        next_document = apply_board_patch(next_document, suggestion.patch)
        next_document.suggestions[index].status = "accepted"
        return _persist_document(session, workspace_id, next_document)
    return workspace


def reject_workspace_suggestion(session: Session, workspace_id: str, suggestion_id: str) -> WorkspaceDocument | None:
    workspace = load_workspace(session, workspace_id)
    if workspace is None:
        return None

    next_document = _clone_document(workspace)
    for index, suggestion in enumerate(next_document.suggestions):
        if suggestion.id == suggestion_id:
            next_document.suggestions[index].status = "rejected"
            return _persist_document(session, workspace_id, next_document)
    return workspace
