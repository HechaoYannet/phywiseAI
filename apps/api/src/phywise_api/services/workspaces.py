from __future__ import annotations

from collections.abc import Iterable
from xml.etree import ElementTree as ET

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

DEFAULT_SCENE_WIDTH = 360
DEFAULT_SCENE_HEIGHT = 240


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


def make_object_ref(node_id: str, child_id: str | None = None) -> str:
    if child_id:
        return f"node:{node_id}#child:{child_id}"
    return f"node:{node_id}"


def parse_object_ref(object_ref: str) -> tuple[str, str | None]:
    if not object_ref.startswith("node:"):
        raise ValueError(f"Unsupported object ref: {object_ref}")
    payload = object_ref[5:]
    if "#child:" not in payload:
        return payload, None
    node_id, child_id = payload.split("#child:", maxsplit=1)
    return node_id, child_id or None


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


def _rich_block(
    *,
    node_id: str,
    x: float,
    y: float,
    w: float,
    h: float,
    title: str,
    content: str,
    block_role: str,
    status: str = "draft",
    layer: str = "student",
    z_index: int = 2,
    semantic_role: str | None = None,
    source_refs: list[str] | None = None,
) -> WhiteboardNode:
    return _node(
        node_id=node_id,
        kind="rich_block",
        rect={"x": x, "y": y, "w": w, "h": h},
        payload={
            "title": title,
            "content": content,
            "content_format": "markdown_math",
            "block_role": block_role,
            "status": status,
        },
        anchors=[],
        layer=layer,
        z_index=z_index,
        locked=False,
        semantic_role=semantic_role,
        source_refs=source_refs,
    )


def _build_scene_xml(
    *,
    include_gravity: bool,
    include_normal: bool,
    include_friction: bool,
    force_labels: dict[str, str] | None = None,
) -> str:
    force_labels = force_labels or {}
    root = ET.Element(
        "phy-canvas",
        {
            "scene-kind": "force_analysis",
            "version": "1",
            "width": str(DEFAULT_SCENE_WIDTH),
            "height": str(DEFAULT_SCENE_HEIGHT),
        },
    )
    ET.SubElement(
        root,
        "body",
        {
            "id": "body-main",
            "x": "128",
            "y": "74",
            "w": "92",
            "h": "62",
            "rotation": "0",
            "label": "物块",
            "shape": "block",
        },
    )
    ET.SubElement(
        root,
        "surface",
        {
            "id": "surface-main",
            "x": "78",
            "y": "154",
            "w": "210",
            "h": "12",
            "rotation": "-18",
            "label": "斜面",
            "angle": "theta",
            "surface-kind": "plane",
        },
    )
    ET.SubElement(root, "label", {"id": "label-angle", "x": "242", "y": "160", "text": "theta"})

    if include_gravity:
        ET.SubElement(
            root,
            "force",
            {
                "id": "force-gravity",
                "x": "166",
                "y": "74",
                "w": "102",
                "h": "14",
                "rotation": "90",
                "label": force_labels.get("gravity", "G"),
                "magnitude": "mg",
                "role": "gravity",
                "target": "body-main",
            },
        )

    if include_normal:
        ET.SubElement(
            root,
            "force",
            {
                "id": "force-normal",
                "x": "206",
                "y": "88",
                "w": "100",
                "h": "14",
                "rotation": "-108",
                "label": force_labels.get("normal", "N"),
                "role": "normal",
                "target": "body-main",
            },
        )

    if include_friction:
        ET.SubElement(
            root,
            "force",
            {
                "id": "force-friction",
                "x": "74",
                "y": "104",
                "w": "112",
                "h": "14",
                "rotation": "162",
                "label": force_labels.get("friction", "f?"),
                "role": "friction",
                "target": "body-main",
                "notes": "方向待确认",
            },
        )

    return ET.tostring(root, encoding="unicode")


def _phy_canvas(
    *,
    node_id: str,
    x: float,
    y: float,
    w: float,
    h: float,
    scene_xml: str,
    layer: str = "student",
    z_index: int = 3,
    semantic_role: str | None = None,
    source_refs: list[str] | None = None,
) -> WhiteboardNode:
    return _node(
        node_id=node_id,
        kind="phy_canvas",
        rect={"x": x, "y": y, "w": w, "h": h},
        payload={
            "scene_kind": "force_analysis",
            "scene_xml": scene_xml,
            "version": 1,
            "bounds": {"width": DEFAULT_SCENE_WIDTH, "height": DEFAULT_SCENE_HEIGHT},
            "summary": "受力分析图",
        },
        anchors=[],
        layer=layer,
        z_index=z_index,
        locked=False,
        semantic_role=semantic_role,
        source_refs=source_refs,
    )


