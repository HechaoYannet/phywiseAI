import type { WorkspaceDocument } from "@phywise/contracts";
import type { WhiteboardNode } from "@phywise/whiteboard-schema";

import { parseObjectRef, parsePhyCanvasObjects, type PhyCanvasObject } from "./board-adapter";

const PHY_CANVAS_PADDING = 16;
const PHY_CANVAS_HEADER_HEIGHT = 30;
const PHY_CANVAS_HEADER_GAP = 12;
const ROTATION_HANDLE_OFFSET_PX = 32;
const AXIS_MIN_LENGTH_PX = 34;
const AXIS_MAX_LENGTH_PX = 116;

export type ResizeHandleId = "nw" | "ne" | "se" | "sw";

export interface PointLike {
  x: number;
  y: number;
}

export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CameraSnapshot {
  x: number;
  y: number;
  zoom: number;
}

export interface TransformGeometry {
  rotation: number;
  center: PointLike;
  pivot: PointLike;
  width: number;
  height: number;
  corners: Record<ResizeHandleId, PointLike>;
  cornerOrder: PointLike[];
  aabb: RectLike;
  axisXUnit: PointLike;
  axisYUnit: PointLike;
  canResize: boolean;
  canRotate: boolean;
}

export interface ScreenTransformGeometry {
  rotation: number;
  center: PointLike;
  pivot: PointLike;
  corners: Record<ResizeHandleId, PointLike>;
  cornerOrder: PointLike[];
  aabb: ScreenRect;
  topEdgeMidpoint: PointLike;
  bottomEdgeMidpoint: PointLike;
  rightEdgeMidpoint: PointLike;
  rotationHandle: PointLike | null;
  resizeHandles: Array<{ id: ResizeHandleId; point: PointLike }>;
  axisX: [PointLike, PointLike];
  axisY: [PointLike, PointLike];
  canResize: boolean;
  canRotate: boolean;
}

export interface ResizeComputation {
  center: PointLike;
  width: number;
  height: number;
}

export function getDocumentBounds(nodes: WhiteboardNode[]): RectLike {
  const bounds = nodes.map((node) => getNodeTransformGeometry(node).aabb);
  const minX = Math.min(...bounds.map((node) => node.x));
  const minY = Math.min(...bounds.map((node) => node.y));
  const maxX = Math.max(...bounds.map((node) => node.x + node.w));
  const maxY = Math.max(...bounds.map((node) => node.y + node.h));
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  };
}

export function getObjectWorldRect(document: WorkspaceDocument, objectRef: string): RectLike | null {
  return getObjectTransformGeometry(document, objectRef)?.aabb ?? null;
}

export function getObjectTransformGeometry(
  document: WorkspaceDocument,
  objectRef: string
): TransformGeometry | null {
  const { nodeId, childId } = parseObjectRef(objectRef);
  const node = document.whiteboard_nodes.find((item) => item.id === nodeId);
  if (!node) {
    return null;
  }
  if (!childId || node.kind !== "phy_canvas") {
    return getNodeTransformGeometry(node);
  }

  const child = parsePhyCanvasObjects(node).find((item) => item.id === childId);
  if (!child) {
    return getNodeTransformGeometry(node);
  }
  return getPhyCanvasChildTransformGeometry(node, child);
}

export function getNodeTransformGeometry(node: WhiteboardNode): TransformGeometry {
  return createTransformGeometry(
    node.rect,
    {
      x: node.rect.x + node.rect.w / 2,
      y: node.rect.y + node.rect.h / 2
    },
    node.rect.rotation ?? 0
  );
}

export function getPhyCanvasChildSceneGeometry(child: PhyCanvasObject): TransformGeometry {
  const width = Math.max(1, child.w);
  const height = Math.max(1, child.h);
  const rect = {
    x: child.x,
    y: child.y,
    w: width,
    h: height
  };

  if (child.kind === "force") {
    return createTransformGeometry(
      rect,
      {
        x: child.x,
        y: child.y + rect.h / 2
      },
      child.rotation ?? 0
    );
  }

  if (child.kind === "label") {
    return createTransformGeometry(rect, { x: child.x, y: child.y }, 0, {
      canResize: false,
      canRotate: false
    });
  }

  return createTransformGeometry(
    rect,
    {
      x: child.x + rect.w / 2,
      y: child.y + rect.h / 2
    },
    child.rotation ?? 0
  );
}

