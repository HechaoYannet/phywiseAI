import type { BoardPatch, WorkspaceDocument } from "@phywise/contracts";
import type { PhyCanvasNode, WhiteboardNode } from "@phywise/whiteboard-schema";

export type RuntimeShapeKind = "image" | "richBlock" | "phyCanvas" | "annotation";

export interface BoardRuntimeShape {
  id: string;
  nodeId: string;
  objectRef: string;
  kind: RuntimeShapeKind;
  title: string;
  subtitle?: string;
  node: WhiteboardNode;
}

export interface PhyCanvasObject {
  id: string;
  kind: string;
  objectRef: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label?: string;
  text?: string;
  attrs: Record<string, string>;
}

const LABEL_DEFAULT_WIDTH = 88;
const LABEL_DEFAULT_HEIGHT = 26;

export function makeNodeObjectRef(nodeId: string): string {
  return `node:${nodeId}`;
}

export function makeChildObjectRef(nodeId: string, childId: string): string {
  return `node:${nodeId}#child:${childId}`;
}

export function parseObjectRef(objectRef: string): { nodeId: string; childId?: string } {
  if (!objectRef.startsWith("node:")) {
    throw new Error(`Unsupported object ref: ${objectRef}`);
  }

  const payload = objectRef.slice(5);
  if (!payload.includes("#child:")) {
    return { nodeId: payload };
  }

  const [nodeId, childId] = payload.split("#child:");
  return { nodeId, childId: childId || undefined };
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
          objectRef: makeNodeObjectRef(node.id),
          kind: "image",
          title: String(node.payload.caption ?? node.payload.alt ?? "题图"),
          subtitle: String(node.payload.alt ?? ""),
          node
        };
      case "phy_canvas":
        return {
          id: `${node.id}-shape`,
          nodeId: node.id,
          objectRef: makeNodeObjectRef(node.id),
          kind: "phyCanvas",
          title: String(node.payload.summary ?? "受力分析图"),
          subtitle: node.semantic_role,
          node
        };
      case "ai_annotation":
        return {
          id: `${node.id}-shape`,
          nodeId: node.id,
          objectRef: makeNodeObjectRef(node.id),
          kind: "annotation",
          title: String(node.payload.title ?? "AI 批注"),
          subtitle: String(node.payload.text ?? ""),
          node
        };
      case "rich_block":
      default:
        return {
          id: `${node.id}-shape`,
          nodeId: node.id,
          objectRef: makeNodeObjectRef(node.id),
          kind: "richBlock",
          title: String(node.payload.title ?? richBlockFallbackTitle(node)),
          subtitle: truncateText(String(node.payload.content ?? "")),
          node
        };
    }
  });
}

export function parsePhyCanvasObjects(node: PhyCanvasNode): PhyCanvasObject[] {
  const root = readPhyCanvasSceneRoot(String(node.payload.scene_xml ?? ""));
  if (!root) {
    return [];
  }

  return Array.from(root.children).map((child) => {
    const attrs = Array.from(child.attributes).reduce<Record<string, string>>((acc, attr) => {
      acc[attr.name] = attr.value;
      return acc;
    }, {});

    return {
      id: attrs.id ?? child.tagName,
      kind: child.tagName,
      objectRef: makeChildObjectRef(node.id, attrs.id ?? child.tagName),
      x: toNumber(attrs.x),
      y: toNumber(attrs.y),
      w: toNumber(attrs.w, child.tagName === "label" ? LABEL_DEFAULT_WIDTH : 0),
      h: toNumber(attrs.h, child.tagName === "label" ? LABEL_DEFAULT_HEIGHT : 0),
      rotation: toNumber(attrs.rotation),
      label: attrs.label,
      text: attrs.text,
      attrs
    };
  });
}

export function applyBoardPatchLocally(document: WorkspaceDocument, patch: BoardPatch): WorkspaceDocument {
  const nodeMap = new Map(document.whiteboard_nodes.map((node) => [node.id, node] as const));
  for (const node of patch.upsert_nodes) {
    nodeMap.set(node.id, node);
  }

  const removedNodeIds = new Set(patch.remove_node_ids);
  for (const nodeId of patch.remove_node_ids) {
    nodeMap.delete(nodeId);
  }

  const edgeMap = new Map(
    document.whiteboard_edges
      .filter((edge) => !removedNodeIds.has(edge.from) && !removedNodeIds.has(edge.to))
      .map((edge) => [edge.id, edge] as const)
  );
  for (const edge of patch.upsert_edges) {
    if (!removedNodeIds.has(edge.from) && !removedNodeIds.has(edge.to)) {
      edgeMap.set(edge.id, edge);
    }
  }
  for (const edgeId of patch.remove_edge_ids) {
    edgeMap.delete(edgeId);
  }

  let nextDocument: WorkspaceDocument = {
    ...document,
    whiteboard_nodes: sortNodes([...nodeMap.values()]),
    whiteboard_edges: [...edgeMap.values()]
  };

  for (const mutation of patch.object_mutations) {
    nextDocument = applyObjectMutation(nextDocument, mutation);
  }

  return nextDocument;
}