def _workspace_bounds(document: WorkspaceDocument) -> tuple[float, float]:
    if not document.whiteboard_nodes:
        return (80, 80)
    max_x = max(node.rect.x + node.rect.w for node in document.whiteboard_nodes)
    max_y = max(node.rect.y + node.rect.h for node in document.whiteboard_nodes)
    return (max_x, max_y)


def _upsert_patch_nodes(*nodes: WhiteboardNode) -> BoardPatch:
    return BoardPatch(
        upsert_nodes=list(nodes),
        remove_node_ids=[],
        upsert_edges=[],
        remove_edge_ids=[],
        object_mutations=[],
    )


def _upsert_patch_object_mutations(*mutations: dict) -> BoardPatch:
    return BoardPatch(
        upsert_nodes=[],
        remove_node_ids=[],
        upsert_edges=[],
        remove_edge_ids=[],
        object_mutations=list(mutations),
    )


def _scene_root(node: WhiteboardNode) -> ET.Element:
    payload = node.payload
    if node.kind != "phy_canvas":
        raise ValueError("Scene helpers require a phy_canvas node.")
    scene_xml = str(payload.get("scene_xml", "")).strip()
    if not scene_xml:
        scene_xml = _build_scene_xml(include_gravity=False, include_normal=False, include_friction=False)
    return ET.fromstring(scene_xml)


def _write_scene_root(node: WhiteboardNode, root: ET.Element) -> WhiteboardNode:
    payload = dict(node.payload)
    payload["scene_xml"] = ET.tostring(root, encoding="unicode")
    payload["bounds"] = {
        "width": int(root.attrib.get("width", str(DEFAULT_SCENE_WIDTH))),
        "height": int(root.attrib.get("height", str(DEFAULT_SCENE_HEIGHT))),
    }
    payload["scene_kind"] = root.attrib.get("scene-kind", "force_analysis")
    payload["version"] = int(root.attrib.get("version", "1"))
    return _node(
        node_id=node.id,
        kind=node.kind,
        rect=node.rect.model_dump(mode="json"),
        payload=payload,
        anchors=[anchor.model_dump(mode="json") for anchor in node.anchors],
        layer=node.layer,
        z_index=node.z_index,
        locked=node.locked,
        semantic_role=node.semantic_role,
        source_refs=node.source_refs,
        metadata=node.metadata,
    )


def _find_scene_child(root: ET.Element, child_id: str | None) -> ET.Element | None:
    if not child_id:
        return None
    for child in root:
        if child.attrib.get("id") == child_id:
            return child
    return None


def _scene_children_by_tag(root: ET.Element, tag: str) -> list[ET.Element]:
    return [child for child in root if child.tag == tag]


def _scene_has_force_role(root: ET.Element, role: str) -> bool:
    return any(child.tag == "force" and child.attrib.get("role") == role for child in root)


def _scene_force_child(root: ET.Element, role: str) -> ET.Element | None:
    for child in root:
        if child.tag == "force" and child.attrib.get("role") == role:
            return child
    return None


def _node_text(node: WhiteboardNode) -> str:
    if node.kind == "rich_block":
        return f"{node.payload.get('title', '')} {node.payload.get('content', '')} {node.semantic_role or ''}"
    if node.kind == "source_image":
        return f"{node.payload.get('caption', '')} {node.payload.get('alt', '')} {node.semantic_role or ''}"
    if node.kind == "phy_canvas":
        return f"{node.payload.get('summary', '')} {node.semantic_role or ''}"
    return f"{node.payload.get('title', '')} {node.payload.get('text', '')} {node.semantic_role or ''}"


def _compact_text(value: str) -> str:
    return " ".join(value.split())


def _has_equivalent_source_text(document: WorkspaceDocument, text: str) -> bool:
    target = _compact_text(text)
    if not target:
        return False
    return any(
        node.kind == "rich_block"
        and node.semantic_role == "problem-source"
        and _compact_text(str(node.payload.get("content", ""))) == target
        for node in document.whiteboard_nodes
    )


def _is_static_board(document: WorkspaceDocument) -> bool:
    combined = " ".join(_node_text(node) for node in document.whiteboard_nodes).lower()
    return any(token in combined for token in ("静止", "平衡", "合力为0", "sum f", "∑f"))


def _has_derivation_block(document: WorkspaceDocument) -> bool:
    return any(
        node.kind == "rich_block" and node.payload.get("block_role") in {"derivation", "equation"}
        for node in document.whiteboard_nodes
    )