export function getPhyCanvasChildTransformGeometry(
  node: Extract<WhiteboardNode, { kind: "phy_canvas" }>,
  child: PhyCanvasObject
): TransformGeometry {
  const sceneGeometry = getPhyCanvasChildSceneGeometry(child);
  return mapGeometryPoints(sceneGeometry, (point) => phyCanvasScenePointToWorld(node, point));
}

export function getPhyCanvasFrame(node: Extract<WhiteboardNode, { kind: "phy_canvas" }>) {
  const drawableWidth = Math.max(1, node.rect.w - PHY_CANVAS_PADDING * 2);
  const drawableHeight = Math.max(
    1,
    node.rect.h - PHY_CANVAS_PADDING * 2 - PHY_CANVAS_HEADER_HEIGHT - PHY_CANVAS_HEADER_GAP
  );
  const sceneWidth = Math.max(node.payload.bounds.width, 1);
  const sceneHeight = Math.max(node.payload.bounds.height, 1);
  const scale = Math.min(drawableWidth / sceneWidth, drawableHeight / sceneHeight);
  const sceneWidthPx = sceneWidth * scale;
  const sceneHeightPx = sceneHeight * scale;

  return {
    inner: {
      x: PHY_CANVAS_PADDING + (drawableWidth - sceneWidthPx) / 2,
      y: PHY_CANVAS_PADDING + PHY_CANVAS_HEADER_HEIGHT + PHY_CANVAS_HEADER_GAP + (drawableHeight - sceneHeightPx) / 2,
      w: sceneWidthPx,
      h: sceneHeightPx
    },
    scaleX: scale,
    scaleY: scale
  };
}

export function worldPointToPhyCanvasScenePoint(
  node: Extract<WhiteboardNode, { kind: "phy_canvas" }>,
  worldPoint: PointLike
): PointLike {
  const frame = getPhyCanvasFrame(node);
  const localPoint = worldPointToPhyCanvasLocalPoint(node, worldPoint);
  return {
    x: (localPoint.x - frame.inner.x) / frame.scaleX,
    y: (localPoint.y - frame.inner.y) / frame.scaleY
  };
}

export function phyCanvasScenePointToWorld(
  node: Extract<WhiteboardNode, { kind: "phy_canvas" }>,
  scenePoint: PointLike
): PointLike {
  return phyCanvasLocalPointToWorld(node, phyCanvasScenePointToLocal(node, scenePoint));
}

export function phyCanvasScenePointToLocal(
  node: Extract<WhiteboardNode, { kind: "phy_canvas" }>,
  scenePoint: PointLike
): PointLike {
  const frame = getPhyCanvasFrame(node);
  return {
    x: frame.inner.x + scenePoint.x * frame.scaleX,
    y: frame.inner.y + scenePoint.y * frame.scaleY
  };
}

export function worldToScreenPoint(point: PointLike, camera: CameraSnapshot): PointLike {
  return {
    x: (point.x - camera.x) * camera.zoom,
    y: (point.y - camera.y) * camera.zoom
  };
}

export function worldRectToScreenRect(rect: RectLike, camera: CameraSnapshot): ScreenRect {
  return {
    left: (rect.x - camera.x) * camera.zoom,
    top: (rect.y - camera.y) * camera.zoom,
    width: rect.w * camera.zoom,
    height: rect.h * camera.zoom
  };
}