export function mutatePhyCanvasScene(sceneXml: string, updater: (root: Element) => void): string {
  const root = readPhyCanvasSceneRoot(sceneXml);
  if (!root) {
    return sceneXml;
  }

  updater(root);
  normalizeSceneChildren(root);
  return new XMLSerializer().serializeToString(root);
}

export function findPhyCanvasChild(root: Element, childId?: string): Element | null {
  return findSceneChild(root, childId);
}

function applyObjectMutation(
  document: WorkspaceDocument,
  mutation: BoardPatch["object_mutations"][number]
): WorkspaceDocument {
  const { nodeId, childId } = parseObjectRef(mutation.object_ref);
  const nodeIndex = document.whiteboard_nodes.findIndex((node) => node.id === nodeId);
  if (nodeIndex < 0) {
    return document;
  }

  const targetNode = document.whiteboard_nodes[nodeIndex];

  if (mutation.op === "replace_rich_block_content" && targetNode.kind === "rich_block") {
    const nextNodes = [...document.whiteboard_nodes];
    nextNodes[nodeIndex] = {
      ...targetNode,
      payload: {
        ...targetNode.payload,
        content: mutation.content ?? targetNode.payload.content,
        content_format: mutation.content_format ?? targetNode.payload.content_format
      }
    };
    return {
      ...document,
      whiteboard_nodes: nextNodes
    };
  }

  if (targetNode.kind !== "phy_canvas" || typeof DOMParser === "undefined") {
    return document;
  }

  const root = readPhyCanvasSceneRoot(String(targetNode.payload.scene_xml ?? ""));
  if (!root) {
    return document;
  }

  if (mutation.op === "phy_canvas_upsert_child") {
    const childElement = readXmlElement(String(mutation.child_xml ?? ""));
    if (!childElement) {
      return document;
    }
    const nextChildId =
      mutation.child_id ??
      childElement.getAttribute("id")?.trim() ??
      createNormalizedChildId(childElement.tagName, Array.from(root.children).length);
    childElement.setAttribute("id", nextChildId);
    const existing = findSceneChild(root, nextChildId);
    if (existing) {
      existing.remove();
    }
    root.append(childElement.cloneNode(true));
  } else if (mutation.op === "phy_canvas_remove_child") {
    const existing = findSceneChild(root, childId);
    if (existing) {
      existing.remove();
    }
  } else if (mutation.op === "phy_canvas_set_attr") {
    if (!mutation.attr_name) {
      return document;
    }
    const targetElement = childId ? findSceneChild(root, childId) : root;
    if (!targetElement) {
      return document;
    }
    if (mutation.value === null || typeof mutation.value === "undefined") {
      targetElement.removeAttribute(mutation.attr_name);
    } else {
      targetElement.setAttribute(mutation.attr_name, String(mutation.value));
    }
  } else {
    return document;
  }

  const nextNodes = [...document.whiteboard_nodes];
  nextNodes[nodeIndex] = {
    ...targetNode,
    payload: {
      ...targetNode.payload,
      scene_xml: new XMLSerializer().serializeToString(root)
    }
  };

  return {
    ...document,
    whiteboard_nodes: nextNodes
  };
}

function findSceneChild(root: Element, childId?: string): Element | null {
  if (!childId) {
    return null;
  }

  normalizeSceneChildren(root);
  return (
    Array.from(root.children).find((child) => child.getAttribute("id") === childId) ??
    null
  );
}

function richBlockFallbackTitle(node: Extract<WhiteboardNode, { kind: "rich_block" }>): string {
  switch (node.payload.block_role) {
    case "condition":
      return "条件";
    case "equation":
      return "公式";
    case "derivation":
      return "推导";
    default:
      return "笔记";
  }
}

function truncateText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 80);
}

function toNumber(value: string | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readPhyCanvasSceneRoot(sceneXml: string): Element | null {
  if (typeof DOMParser === "undefined") {
    return null;
  }

  const normalizedXml = sceneXml.trim();
  if (!normalizedXml) {
    return null;
  }

  const document = new DOMParser().parseFromString(normalizedXml, "application/xml");
  if (document.querySelector("parsererror")) {
    return null;
  }

  const root = document.documentElement;
  if (!root) {
    return null;
  }

  normalizeSceneChildren(root);
  return root;
}

function readXmlElement(xml: string): Element | null {
  if (typeof DOMParser === "undefined") {
    return null;
  }

  const normalizedXml = xml.trim();
  if (!normalizedXml) {
    return null;
  }

  const document = new DOMParser().parseFromString(normalizedXml, "application/xml");
  if (document.querySelector("parsererror")) {
    return null;
  }

  return document.documentElement;
}

function normalizeSceneChildren(root: Element) {
  const seenIds = new Set<string>();
  Array.from(root.children).forEach((child, index) => {
    const rawId = child.getAttribute("id")?.trim();
    const baseId = rawId || createNormalizedChildId(child.tagName, index);
    let nextId = baseId;
    let suffix = 2;
    while (seenIds.has(nextId)) {
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    }
    if (child.getAttribute("id") !== nextId) {
      child.setAttribute("id", nextId);
    }
    seenIds.add(nextId);
  });
}

function createNormalizedChildId(tagName: string, index: number) {
  return `${tagName.toLowerCase()}-${index + 1}`;
}
