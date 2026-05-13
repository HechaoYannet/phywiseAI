import type { BoardPatch, WorkspaceDocument } from "@phywise/contracts";
import type { WhiteboardNode } from "@phywise/whiteboard-schema";

export type RuntimeShapeKind = "card" | "image" | "body" | "surface" | "force";

export interface BoardRuntimeShape {
  id: string;
  nodeId: string;
  kind: RuntimeShapeKind;
  title: string;
  subtitle?: string;
  node: WhiteboardNode;
}

export function sortNodes(nodes: WhiteboardNode[]): WhiteboardNode[] {
  return [...nodes].sort((left, right) => {
    if (left.z_index !== right.z_index) {
      return left.z_index - right.z_index;
    }
    if (left.rect.y !== right.rect.y) {
      return left.rect.y - right.rect.y;
    }
    return left.rect.x - right.rect.x;
  });
}

export function documentToRuntimeShapes(document: WorkspaceDocument): BoardRuntimeShape[] {
  return sortNodes(document.whiteboard_nodes).map((node) => {
    switch (node.kind) {
      case "source_image":
        return {
          id: `${node.id}-shape`,
          nodeId: node.id,
          kind: "image",
          title: String(node.payload.caption ?? node.payload.alt ?? "题图"),
          subtitle: String(node.payload.alt ?? ""),
          node
        };
      case "physics_body":
        return {
          id: `${node.id}-shape`,
          nodeId: node.id,
          kind: "body",
          title: String(node.payload.label ?? "物体"),
          subtitle: String(node.payload.notes ?? ""),
          node
        };
      case "surface_line":
        return {
          id: `${node.id}-shape`,
          nodeId: node.id,
          kind: "surface",
          title: String(node.payload.label ?? "接触面"),
          subtitle: String(node.payload.angle_text ?? ""),
          node
        };
      case "force_arrow":
        return {
          id: `${node.id}-shape`,
          nodeId: node.id,
          kind: "force",
          title: String(node.payload.label ?? "力"),
          subtitle: String(node.payload.magnitude_text ?? node.payload.notes ?? ""),
          node
        };
      case "formula_block":
        return {
          id: `${node.id}-shape`,
          nodeId: node.id,
          kind: "card",
          title: String(node.payload.latex ?? "公式块"),
          subtitle: String(node.payload.explanation ?? ""),
          node
        };
      case "condition_card":
        return {
          id: `${node.id}-shape`,
          nodeId: node.id,
          kind: "card",
          title: String(node.payload.label ?? "条件"),
          subtitle: String(node.payload.value ?? ""),
          node
        };
      case "ai_annotation":
        return {
          id: `${node.id}-shape`,
          nodeId: node.id,
          kind: "card",
          title: String(node.payload.title ?? "AI 检查"),
          subtitle: String(node.payload.text ?? ""),
          node
        };
      case "free_text":
      default:
        return {
          id: `${node.id}-shape`,
          nodeId: node.id,
          kind: "card",
          title: String(node.payload.text ?? node.payload.markdown ?? "文本"),
          subtitle: node.semantic_role,
          node
        };
    }
  });
}

export function applyBoardPatchLocally(document: WorkspaceDocument, patch: BoardPatch): WorkspaceDocument {
  const nodeMap = new Map(document.whiteboard_nodes.map((node) => [node.id, node] as const));
  for (const node of patch.upsert_nodes) {
    nodeMap.set(node.id, node);
  }
  for (const nodeId of patch.remove_node_ids) {
    nodeMap.delete(nodeId);
  }

  const edgeMap = new Map(document.whiteboard_edges.map((edge) => [edge.id, edge] as const));
  for (const edge of patch.upsert_edges) {
    edgeMap.set(edge.id, edge);
  }
  for (const edgeId of patch.remove_edge_ids) {
    edgeMap.delete(edgeId);
  }

  return {
    ...document,
    whiteboard_nodes: sortNodes([...nodeMap.values()]),
    whiteboard_edges: [...edgeMap.values()]
  };
}