export function projectTransformGeometry(
  geometry: TransformGeometry,
  camera: CameraSnapshot
): ScreenTransformGeometry {
  const corners = {
    nw: worldToScreenPoint(geometry.corners.nw, camera),
    ne: worldToScreenPoint(geometry.corners.ne, camera),
    se: worldToScreenPoint(geometry.corners.se, camera),
    sw: worldToScreenPoint(geometry.corners.sw, camera)
  };
  const topEdgeMidpoint = midpoint(corners.nw, corners.ne);
  const bottomEdgeMidpoint = midpoint(corners.sw, corners.se);
  const rightEdgeMidpoint = midpoint(corners.ne, corners.se);
  const pivot = worldToScreenPoint(geometry.pivot, camera);
  const center = worldToScreenPoint(geometry.center, camera);
  const screenAxisXUnit = normalizeVector(subtract(corners.ne, corners.nw), geometry.axisXUnit);
  const screenAxisYUnit = normalizeVector(subtract(corners.sw, corners.nw), geometry.axisYUnit);
  const edgeWidth = distanceBetween(corners.nw, corners.ne);
  const edgeHeight = distanceBetween(corners.nw, corners.sw);
  const axisLength = clamp(
    Math.min(edgeWidth, edgeHeight) * 0.6,
    AXIS_MIN_LENGTH_PX,
    AXIS_MAX_LENGTH_PX
  );
  const axisHalf = axisLength / 2;
  const rotationHandle = geometry.canRotate
    ? add(rightEdgeMidpoint, scalePoint(screenAxisXUnit, ROTATION_HANDLE_OFFSET_PX))
    : null;

  return {
    rotation: geometry.rotation,
    center,
    pivot,
    corners,
    cornerOrder: [corners.nw, corners.ne, corners.se, corners.sw],
    aabb: worldRectToScreenRect(geometry.aabb, camera),
    topEdgeMidpoint,
    bottomEdgeMidpoint,
    rightEdgeMidpoint,
    rotationHandle,
    resizeHandles: [
      { id: "nw", point: corners.nw },
      { id: "ne", point: corners.ne },
      { id: "se", point: corners.se },
      { id: "sw", point: corners.sw }
    ],
    axisX: [
      subtract(pivot, scalePoint(screenAxisXUnit, axisHalf)),
      add(pivot, scalePoint(screenAxisXUnit, axisHalf))
    ],
    axisY: [
      subtract(pivot, scalePoint(screenAxisYUnit, axisHalf)),
      add(pivot, scalePoint(screenAxisYUnit, axisHalf))
    ],
    canResize: geometry.canResize,
    canRotate: geometry.canRotate
  };
}

export function getSelectionMenuAnchor(geometry: ScreenTransformGeometry): PointLike {
  return geometry.topEdgeMidpoint;
}

export function getMoreMenuAnchor(geometry: ScreenTransformGeometry): PointLike {
  return geometry.bottomEdgeMidpoint;
}

export function resizeTransformGeometry(
  geometry: TransformGeometry,
  handleId: ResizeHandleId,
  pointer: PointLike,
  minimumSize: { w: number; h: number },
  preserveAspectRatio = false
): ResizeComputation {
  const oppositeHandle = getOppositeHandle(handleId);
  const fixedCorner = geometry.corners[oppositeHandle];
  const xSign = handleId === "ne" || handleId === "se" ? 1 : -1;
  const ySign = handleId === "sw" || handleId === "se" ? 1 : -1;
  const pointerVector = subtract(pointer, fixedCorner);
  let width = Math.max(minimumSize.w, xSign * dot(pointerVector, geometry.axisXUnit));
  let height = Math.max(minimumSize.h, ySign * dot(pointerVector, geometry.axisYUnit));

  if (preserveAspectRatio && geometry.width > 0 && geometry.height > 0) {
    const aspect = geometry.width / geometry.height;
    const widthScale = width / geometry.width;
    const heightScale = height / geometry.height;

    if (Math.abs(widthScale - 1) >= Math.abs(heightScale - 1)) {
      height = Math.max(minimumSize.h, width / aspect);
      width = Math.max(minimumSize.w, height * aspect);
    } else {
      width = Math.max(minimumSize.w, height * aspect);
      height = Math.max(minimumSize.h, width / aspect);
    }
  }

  return {
    center: add(
      fixedCorner,
      add(
        scalePoint(geometry.axisXUnit, (xSign * width) / 2),
        scalePoint(geometry.axisYUnit, (ySign * height) / 2)
      )
    ),
    width,
    height
  };
}

export function rotatePoint(point: PointLike, angle: number, origin: PointLike): PointLike {
  if (!angle) {
    return point;
  }

  const radians = (angle * Math.PI) / 180;
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: origin.y + dx * Math.sin(radians) + dy * Math.cos(radians)
  };
}

export function getPhyCanvasChildRotationOrigin(child: PhyCanvasObject): PointLike {
  const width = Math.max(1, child.w);
  const height = Math.max(1, child.h);
  if (child.kind === "force") {
    return { x: 0, y: height / 2 };
  }
  if (child.kind === "body" || child.kind === "surface") {
    return {
      x: width / 2,
      y: height / 2
    };
  }
  return { x: 0, y: 0 };
}