def _has_decomposition_hint(document: WorkspaceDocument) -> bool:
    content = " ".join(
        str(node.payload.get("content", ""))
        for node in document.whiteboard_nodes
        if node.kind == "rich_block" and node.payload.get("block_role") in {"derivation", "equation"}
    ).lower()
    return any(token in content for token in ("sin", "cos", "沿斜面", "垂直斜面", "分解"))


def _pending_signatures(document: WorkspaceDocument) -> set[str]:
    return {
        f"{item.kind}:{','.join(sorted(item.target_object_refs))}:{item.reason}"
        for item in document.suggestions
        if item.status == "pending"
    }


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
        selection_state={"selected_object_refs": [], "active_tool": "select"},
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
            _rich_block(
                node_id=make_id("source"),
                x=88,
                y=88,
                w=420,
                h=220,
                title=asset.filename,
                content=text or asset.filename,
                block_role="note",
                status="checked",
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
                rect={"x": 88, "y": 88, "w": 360, "h": 260},
                payload={
                    "source_asset_id": asset.id,
                    "preview_key": asset.storage_key,
                    "alt": asset.filename,
                    "width": width,
                    "height": height,
                    "caption": "导入题图",
                },
                anchors=[],
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
                rect={"x": 88 + (index - 1) * 296, "y": 88, "w": 280, "h": 220},
                payload={
                    "source_asset_id": asset.id,
                    "preview_key": page["preview_key"],
                    "alt": page["label"],
                    "page": page["page"],
                    "width": page["width"],
                    "height": page["height"],
                    "caption": page["label"],
                },
                anchors=[],
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
    should_add_summary = not any(
        node.semantic_role == "source-summary" for node in next_document.whiteboard_nodes
    ) and not _has_equivalent_source_text(next_document, parse_result.stem)
    if should_add_summary:
        next_document.whiteboard_nodes.append(
            _rich_block(
                node_id=make_id("summary"),
                x=88,
                y=380,
                w=420,
                h=210,
                title="题目摘要",
                content=parse_result.stem,
                block_role="note",
                status="checked",
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


def generate_source_suggestions(document: WorkspaceDocument, parse_result: ProblemParseResult) -> list[BoardSuggestion]:
    _, max_y = _workspace_bounds(document)
    source_refs = [parse_result.source_asset_id]
    source_anchor = next((make_object_ref(node.id) for node in document.whiteboard_nodes if node.layer == "source"), None)
    target_refs = [source_anchor] if source_anchor else []
    suggestions: list[BoardSuggestion] = []

    if parse_result.conditions:
        condition_nodes = [
            _rich_block(
                node_id=make_id("condition"),
                x=560 + (index % 2) * 300,
                y=max_y + 40 + (index // 2) * 146,
                w=260,
                h=110,
                title=condition.label,
                content=condition.value,
                block_role="condition",
                status="checked",
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
                target_object_refs=target_refs,
                patch=_upsert_patch_nodes(*condition_nodes),
                reason="已从题干抽出可编辑条件块，接受后可直接在白板上修改。",
                status="pending",
            )
        )

    if any(link.key == "force-analysis" for link in parse_result.knowledge_links):
        diagram_node = _phy_canvas(
            node_id=make_id("diagram"),
            x=560,
            y=max_y + 54,
            w=360,
            h=240,
            scene_xml=_build_scene_xml(include_gravity=True, include_normal=True, include_friction=True),
            layer="ai",
            z_index=4,
            semantic_role="force-scene",
            source_refs=source_refs,
        )
        suggestions.append(
            BoardSuggestion(
                id=make_id("suggestion"),
                kind="diagram_rebuild",
                target_object_refs=target_refs,
                patch=_upsert_patch_nodes(diagram_node),
                reason="根据题干重建了一版受力图候选，接受后可像 Word 形状一样继续编辑。",
                status="pending",
            )
        )

    if parse_result.subquestions:
        formula_node = _rich_block(
            node_id=make_id("formula"),
            x=960,
            y=max_y + 54,
            w=320,
            h=150,
            title="推导起点",
            content="沿斜面方向：$\\sum F_{\\parallel}=0$",
            block_role="derivation",
            status="draft",
            layer="ai",
            z_index=4,
            semantic_role="derivation",
            source_refs=source_refs,
        )
        suggestions.append(
            BoardSuggestion(
                id=make_id("suggestion"),
                kind="equation_hint",
                target_object_refs=target_refs,
                patch=_upsert_patch_nodes(formula_node),
                reason="题目含有静止或平衡信息，建议先补一个可直接编辑的推导块。",
                status="pending",
            )
        )

    return suggestions


def generate_board_suggestions(document: WorkspaceDocument, selected_object_refs: list[str] | None = None) -> list[BoardSuggestion]:
    selected_object_refs = selected_object_refs or []
    selected_node_ids = {parse_object_ref(item)[0] for item in selected_object_refs if item.startswith("node:")}
    diagram_nodes = [node for node in document.whiteboard_nodes if node.kind == "phy_canvas"]
    if selected_node_ids:
        diagram_nodes = [node for node in diagram_nodes if node.id in selected_node_ids]

    suggestions: list[BoardSuggestion] = []
    _, max_y = _workspace_bounds(document)

    for diagram_node in diagram_nodes:
        root = _scene_root(diagram_node)
        target_body = _find_scene_child(root, "body-main")
        body_ref = make_object_ref(diagram_node.id, "body-main")

        if target_body is not None and not _scene_has_force_role(root, "gravity"):
            suggestions.append(
                BoardSuggestion(
                    id=make_id("suggestion"),
                    kind="force_completion",
                    target_object_refs=[body_ref],
                    patch=_upsert_patch_object_mutations(
                        {
                            "op": "phy_canvas_upsert_child",
                            "object_ref": make_object_ref(diagram_node.id),
                            "child_id": "force-gravity",
                            "child_xml": '<force id="force-gravity" x="166" y="74" w="102" h="14" rotation="90" label="G" magnitude="mg" role="gravity" target="body-main" />',
                        }
                    ),
                    reason="当前受力图里还没有明确的重力箭头。",
                    status="pending",
                )
            )

        if target_body is not None and not _scene_has_force_role(root, "normal"):
            suggestions.append(
                BoardSuggestion(
                    id=make_id("suggestion"),
                    kind="force_completion",
                    target_object_refs=[body_ref],
                    patch=_upsert_patch_object_mutations(
                        {
                            "op": "phy_canvas_upsert_child",
                            "object_ref": make_object_ref(diagram_node.id),
                            "child_id": "force-normal",
                            "child_xml": '<force id="force-normal" x="206" y="88" w="100" h="14" rotation="-108" label="N" role="normal" target="body-main" />',
                        }
                    ),
                    reason="物体已经贴着斜面，但还没有法向力候选。",
                    status="pending",
                )
            )

        if target_body is not None and not _scene_has_force_role(root, "friction"):
            suggestions.append(
                BoardSuggestion(
                    id=make_id("suggestion"),
                    kind="force_completion",
                    target_object_refs=[body_ref],
                    patch=_upsert_patch_object_mutations(
                        {
                            "op": "phy_canvas_upsert_child",
                            "object_ref": make_object_ref(diagram_node.id),
                            "child_id": "force-friction",
                            "child_xml": '<force id="force-friction" x="74" y="104" w="112" h="14" rotation="162" label="f?" role="friction" target="body-main" notes="方向待确认" />',
                        }
                    ),
                    reason="粗糙斜面题里通常还要判断摩擦力是否存在以及方向。",
                    status="pending",
                )
            )

        for force in _scene_children_by_tag(root, "force"):
            if force.attrib.get("label", "").strip():
                continue
            child_id = force.attrib.get("id")
            if not child_id:
                continue
            suggestions.append(
                BoardSuggestion(
                    id=make_id("suggestion"),
                    kind="label_fix",
                    target_object_refs=[make_object_ref(diagram_node.id, child_id)],
                    patch=_upsert_patch_object_mutations(
                        {
                            "op": "phy_canvas_set_attr",
                            "object_ref": make_object_ref(diagram_node.id, child_id),
                            "attr_name": "label",
                            "value": "F?",
                        }
                    ),
                    reason="存在未标注名称的力元素，建议先补标签再继续检查。",
                    status="pending",
                )
            )

    if diagram_nodes and _is_static_board(document) and not _has_derivation_block(document):
        suggestions.append(
            BoardSuggestion(
                id=make_id("suggestion"),
                kind="equation_hint",
                target_object_refs=[make_object_ref(diagram_nodes[0].id)],
                patch=_upsert_patch_nodes(
                    _rich_block(
                        node_id=make_id("formula"),
                        x=960,
                        y=max_y + 40,
                        w=320,
                        h=150,
                        title="平衡式",
                        content="沿斜面方向：$\\sum F_{\\parallel}=0$",
                        block_role="derivation",
                        status="draft",
                        layer="ai",
                        z_index=4,
                        semantic_role="derivation",
                        source_refs=diagram_nodes[0].source_refs,
                    )
                ),
                reason="已有受力图和静止信息，但还没有平衡关系推导块。",
                status="pending",
            )
        )

    derivation_block = next(
        (
            node
            for node in document.whiteboard_nodes
            if node.kind == "rich_block" and node.payload.get("block_role") in {"derivation", "equation"}
        ),
        None,
    )
    if derivation_block and not _has_decomposition_hint(document):
        current_content = str(derivation_block.payload.get("content", "")).rstrip()
        next_content = current_content + "\n\n补充：把重力分解到沿斜面和垂直斜面两个方向。"
        suggestions.append(
            BoardSuggestion(
                id=make_id("suggestion"),
                kind="next_step",
                target_object_refs=[make_object_ref(derivation_block.id)],
                patch=_upsert_patch_object_mutations(
                    {
                        "op": "replace_rich_block_content",
                        "object_ref": make_object_ref(derivation_block.id),
                        "content": next_content,
                        "content_format": "markdown_math",
                    }
                ),
                reason="推导块已经开始列式，但还没补出重力分解这一步。",
                status="pending",
            )
        )

    existing_pending = _pending_signatures(document)
    return [
        item
        for item in suggestions
        if f"{item.kind}:{','.join(sorted(item.target_object_refs))}:{item.reason}" not in existing_pending
    ]


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

    for mutation in patch.object_mutations:
        next_document = _apply_object_mutation(next_document, mutation)

    return next_document


def _apply_object_mutation(document: WorkspaceDocument, mutation: dict) -> WorkspaceDocument:
    next_document = _clone_document(document)
    object_ref = str(mutation.get("object_ref", ""))
    node_id, child_id = parse_object_ref(object_ref)
    node_index = next((index for index, item in enumerate(next_document.whiteboard_nodes) if item.id == node_id), None)
    if node_index is None:
        return next_document

    target_node = next_document.whiteboard_nodes[node_index]
    op = mutation.get("op")

    if op == "replace_rich_block_content" and target_node.kind == "rich_block":
        payload = dict(target_node.payload)
        payload["content"] = str(mutation.get("content", payload.get("content", "")))
        payload["content_format"] = str(mutation.get("content_format", payload.get("content_format", "markdown_math")))
        next_document.whiteboard_nodes[node_index] = _node(
            node_id=target_node.id,
            kind=target_node.kind,
            rect=target_node.rect.model_dump(mode="json"),
            payload=payload,
            anchors=[anchor.model_dump(mode="json") for anchor in target_node.anchors],
            layer=target_node.layer,
            z_index=target_node.z_index,
            locked=target_node.locked,
            semantic_role=target_node.semantic_role,
            source_refs=target_node.source_refs,
            metadata=target_node.metadata,
        )
        return next_document

    if target_node.kind != "phy_canvas":
        return next_document

    root = _scene_root(target_node)
    if op == "phy_canvas_upsert_child":
        child_xml = str(mutation.get("child_xml", "")).strip()
        if not child_xml:
            return next_document
        child_element = ET.fromstring(child_xml)
        child_id = mutation.get("child_id") or child_element.attrib.get("id")
        existing = _find_scene_child(root, str(child_id) if child_id else None)
        if existing is not None:
            root.remove(existing)
        root.append(child_element)
    elif op == "phy_canvas_remove_child":
        existing = _find_scene_child(root, child_id)
        if existing is not None:
            root.remove(existing)
    elif op == "phy_canvas_set_attr":
        attr_name = mutation.get("attr_name")
        if not attr_name:
            return next_document
        target_element = _find_scene_child(root, child_id) if child_id else root
        if target_element is None:
            return next_document
        value = mutation.get("value")
        if value is None:
            target_element.attrib.pop(str(attr_name), None)
        else:
            target_element.attrib[str(attr_name)] = str(value)
    else:
        return next_document

    next_document.whiteboard_nodes[node_index] = _write_scene_root(target_node, root)
    return next_document


def _merge_suggestions(document: WorkspaceDocument, new_suggestions: list[BoardSuggestion]) -> WorkspaceDocument:
    next_document = _clone_document(document)
    signatures = {f"{item.kind}:{','.join(sorted(item.target_object_refs))}:{item.reason}" for item in new_suggestions}
    retained = [
        item
        for item in next_document.suggestions
        if item.status != "pending"
        or f"{item.kind}:{','.join(sorted(item.target_object_refs))}:{item.reason}" not in signatures
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

    suggestions = generate_board_suggestions(workspace, input_data.selected_object_refs)
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