function createTransformGeometry(
  rect: Omit<RectLike, "rotation">,
  pivot: PointLike,
  rotation: number,
  options?: { canResize?: boolean; canRotate?: boolean }
): TransformGeometry {
  const corners = {
    nw: rotatePoint({ x: rect.x, y: rect.y }, rotation, pivot),
    ne: rotatePoint({ x: rect.x + rect.w, y: rect.y }, rotation, pivot),
    se: rotatePoint({ x: rect.x + rect.w, y: rect.y + rect.h }, rotation, pivot),
    sw: rotatePoint({ x: rect.x, y: rect.y + rect.h }, rotation, pivot)
  };
  const center = rotatePoint({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, rotation, pivot);
  const axisXUnit = unitVector(rotation);
  const axisYUnit = unitVector(rotation + 90);

  return {
    rotation,
    center,
    pivot,
    width: rect.w,
    height: rect.h,
    corners,
    cornerOrder: [corners.nw, corners.ne, corners.se, corners.sw],
    aabb: pointsToRect(Object.values(corners)),
    axisXUnit,
    axisYUnit,
    canResize: options?.canResize ?? true,
    canRotate: options?.canRotate ?? true
  };
}

function mapGeometryPoints(
  geometry: TransformGeometry,
  mapper: (point: PointLike) => PointLike
): TransformGeometry {
  const corners = {
    nw: mapper(geometry.corners.nw),
    ne: mapper(geometry.corners.ne),
    se: mapper(geometry.corners.se),
    sw: mapper(geometry.corners.sw)
  };
  const center = mapper(geometry.center);
  const pivot = mapper(geometry.pivot);

  return {
    ...geometry,
    center,
    pivot,
    corners,
    cornerOrder: [corners.nw, corners.ne, corners.se, corners.sw],
    aabb: pointsToRect(Object.values(corners))
  };
}

function worldPointToPhyCanvasLocalPoint(
  node: Extract<WhiteboardNode, { kind: "phy_canvas" }>,
  worldPoint: PointLike
): PointLike {
  const unrotatedWorld = rotatePoint(worldPoint, -(node.rect.rotation ?? 0), {
    x: node.rect.x + node.rect.w / 2,
    y: node.rect.y + node.rect.h / 2
  });
  return {
    x: unrotatedWorld.x - node.rect.x,
    y: unrotatedWorld.y - node.rect.y
  };
}

function phyCanvasLocalPointToWorld(
  node: Extract<WhiteboardNode, { kind: "phy_canvas" }>,
  localPoint: PointLike
): PointLike {
  return rotatePoint(
    {
      x: node.rect.x + localPoint.x,
      y: node.rect.y + localPoint.y
    },
    node.rect.rotation ?? 0,
    {
      x: node.rect.x + node.rect.w / 2,
      y: node.rect.y + node.rect.h / 2
    }
  );
}

function getOppositeHandle(handleId: ResizeHandleId): ResizeHandleId {
  switch (handleId) {
    case "nw":
      return "se";
    case "ne":
      return "sw";
    case "se":
      return "nw";
    case "sw":
    default:
      return "ne";
  }
}

function pointsToRect(points: PointLike[]): RectLike {
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  };
}

function midpoint(first: PointLike, second: PointLike): PointLike {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2
  };
}

function unitVector(angle: number): PointLike {
  const radians = (angle * Math.PI) / 180;
  return {
    x: Math.cos(radians),
    y: Math.sin(radians)
  };
}

function add(first: PointLike, second: PointLike): PointLike {
  return {
    x: first.x + second.x,
    y: first.y + second.y
  };
}

function subtract(first: PointLike, second: PointLike): PointLike {
  return {
    x: first.x - second.x,
    y: first.y - second.y
  };
}

function scalePoint(point: PointLike, scalar: number): PointLike {
  return {
    x: point.x * scalar,
    y: point.y * scalar
  };
}

function dot(first: PointLike, second: PointLike): number {
  return first.x * second.x + first.y * second.y;
}

function distanceBetween(first: PointLike, second: PointLike): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function normalizeVector(point: PointLike, fallback: PointLike): PointLike {
  const length = Math.hypot(point.x, point.y);
  if (length <= 0.0001) {
    return fallback;
  }
  return {
    x: point.x / length,
    y: point.y / length
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
