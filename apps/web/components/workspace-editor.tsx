"use client";

import type { BoardSuggestion, WorkspaceDocument } from "@phywise/contracts";
import type { RichBlockNode, WhiteboardNode } from "@phywise/whiteboard-schema";
import { makeNodeId } from "@phywise/whiteboard-schema";
import type {
  CSSProperties,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  acceptWorkspaceSuggestion,
  analyzeWorkspaceBoard,
  analyzeWorkspaceSource,
  attachWorkspaceSource,
  buildPreviewUrl,
  getWorkspace,
  rejectWorkspaceSuggestion,
  saveWorkspace
} from "../lib/api";
import { MarkdownMath } from "./markdown-math";
import {
  documentToRuntimeShapes,
  findPhyCanvasChild,
  makeChildObjectRef,
  makeNodeObjectRef,
  mutatePhyCanvasScene,
  parseObjectRef,
  type PhyCanvasObject,
  parsePhyCanvasObjects,
  sortNodes
} from "../lib/board-adapter";
import {
  getDocumentBounds,
  getMoreMenuAnchor,
  getObjectTransformGeometry,
  getObjectWorldRect,
  getPhyCanvasChildRotationOrigin,
  getPhyCanvasChildSceneGeometry,
  getSelectionMenuAnchor,
  projectTransformGeometry,
  resizeTransformGeometry,
  type PointLike as Point,
  type RectLike,
  type ResizeHandleId,
  type ScreenRect,
  type ScreenTransformGeometry,
  type TransformGeometry,
  worldPointToPhyCanvasScenePoint,
  worldRectToScreenRect
} from "../lib/board-geometry";
import { type BoardTool, createForceAnalysisTemplate, createNodeFromTool } from "../lib/workspace-presets";

interface WorkspaceEditorProps {
  workspaceId: string;
}

interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

interface SizeLike {
  width: number;
  height: number;
}

interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

type ToolId = Exclude<BoardTool, "import">;

type UiIconName =
  | "cursor"
  | "block"
  | "diagram"
  | "upload"
  | "template"
  | "spark"
  | "undo"
  | "redo"
  | "save"
  | "zoomIn"
  | "zoomOut"
  | "focus"
  | "sidebar"
  | "more"
  | "duplicate"
  | "trash"
  | "layers"
  | "lock"
  | "unlock"
  | "check"
  | "close"
  | "send"
  | "refresh";

type SaveState = "idle" | "dirty" | "saving" | "error";
type AiState = "idle" | "queued" | "analyzing-source" | "analyzing-board" | "error";
type RemoteMutationState = "idle" | "importing" | "accepting" | "rejecting";
type ServerResponseSource =
  | "save"
  | "analyze-board"
  | "analyze-source"
  | "import"
  | "accept-suggestion"
  | "reject-suggestion";

interface CommitOptions {
  persist?: boolean;
  pushHistory?: boolean;
  analyze?: boolean;
  viewport?: CameraState;
  allowWhileLocked?: boolean;
}

interface ServerWorkspaceApplyOptions {
  preserveSelection?: boolean;
  preserveTool?: boolean;
  requestId?: number;
  baseChangeVersion?: number;
  source: ServerResponseSource;
}

type TransformInteractionKind =
  | "drag-node"
  | "resize-node"
  | "rotate-node"
  | "drag-child"
  | "resize-child"
  | "rotate-child";

type InteractionState =
  | {
      kind: "pan";
      pointerId: number;
      start: Point;
      originCamera: CameraState;
      moved: boolean;
    }
  | {
      kind: "pinch";
      pointerIds: [number, number];
      worldPoint: Point;
      originCamera: CameraState;
      startDistance: number;
    }
  | {
      kind: "drag-node";
      pointerId: number;
      nodeId: string;
      start: Point;
      originRect: RectLike;
      snapshot: WorkspaceDocument;
      didMutate: boolean;
    }
  | {
      kind: "resize-node";
      pointerId: number;
      nodeId: string;
      handleId: ResizeHandleId;
      originRect: RectLike;
      originGeometry: TransformGeometry;
      minimumSize: { w: number; h: number };
      snapshot: WorkspaceDocument;
      didMutate: boolean;
    }
  | {
      kind: "rotate-node";
      pointerId: number;
      nodeId: string;
      pivot: Point;
      startPointerAngle: number;
      originRotation: number;
      snapshot: WorkspaceDocument;
      didMutate: boolean;
    }
  | {
      kind: "drag-child";
      pointerId: number;
      nodeId: string;
      childId: string;
      originChild: PhyCanvasObject;
      originPointerScene: Point;
      snapshot: WorkspaceDocument;
      didMutate: boolean;
    }
  | {
      kind: "resize-child";
      pointerId: number;
      nodeId: string;
      childId: string;
      handleId: ResizeHandleId;
      originChild: PhyCanvasObject;
      originGeometry: TransformGeometry;
      minimumSize: { w: number; h: number };
      snapshot: WorkspaceDocument;
      didMutate: boolean;
    }
  | {
      kind: "rotate-child";
      pointerId: number;
      nodeId: string;
      childId: string;
      originChild: PhyCanvasObject;
      pivotScene: Point;
      startPointerAngle: number;
      originRotation: number;
      snapshot: WorkspaceDocument;
      didMutate: boolean;
    };

const WORLD_WIDTH = 5200;
const WORLD_HEIGHT = 3600;
const GRID_STEP = 24;
const GRID_MAJOR_STEP = GRID_STEP * 4;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.6;
const AUTOSAVE_DELAY = 900;
const ANALYZE_DELAY = 1400;
const MAX_HISTORY = 40;
const DEFAULT_CAMERA: CameraState = { x: 120, y: 80, zoom: 1 };
const DEFAULT_VIEWPORT_SIZE: SizeLike = { width: 240, height: 180 };

const TOOLS: Array<{ id: ToolId; icon: UiIconName; label: string; hint: string }> = [
  { id: "select", icon: "cursor", label: "选择", hint: "拖拽对象或拖动画布" },
  { id: "block", icon: "block", label: "内容", hint: "直接写题意、条件、推导" },
  { id: "diagram", icon: "diagram", label: "受力图", hint: "插入受力分析画布" }
];

function UiIcon({ name, className }: { name: UiIconName; className?: string }) {
  const strokeProps = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };

  switch (name) {
    case "cursor":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <path d="m5 4 11 8.5-5 .8 2.1 5.6-3 1.1L8 14.4 5 17V4Z" {...strokeProps} />
        </svg>
      );
    case "block":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <rect x="4" y="5" width="16" height="14" rx="3" {...strokeProps} />
          <path d="M8 9h8" {...strokeProps} />
          <path d="M8 13h6" {...strokeProps} />
        </svg>
      );
    case "diagram":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <path d="M4 18h16" {...strokeProps} />
          <path d="M6 16 18 9" {...strokeProps} />
          <rect x="9.5" y="7.5" width="5" height="5" rx="1.4" {...strokeProps} />
        </svg>
      );
    case "upload":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <path d="M12 4v9" {...strokeProps} />
          <path d="m8.5 8.5 3.5-3.5 3.5 3.5" {...strokeProps} />
          <path d="M4.5 15.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" {...strokeProps} />
        </svg>
      );
    case "template":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <rect x="4" y="4" width="7" height="7" rx="1.4" {...strokeProps} />
          <rect x="13" y="4" width="7" height="7" rx="1.4" {...strokeProps} />
          <rect x="4" y="13" width="7" height="7" rx="1.4" {...strokeProps} />
          <path d="M16.5 13v7" {...strokeProps} />
          <path d="M13 16.5h7" {...strokeProps} />
        </svg>
      );
    case "spark":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" {...strokeProps} />
          <path d="m18 16 .7 1.8L20.5 18l-1.8.7L18 20.5l-.7-1.8L15.5 18l1.8-.7L18 16Z" {...strokeProps} />
        </svg>
      );
    case "undo":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <path d="M9 8H5v-4" {...strokeProps} />
          <path d="M5 8a8 8 0 1 1 2.4 10.9" {...strokeProps} />
        </svg>
      );
    case "redo":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <path d="M15 8h4v-4" {...strokeProps} />
          <path d="M19 8a8 8 0 1 0-2.4 10.9" {...strokeProps} />
        </svg>
      );
    case "save":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <path d="M6 4h10l3 3v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 1-2Z" {...strokeProps} />
          <path d="M8 4v6h8V4" {...strokeProps} />
          <path d="M9 16h6" {...strokeProps} />
        </svg>
      );
    case "zoomIn":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <circle cx="10.5" cy="10.5" r="5.5" {...strokeProps} />
          <path d="M21 21l-5.1-5.1" {...strokeProps} />
          <path d="M10.5 8v5" {...strokeProps} />
          <path d="M8 10.5h5" {...strokeProps} />
        </svg>
      );
    case "zoomOut":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <circle cx="10.5" cy="10.5" r="5.5" {...strokeProps} />
          <path d="M21 21l-5.1-5.1" {...strokeProps} />
          <path d="M8 10.5h5" {...strokeProps} />
        </svg>
      );
    case "focus":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <path d="M4 9V5h4" {...strokeProps} />
          <path d="M20 9V5h-4" {...strokeProps} />
          <path d="M4 15v4h4" {...strokeProps} />
          <path d="M20 15v4h-4" {...strokeProps} />
          <circle cx="12" cy="12" r="2.5" {...strokeProps} />
        </svg>
      );
    case "sidebar":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <rect x="4" y="4" width="16" height="16" rx="3" {...strokeProps} />
          <path d="M15 4v16" {...strokeProps} />
        </svg>
      );
    case "more":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <circle cx="6" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="18" cy="12" r="1.5" fill="currentColor" />
        </svg>
      );
    case "duplicate":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <rect x="8" y="8" width="11" height="11" rx="2.2" {...strokeProps} />
          <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" {...strokeProps} />
        </svg>
      );
    case "trash":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <path d="M4 7h16" {...strokeProps} />
          <path d="M9 7V5h6v2" {...strokeProps} />
          <path d="m7 7 1 12h8l1-12" {...strokeProps} />
        </svg>
      );
    case "layers":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <path d="m12 4 8 4-8 4-8-4 8-4Z" {...strokeProps} />
          <path d="m4 12 8 4 8-4" {...strokeProps} />
          <path d="m4 16 8 4 8-4" {...strokeProps} />
        </svg>
      );
    case "lock":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <rect x="5" y="11" width="14" height="9" rx="2" {...strokeProps} />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" {...strokeProps} />
        </svg>
      );
    case "unlock":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <rect x="5" y="11" width="14" height="9" rx="2" {...strokeProps} />
          <path d="M8 11V8a4 4 0 0 1 7-2.6" {...strokeProps} />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <path d="m5 13 4 4L19 7" {...strokeProps} />
        </svg>
      );
    case "close":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <path d="M6 6l12 12" {...strokeProps} />
          <path d="M18 6 6 18" {...strokeProps} />
        </svg>
      );
    case "send":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <path d="m4 20 16-8L4 4l3.5 8L4 20Z" {...strokeProps} />
          <path d="M7.5 12H20" {...strokeProps} />
        </svg>
      );
    case "refresh":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
          <path d="M3 12a9 9 0 1 0 2.6-6.3" {...strokeProps} />
          <path d="M3 4v5h5" {...strokeProps} />
        </svg>
      );
    default:
      return null;
  }
}

export function WorkspaceEditor({ workspaceId }: WorkspaceEditorProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const topbarRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<WorkspaceDocument | null>(null);
  const cameraRef = useRef<CameraState>(DEFAULT_CAMERA);
  const interactionRef = useRef<InteractionState | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const analyzeTimerRef = useRef<number | null>(null);
  const viewportPersistTimerRef = useRef<number | null>(null);
  const selectionHudTimerRef = useRef<number | null>(null);
  const changeVersionRef = useRef(0);
  const requestSeqRef = useRef(0);
  const lastAppliedRequestRef = useRef(0);
  const savePromiseRef = useRef<Promise<WorkspaceDocument | null> | null>(null);
  const saveStateRef = useRef<SaveState>("idle");
  const remoteMutationLockRef = useRef(false);
  const editingBaselineRef = useRef<Record<string, WorkspaceDocument>>({});

  const [workspace, setWorkspace] = useState<WorkspaceDocument | null>(null);
  const [camera, setCamera] = useState<CameraState>(DEFAULT_CAMERA);
  const [historyPast, setHistoryPast] = useState<WorkspaceDocument[]>([]);
  const [historyFuture, setHistoryFuture] = useState<WorkspaceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [aiState, setAiState] = useState<AiState>("idle");
  const [remoteMutationState, setRemoteMutationState] = useState<RemoteMutationState>("idle");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [importMode, setImportMode] = useState<"text" | "file">("text");
  const [importText, setImportText] = useState("");
  const [importFilename, setImportFilename] = useState("problem.md");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [selectionHudVisible, setSelectionHudVisible] = useState(false);
  const [activeTransform, setActiveTransform] = useState<TransformInteractionKind | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("wb-no-scroll");
    return () => {
      document.body.classList.remove("wb-no-scroll");
    };
  }, []);

  useEffect(() => {
    const compactQuery = window.matchMedia("(max-width: 820px)");
    const applyCompactSidebarState = () => {
      setSidebarCollapsed(compactQuery.matches);
    };

    applyCompactSidebarState();
    compactQuery.addEventListener("change", applyCompactSidebarState);
    return () => {
      compactQuery.removeEventListener("change", applyCompactSidebarState);
    };
  }, []);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await getWorkspace(workspaceId);
        if (cancelled) {
          return;
        }

        const normalized = normalizeDocument(result);
        changeVersionRef.current = 0;
        requestSeqRef.current = 0;
        lastAppliedRequestRef.current = 0;
        savePromiseRef.current = null;
        remoteMutationLockRef.current = false;
        setWorkspaceSnapshot(normalized);
        setCameraState(normalized.viewport ?? DEFAULT_CAMERA, { persist: false });
        setHistoryPast([]);
        setHistoryFuture([]);
        updateSaveState("idle");
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(toMessage(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspace || saveState !== "dirty") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void saveCurrentWorkspace();
    }, AUTOSAVE_DELAY);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [workspace, saveState, workspaceId]);

  useEffect(() => {
    if (!workspace) {
      return;
    }

    const pendingIds = new Set(workspace.suggestions.map((item) => item.id));
    if (selectedSuggestionId && !pendingIds.has(selectedSuggestionId)) {
      setSelectedSuggestionId(null);
    }
  }, [workspace, selectedSuggestionId]);

  useEffect(() => {
    return () => {
      if (analyzeTimerRef.current) {
        window.clearTimeout(analyzeTimerRef.current);
      }
      if (viewportPersistTimerRef.current) {
        window.clearTimeout(viewportPersistTimerRef.current);
      }
      if (selectionHudTimerRef.current) {
        window.clearTimeout(selectionHudTimerRef.current);
      }
    };
  }, []);

  const runtimeShapes = useMemo(() => (workspace ? documentToRuntimeShapes(workspace) : []), [workspace]);
  const selectedObjectRef = workspace?.selection_state.selected_object_refs?.[0] ?? null;
  const selectedNode = useMemo(() => {
    if (!workspace || !selectedObjectRef) {
      return null;
    }
    const { nodeId } = parseObjectRef(selectedObjectRef);
    return workspace.whiteboard_nodes.find((node) => node.id === nodeId) ?? null;
  }, [workspace, selectedObjectRef]);
  const selectedNodeRef = selectedNode ? makeNodeObjectRef(selectedNode.id) : null;
  const selectedNodeIsTopLevel = !!selectedObjectRef && selectedObjectRef === selectedNodeRef;
  const selectedChild = useMemo(() => {
    if (!selectedObjectRef || !selectedNode || selectedNode.kind !== "phy_canvas") {
      return null;
    }
    const { childId } = parseObjectRef(selectedObjectRef);
    if (!childId) {
      return null;
    }
    return parsePhyCanvasObjects(selectedNode).find((item) => item.id === childId) ?? null;
  }, [selectedNode, selectedObjectRef]);
  const activeTool = (workspace?.selection_state.active_tool as ToolId | undefined) ?? "select";
  const pendingSuggestions = workspace?.suggestions.filter((item) => item.status === "pending") ?? [];
  const selectedSuggestion =
    pendingSuggestions.find((item) => item.id === selectedSuggestionId) ?? pendingSuggestions[0] ?? null;

  useEffect(() => {
    if (!selectedObjectRef) {
      if (selectionHudTimerRef.current) {
        window.clearTimeout(selectionHudTimerRef.current);
      }
      setSelectionHudVisible(false);
      setMoreMenuOpen(false);
    }
  }, [selectedObjectRef]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = isNativeTextInputTarget(target);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveCurrentWorkspace(true);
        return;
      }

      if (isTypingTarget) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }

      if (((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "z") ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y")) {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (!isTypingTarget && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        removeSelectedObject();
        return;
      }

      if (event.key === "Escape") {
        setImportSheetOpen(false);
        setMoreMenuOpen(false);
        setSidebarCollapsed(false);
        updateSelection([], false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [historyPast, historyFuture, saveState, selectedNode, selectedNodeIsTopLevel, selectedObjectRef, workspace]);

  const suggestionMarkers = useMemo(() => {
    if (!workspace) {
      return [];
    }

    return pendingSuggestions
      .map((suggestion) => {
        const targetRef = suggestion.target_object_refs[0];
        const geometry = targetRef ? getObjectTransformGeometry(workspace, targetRef) : null;
        if (!geometry) {
          return null;
        }
        const screenRect = worldRectToScreenRect(geometry.aabb, camera);
        return {
          id: suggestion.id,
          suggestion,
          left: screenRect.left + screenRect.width - 12,
          top: screenRect.top - 12,
          active: selectedSuggestionId === suggestion.id
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      suggestion: BoardSuggestion;
      left: number;
      top: number;
      active: boolean;
    }>;
  }, [camera, pendingSuggestions, selectedSuggestionId, workspace]);

  const selectionGeometry = useMemo(() => {
    if (!workspace || !selectedObjectRef) {
      return null;
    }
    return getObjectTransformGeometry(workspace, selectedObjectRef);
  }, [workspace, selectedObjectRef]);

  const selectionWorldRect = selectionGeometry?.aabb ?? null;

  const selectionScreenGeometry = useMemo(() => {
    if (!selectionGeometry) {
      return null;
    }
    return projectTransformGeometry(selectionGeometry, camera);
  }, [camera, selectionGeometry]);

  const selectionScreenRect = selectionScreenGeometry?.aabb ?? null;

  function getViewportSize(): SizeLike {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) {
      return DEFAULT_VIEWPORT_SIZE;
    }
    return { width: rect.width, height: rect.height };
  }

  function getCurrentOverlaySafeInsets(
    viewportRect: DOMRect | null = viewportRef.current?.getBoundingClientRect() ?? null
  ) {
    return getOverlaySafeInsets(
      viewportRect,
      topbarRef.current?.getBoundingClientRect() ?? null,
      dockRef.current?.getBoundingClientRect() ?? null,
      sidebarRef.current?.getBoundingClientRect() ?? null
    );
  }

  function setWorkspaceSnapshot(nextDocument: WorkspaceDocument) {
    workspaceRef.current = nextDocument;
    setWorkspace(nextDocument);
  }

  function updateSaveState(nextState: SaveState) {
    saveStateRef.current = nextState;
    setSaveState(nextState);
  }

  function setCameraState(nextCamera: CameraState, options?: { persist?: boolean }) {
    const clampedCamera = clampCamera(nextCamera, getViewportSize());
    cameraRef.current = clampedCamera;
    setCamera(clampedCamera);
    if (options?.persist !== false && !remoteMutationLockRef.current) {
      scheduleViewportPersist(clampedCamera);
    }
  }

  function scheduleViewportPersist(nextViewport: CameraState) {
    if (!workspaceRef.current) {
      return;
    }

    if (viewportPersistTimerRef.current) {
      window.clearTimeout(viewportPersistTimerRef.current);
    }

    viewportPersistTimerRef.current = window.setTimeout(() => {
      const current = workspaceRef.current;
      if (!current || sameCamera(current.viewport, nextViewport)) {
        return;
      }

      commitWorkspace(
        (document) => ({
          ...document,
          viewport: nextViewport
        }),
        { persist: true, viewport: nextViewport }
      );
    }, 260);
  }

  function snapshotCurrentWorkspace(current = workspaceRef.current) {
    if (!current) {
      return null;
    }
    return normalizeDocument({
      ...cloneDocument(current),
      viewport: cameraRef.current
    });
  }

  function nextRequestId() {
    requestSeqRef.current += 1;
    lastAppliedRequestRef.current = Math.max(lastAppliedRequestRef.current, requestSeqRef.current);
    return requestSeqRef.current;
  }

  async function flushCurrentWorkspace(force = false) {
    if (savePromiseRef.current) {
      await savePromiseRef.current;
    }

    if (force || saveStateRef.current === "dirty") {
      const saved = await saveCurrentWorkspace(force);
      if (!saved && saveStateRef.current === "error") {
        throw new Error("当前板面保存失败，已取消后续服务端操作。");
      }
    }

    return workspaceRef.current;
  }

  async function runLockedRemoteMutation<T>(
    state: Exclude<RemoteMutationState, "idle">,
    task: () => Promise<T>
  ) {
    remoteMutationLockRef.current = true;
    setRemoteMutationState(state);
    try {
      await flushCurrentWorkspace(true);
      return await task();
    } finally {
      remoteMutationLockRef.current = false;
      setRemoteMutationState("idle");
    }
  }

  async function saveCurrentWorkspace(force = false) {
    const current = workspaceRef.current;
    if (!current) {
      return null;
    }

    if (!force && saveStateRef.current !== "dirty") {
      return current;
    }

    if (savePromiseRef.current) {
      await savePromiseRef.current;
      if (saveStateRef.current !== "dirty") {
        return workspaceRef.current;
      }
    }

    const snapshot = snapshotCurrentWorkspace(current);
    if (!snapshot) {
      return null;
    }

    const saveVersion = changeVersionRef.current;
    const requestId = nextRequestId();
    updateSaveState("saving");

    let requestPromise: Promise<WorkspaceDocument | null> | null = null;
    requestPromise = (async () => {
      try {
        const result = await saveWorkspace(workspaceId, { document: snapshot });
        applyServerWorkspace(result, {
          source: "save",
          requestId,
          baseChangeVersion: saveVersion,
          preserveSelection: true,
          preserveTool: true
        });
        updateSaveState(changeVersionRef.current === saveVersion ? "idle" : "dirty");
        return result;
      } catch (error) {
        updateSaveState("error");
        setErrorMessage(toMessage(error));
        return null;
      } finally {
        if (savePromiseRef.current === requestPromise) {
          savePromiseRef.current = null;
        }
      }
    })();

    savePromiseRef.current = requestPromise;
    return requestPromise;
  }

  function scheduleBoardAnalysis(delay = ANALYZE_DELAY) {
    if (!workspaceRef.current) {
      return;
    }

    if (analyzeTimerRef.current) {
      window.clearTimeout(analyzeTimerRef.current);
    }

    setAiState("queued");
    analyzeTimerRef.current = window.setTimeout(() => {
      void runBoardAnalysis();
    }, delay);
  }

  async function runBoardAnalysis() {
    const current = workspaceRef.current;
    if (!current || remoteMutationLockRef.current) {
      return;
    }

    if (analyzeTimerRef.current) {
      window.clearTimeout(analyzeTimerRef.current);
      analyzeTimerRef.current = null;
    }

    setAiState("analyzing-board");
    try {
      await flushCurrentWorkspace();
      const latest = workspaceRef.current;
      if (!latest) {
        return;
      }

      const analysisVersion = changeVersionRef.current;
      const requestId = nextRequestId();
      const result = await analyzeWorkspaceBoard(workspaceId, {
        selected_object_refs: latest.selection_state.selected_object_refs ?? []
      });
      const applied = applyServerWorkspace(result, {
        source: "analyze-board",
        requestId,
        baseChangeVersion: analysisVersion,
        preserveSelection: true,
        preserveTool: true
      });
      if (!applied && changeVersionRef.current !== analysisVersion) {
        setAiState("queued");
        scheduleBoardAnalysis(ANALYZE_DELAY);
        return;
      }
      setAiState("idle");
    } catch (error) {
      setAiState("error");
      setErrorMessage(toMessage(error));
    }
  }

  function applyServerWorkspace(
    nextDocument: WorkspaceDocument,
    options: ServerWorkspaceApplyOptions
  ) {
    if (typeof options.requestId === "number" && options.requestId < lastAppliedRequestRef.current) {
      return false;
    }

    const current = workspaceRef.current;
    const normalized = normalizeDocument(nextDocument);
    const hasLocalDivergence =
      typeof options.baseChangeVersion === "number" &&
      changeVersionRef.current !== options.baseChangeVersion;

    if (typeof options.requestId === "number") {
      lastAppliedRequestRef.current = options.requestId;
    }

    if (hasLocalDivergence) {
      if (options.source === "save") {
        if (current) {
          setWorkspaceSnapshot({
            ...current,
            updated_at: normalized.updated_at,
            revision_id: normalized.revision_id
          });
        }
        return false;
      }

      if (options.source === "analyze-board") {
        return false;
      }
    }

    const nextSelection = options?.preserveSelection
      ? resolveSelection(normalized, current?.selection_state.selected_object_refs ?? [])
      : normalized.selection_state.selected_object_refs;

    const merged: WorkspaceDocument = {
      ...normalized,
      viewport: cameraRef.current,
      selection_state: {
        ...normalized.selection_state,
        selected_object_refs: nextSelection,
        active_tool:
          options?.preserveTool
            ? current?.selection_state.active_tool ?? normalized.selection_state.active_tool ?? "select"
            : normalized.selection_state.active_tool ?? "select"
      }
    };

    setWorkspaceSnapshot(merged);
    return true;
  }

  function commitWorkspace(
    updater: (document: WorkspaceDocument) => WorkspaceDocument,
    options?: CommitOptions
  ) {
    const current = workspaceRef.current;
    if (!current) {
      return;
    }

    if (remoteMutationLockRef.current && !options?.allowWhileLocked) {
      return;
    }

    const snapshot = cloneDocument(current);
    const nextDocument = normalizeDocument(updater(cloneDocument(current)));
    nextDocument.viewport = options?.viewport ?? cameraRef.current;
    setWorkspaceSnapshot(nextDocument);

    if (options?.pushHistory) {
      pushHistorySnapshot(snapshot);
    }

    if (options?.persist) {
      changeVersionRef.current += 1;
      updateSaveState("dirty");
    }

    if (options?.analyze) {
      scheduleBoardAnalysis();
    }
  }

  function pushHistorySnapshot(snapshot: WorkspaceDocument) {
    setHistoryPast((previous) => [...previous.slice(-(MAX_HISTORY - 1)), cloneDocument(snapshot)]);
    setHistoryFuture([]);
  }

  function hideSelectionHud() {
    if (selectionHudTimerRef.current) {
      window.clearTimeout(selectionHudTimerRef.current);
      selectionHudTimerRef.current = null;
    }
    setSelectionHudVisible(false);
    setMoreMenuOpen(false);
  }

  function revealSelectionHud(duration = 1400) {
    if (selectionHudTimerRef.current) {
      window.clearTimeout(selectionHudTimerRef.current);
      selectionHudTimerRef.current = null;
    }
    setSelectionHudVisible(true);
    if (duration > 0) {
      selectionHudTimerRef.current = window.setTimeout(() => {
        setSelectionHudVisible(false);
        setMoreMenuOpen(false);
        selectionHudTimerRef.current = null;
      }, duration);
    }
  }

  function updateSelection(selectedRefs: string[], persist = false) {
    commitWorkspace(
      (document) => ({
        ...document,
        selection_state: {
          ...document.selection_state,
          selected_object_refs: resolveSelection(document, selectedRefs)
        }
      }),
      { persist, allowWhileLocked: true }
    );
    setMoreMenuOpen(false);
    if (selectedRefs.length === 0) {
      hideSelectionHud();
    }
  }

  function updateActiveTool(tool: ToolId) {
    commitWorkspace(
      (document) => ({
        ...document,
        selection_state: {
          ...document.selection_state,
          active_tool: tool
        }
      }),
      { allowWhileLocked: true }
    );
  }

  function claimPointerForInteraction(event: ReactPointerEvent<HTMLElement | SVGElement>) {
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some synthetic or cancelled pointer streams cannot be captured.
    }
  }

  function releaseInteractionPointer(event: ReactPointerEvent<HTMLElement | SVGElement>) {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture is best-effort; finish the interaction state regardless.
    }
  }

  function insertNodeAt(worldPoint: Point, tool: Exclude<ToolId, "select">) {
    const anchorX = Math.max(48, worldPoint.x - (tool === "diagram" ? 180 : 140));
    const anchorY = Math.max(48, worldPoint.y - (tool === "diagram" ? 120 : 90));
    const nextNode = createNodeFromTool(tool, anchorX, anchorY);
    commitWorkspace(
      (document) => {
        const elevatedNode = {
          ...nextNode,
          z_index: getNextNodeZIndex(document, 1)[0]
        };
        return {
          ...document,
          whiteboard_nodes: sortNodes([...document.whiteboard_nodes, elevatedNode]),
          selection_state: {
            ...document.selection_state,
            selected_object_refs: [makeNodeObjectRef(elevatedNode.id)],
            active_tool: "select"
          }
        };
      },
      { persist: true, pushHistory: true, analyze: true }
    );
  }

  function insertBlankStartNode() {
    const viewportRect = viewportRef.current?.getBoundingClientRect() ?? null;
    const insets = getCurrentOverlaySafeInsets(viewportRect);
    const usableWidth = Math.max(120, (viewportRect?.width ?? DEFAULT_VIEWPORT_SIZE.width) - insets.left - insets.right);
    const usableHeight = Math.max(
      120,
      (viewportRect?.height ?? DEFAULT_VIEWPORT_SIZE.height) - insets.top - insets.bottom
    );
    const screenPoint = {
      x: insets.left + usableWidth / 2,
      y: insets.top + usableHeight / 2
    };
    const worldPoint = viewportRect
      ? screenToWorldPoint(
          viewportRect.left + screenPoint.x,
          viewportRect.top + screenPoint.y,
          viewportRect,
          cameraRef.current
        )
      : {
          x: cameraRef.current.x + screenPoint.x / cameraRef.current.zoom,
          y: cameraRef.current.y + screenPoint.y / cameraRef.current.zoom
        };

    insertNodeAt(worldPoint, "block");
  }

  function insertTemplate() {
    const current = workspaceRef.current;
    if (!current) {
      return;
    }

    const rebasedTemplate = rebaseNodeStack(current, createForceAnalysisTemplate());
    const currentBounds = current.whiteboard_nodes.length > 0 ? getDocumentBounds(current.whiteboard_nodes) : null;
    const templateBounds = getDocumentBounds(rebasedTemplate);
    const templateOffsetX =
      currentBounds && currentBounds.w > 0
        ? Math.max(0, currentBounds.x + currentBounds.w + 80 - templateBounds.x)
        : 0;
    const shiftedTemplate = templateOffsetX
      ? rebasedTemplate.map((node) => ({
          ...node,
          rect: {
            ...node.rect,
            x: node.rect.x + templateOffsetX
          }
        }))
      : rebasedTemplate;
    const nextNodes = sortNodes([...current.whiteboard_nodes, ...shiftedTemplate]);
    const viewportRect = viewportRef.current?.getBoundingClientRect() ?? null;
    const nextCamera = viewportRect
      ? fitCameraToNodes(nextNodes, viewportRect, getCurrentOverlaySafeInsets(viewportRect))
      : cameraRef.current;

    commitWorkspace(
      (document) => ({
        ...document,
        whiteboard_nodes: nextNodes,
        selection_state: {
          ...document.selection_state,
          selected_object_refs: [],
          active_tool: "select"
        }
      }),
      { persist: true, pushHistory: true, analyze: true, viewport: nextCamera }
    );
    setCameraState(nextCamera);
  }

  function removeSelectedObject() {
    if (!workspaceRef.current || !selectedObjectRef) {
      return;
    }

    commitWorkspace(
      (document) => removeObjectReference(document, selectedObjectRef),
      { persist: true, pushHistory: true, analyze: true }
    );
    setSelectedSuggestionId(null);
  }

  function duplicateSelectedNode() {
    if (!workspaceRef.current || !selectedNode || !selectedNodeIsTopLevel) {
      return;
    }

    commitWorkspace(
      (document) => duplicateNode(document, selectedNode.id),
      { persist: true, pushHistory: true, analyze: true }
    );
  }

  function bringSelectionForward() {
    if (!selectedNode || !selectedNodeIsTopLevel) {
      return;
    }

    commitWorkspace(
      (document) => setNodeOrder(document, selectedNode.id, "front"),
      { persist: true, pushHistory: true }
    );
    setMoreMenuOpen(false);
  }

  function sendSelectionBackward() {
    if (!selectedNode || !selectedNodeIsTopLevel) {
      return;
    }

    commitWorkspace(
      (document) => setNodeOrder(document, selectedNode.id, "back"),
      { persist: true, pushHistory: true }
    );
    setMoreMenuOpen(false);
  }

  function toggleSelectionLock() {
    if (!selectedNode || !selectedNodeIsTopLevel) {
      return;
    }

    commitWorkspace(
      (document) => toggleNodeLock(document, selectedNode.id),
      { persist: true, pushHistory: true }
    );
    setMoreMenuOpen(false);
  }

  function focusSelection() {
    if (!selectionWorldRect || !viewportRef.current) {
      return;
    }

    const viewportRect = viewportRef.current.getBoundingClientRect();
    setCameraState(
      focusCameraOnRect(selectionWorldRect, camera.zoom, viewportRect, getCurrentOverlaySafeInsets(viewportRect))
    );
  }

  function fitAll() {
    if (!workspaceRef.current || !viewportRef.current) {
      return;
    }

    const nodes = workspaceRef.current.whiteboard_nodes;
    if (!nodes.length) {
      setCameraState(DEFAULT_CAMERA);
      return;
    }

    const viewportRect = viewportRef.current.getBoundingClientRect();
    setCameraState(fitCameraToNodes(nodes, viewportRect, getCurrentOverlaySafeInsets(viewportRect)));
  }

  function zoomAt(clientX: number, clientY: number, nextZoom: number) {
    if (!viewportRef.current) {
      return;
    }

    const viewport = viewportRef.current.getBoundingClientRect();
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const worldPoint = screenToWorldPoint(clientX, clientY, viewport, cameraRef.current);
    const nextCamera = clampCamera({
      x: worldPoint.x - (clientX - viewport.left) / clampedZoom,
      y: worldPoint.y - (clientY - viewport.top) / clampedZoom,
      zoom: clampedZoom
    }, getViewportSize());
    setCameraState(nextCamera);
  }

  function zoomBy(delta: number) {
    if (!viewportRef.current) {
      return;
    }

    const viewport = viewportRef.current.getBoundingClientRect();
    zoomAt(viewport.left + viewport.width / 2, viewport.top + viewport.height / 2, camera.zoom + delta);
  }

  function handleViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!workspaceRef.current) {
      return;
    }

    if (interactionRef.current) {
      return;
    }

    if (event.button !== 0 && event.pointerType === "mouse") {
      return;
    }

    const viewport = viewportRef.current?.getBoundingClientRect();
    if (!viewport) {
      return;
    }

    const target = event.target as HTMLElement;
    if (isNativeTextInputTarget(target)) {
      return;
    }

    event.preventDefault();

    if (activeTool !== "select") {
      if (!event.isPrimary || pointersRef.current.size > 0) {
        return;
      }
      if (target.closest(".wb-node, .wb-selection-gizmo, .wb-selection-angle, .wb-selection-menu, .wb-more-menu")) {
        return;
      }
      const worldPoint = screenToWorldPoint(event.clientX, event.clientY, viewport, cameraRef.current);
      insertNodeAt(worldPoint, activeTool);
      return;
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Continue even if the browser cannot capture this pointer stream.
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size >= 2) {
      const pointerEntries = Array.from(pointersRef.current.entries()).slice(0, 2);
      const first = pointerEntries[0];
      const second = pointerEntries[1];
      const midpoint = {
        x: (first[1].x + second[1].x) / 2,
        y: (first[1].y + second[1].y) / 2
      };
      interactionRef.current = {
        kind: "pinch",
        pointerIds: [first[0], second[0]],
        worldPoint: screenToWorldPoint(midpoint.x, midpoint.y, viewport, cameraRef.current),
        originCamera: cameraRef.current,
        startDistance: distanceBetween(first[1], second[1])
      };
      return;
    }

    interactionRef.current = {
      kind: "pan",
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      originCamera: cameraRef.current,
      moved: false
    };
  }

  function handleViewportPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;
    if (!interaction || !viewportRef.current) {
      return;
    }

    event.preventDefault();
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (interaction.kind === "pan" && interaction.pointerId === event.pointerId) {
      const dx = event.clientX - interaction.start.x;
      const dy = event.clientY - interaction.start.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        interaction.moved = true;
      }
      setCameraState({
        x: interaction.originCamera.x - dx / interaction.originCamera.zoom,
        y: interaction.originCamera.y - dy / interaction.originCamera.zoom,
        zoom: interaction.originCamera.zoom
      });
      return;
    }

    if (interaction.kind === "pinch") {
      const first = pointersRef.current.get(interaction.pointerIds[0]);
      const second = pointersRef.current.get(interaction.pointerIds[1]);
      if (!first || !second) {
        return;
      }

      const viewport = viewportRef.current.getBoundingClientRect();
      const midpoint = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2
      };
      const ratio = distanceBetween(first, second) / interaction.startDistance;
      const nextZoom = clamp(interaction.originCamera.zoom * ratio, MIN_ZOOM, MAX_ZOOM);
      const nextCamera = clampCamera({
        x: interaction.worldPoint.x - (midpoint.x - viewport.left) / nextZoom,
        y: interaction.worldPoint.y - (midpoint.y - viewport.top) / nextZoom,
        zoom: nextZoom
      }, getViewportSize());
      setCameraState(nextCamera);
    }
  }

  function handleViewportPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    pointersRef.current.delete(event.pointerId);
    const interaction = interactionRef.current;

    if (interaction?.kind === "pinch") {
      const remaining = Array.from(pointersRef.current.entries())[0];
      if (remaining) {
        interactionRef.current = {
          kind: "pan",
          pointerId: remaining[0],
          start: remaining[1],
          originCamera: cameraRef.current,
          moved: false
        };
      } else {
        interactionRef.current = null;
      }
      return;
    }

    if (interaction?.kind === "pan" && interaction.pointerId === event.pointerId && !interaction.moved) {
      updateSelection([], false);
    }

    interactionRef.current = null;
    setActiveTransform(null);
    releaseInteractionPointer(event);
  }

  function startNodeDrag(event: ReactPointerEvent<HTMLElement>, node: WhiteboardNode) {
    if (activeTool !== "select" || node.locked || interactionRef.current) {
      return;
    }

    const target = event.target as HTMLElement;
    if (isNativeTextInputTarget(target)) {
      event.stopPropagation();
      return;
    }

    claimPointerForInteraction(event);
    hideSelectionHud();
    setActiveTransform("drag-node");
    updateSelection([makeNodeObjectRef(node.id)], false);
    interactionRef.current = {
      kind: "drag-node",
      pointerId: event.pointerId,
      nodeId: node.id,
      start: { x: event.clientX, y: event.clientY },
      originRect: node.rect,
      snapshot: cloneDocument(workspaceRef.current!),
      didMutate: false
    };
  }

  function startNodeResize(
    event: ReactPointerEvent<HTMLButtonElement>,
    node: WhiteboardNode,
    handleId: ResizeHandleId
  ) {
    if (node.locked || !workspaceRef.current || interactionRef.current) {
      return;
    }

    const originGeometry = getObjectTransformGeometry(workspaceRef.current, makeNodeObjectRef(node.id));
    if (!originGeometry) {
      return;
    }

    claimPointerForInteraction(event);
    hideSelectionHud();
    setActiveTransform("resize-node");
    interactionRef.current = {
      kind: "resize-node",
      pointerId: event.pointerId,
      nodeId: node.id,
      handleId,
      originRect: node.rect,
      originGeometry,
      minimumSize: minNodeSize(node.kind),
      snapshot: cloneDocument(workspaceRef.current!),
      didMutate: false
    };
  }

  function startNodeRotate(event: ReactPointerEvent<HTMLButtonElement>, node: WhiteboardNode) {
    if (!viewportRef.current || node.locked || !workspaceRef.current || interactionRef.current) {
      return;
    }

    const originGeometry = getObjectTransformGeometry(workspaceRef.current, makeNodeObjectRef(node.id));
    if (!originGeometry) {
      return;
    }

    claimPointerForInteraction(event);
    hideSelectionHud();
    setActiveTransform("rotate-node");
    const viewport = viewportRef.current.getBoundingClientRect();
    const pointerWorld = screenToWorldPoint(event.clientX, event.clientY, viewport, cameraRef.current);
    interactionRef.current = {
      kind: "rotate-node",
      pointerId: event.pointerId,
      nodeId: node.id,
      pivot: originGeometry.pivot,
      startPointerAngle: getPointerAngleDegrees(pointerWorld, originGeometry.pivot),
      originRotation: node.rect.rotation ?? 0,
      snapshot: cloneDocument(workspaceRef.current!),
      didMutate: false
    };
  }

  function startChildDrag(
    event: ReactPointerEvent<HTMLElement | SVGElement>,
    node: Extract<WhiteboardNode, { kind: "phy_canvas" }>,
    child: PhyCanvasObject
  ) {
    if (!viewportRef.current || activeTool !== "select" || node.locked || interactionRef.current) {
      return;
    }

    claimPointerForInteraction(event);
    hideSelectionHud();
    setActiveTransform("drag-child");
    updateSelection([makeChildObjectRef(node.id, child.id)], false);
    const viewport = viewportRef.current.getBoundingClientRect();
    const pointerWorld = screenToWorldPoint(event.clientX, event.clientY, viewport, cameraRef.current);
    interactionRef.current = {
      kind: "drag-child",
      pointerId: event.pointerId,
      nodeId: node.id,
      childId: child.id,
      originChild: child,
      originPointerScene: worldPointToPhyCanvasScenePoint(node, pointerWorld),
      snapshot: cloneDocument(workspaceRef.current!),
      didMutate: false
    };
  }

  function startChildResize(event: ReactPointerEvent<HTMLButtonElement>, handleId: ResizeHandleId) {
    if (
      !viewportRef.current ||
      !selectedNode ||
      selectedNode.kind !== "phy_canvas" ||
      selectedNode.locked ||
      !selectedChild ||
      interactionRef.current
    ) {
      return;
    }

    const originGeometry = getPhyCanvasChildSceneGeometry(selectedChild);
    claimPointerForInteraction(event);
    hideSelectionHud();
    setActiveTransform("resize-child");
    interactionRef.current = {
      kind: "resize-child",
      pointerId: event.pointerId,
      nodeId: selectedNode.id,
      childId: selectedChild.id,
      handleId,
      originChild: selectedChild,
      originGeometry,
      minimumSize: minChildSize(selectedChild.kind),
      snapshot: cloneDocument(workspaceRef.current!),
      didMutate: false
    };
  }

  function startChildRotate(event: ReactPointerEvent<HTMLButtonElement>) {
    if (
      !viewportRef.current ||
      !selectedNode ||
      selectedNode.kind !== "phy_canvas" ||
      selectedNode.locked ||
      !selectedChild ||
      interactionRef.current
    ) {
      return;
    }

    claimPointerForInteraction(event);
    hideSelectionHud();
    setActiveTransform("rotate-child");
    const viewport = viewportRef.current.getBoundingClientRect();
    const pointerWorld = screenToWorldPoint(event.clientX, event.clientY, viewport, cameraRef.current);
    const originGeometry = getPhyCanvasChildSceneGeometry(selectedChild);
    const pointerScene = worldPointToPhyCanvasScenePoint(selectedNode, pointerWorld);
    interactionRef.current = {
      kind: "rotate-child",
      pointerId: event.pointerId,
      nodeId: selectedNode.id,
      childId: selectedChild.id,
      originChild: selectedChild,
      pivotScene: originGeometry.pivot,
      startPointerAngle: getPointerAngleDegrees(pointerScene, originGeometry.pivot),
      originRotation: selectedChild.rotation ?? 0,
      snapshot: cloneDocument(workspaceRef.current!),
      didMutate: false
    };
  }

  function handleNodeInteractionMove(event: ReactPointerEvent<HTMLElement | HTMLButtonElement | SVGElement>) {
    const interaction = interactionRef.current;
    if (!interaction || !workspaceRef.current || !viewportRef.current) {
      return;
    }

    if (!("pointerId" in interaction) || interaction.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const viewport = viewportRef.current.getBoundingClientRect();
    if (interaction.kind === "drag-node") {
      const dx = (event.clientX - interaction.start.x) / cameraRef.current.zoom;
      const dy = (event.clientY - interaction.start.y) / cameraRef.current.zoom;
      const nextRect = clampRect({
        ...interaction.originRect,
        x: interaction.originRect.x + dx,
        y: interaction.originRect.y + dy
      });
      interaction.didMutate = true;
      commitWorkspace(
        (document) => updateNodeRect(document, interaction.nodeId, nextRect),
        { persist: true }
      );
      return;
    }

    if (interaction.kind === "resize-node") {
      const pointerWorld = screenToWorldPoint(event.clientX, event.clientY, viewport, cameraRef.current);
      const resized = resizeTransformGeometry(
        interaction.originGeometry,
        interaction.handleId,
        pointerWorld,
        interaction.minimumSize,
        event.shiftKey
      );
      const nextRect = clampRect({
        ...interaction.originRect,
        x: resized.center.x - resized.width / 2,
        y: resized.center.y - resized.height / 2,
        w: resized.width,
        h: resized.height
      });
      interaction.didMutate = true;
      commitWorkspace(
        (document) => updateNodeRect(document, interaction.nodeId, nextRect),
        { persist: true }
      );
      return;
    }

    if (interaction.kind === "rotate-node") {
      const pointerWorld = screenToWorldPoint(event.clientX, event.clientY, viewport, cameraRef.current);
      const deltaAngle = getAngleDeltaDegrees(
        interaction.startPointerAngle,
        getPointerAngleDegrees(pointerWorld, interaction.pivot)
      );
      const nextRotation = event.shiftKey
        ? snapAngle(interaction.originRotation + deltaAngle, 15)
        : interaction.originRotation + deltaAngle;
      interaction.didMutate = true;
      commitWorkspace(
        (document) =>
          updateNodeRect(document, interaction.nodeId, {
            ...getNodeRect(document, interaction.nodeId),
            rotation: nextRotation
          }),
        { persist: true }
      );
      return;
    }

    if (
      interaction.kind !== "drag-child" &&
      interaction.kind !== "resize-child" &&
      interaction.kind !== "rotate-child"
    ) {
      return;
    }

    const node = workspaceRef.current.whiteboard_nodes.find(
      (item): item is Extract<WhiteboardNode, { kind: "phy_canvas" }> =>
        item.id === interaction.nodeId && item.kind === "phy_canvas"
    );
    if (!node) {
      return;
    }

    if (interaction.kind === "drag-child") {
      const pointerWorld = screenToWorldPoint(event.clientX, event.clientY, viewport, cameraRef.current);
      const pointerScene = worldPointToPhyCanvasScenePoint(node, pointerWorld);
      interaction.didMutate = true;
      commitWorkspace(
        (document) =>
          updatePhyCanvasChild(document, interaction.nodeId, interaction.childId, {
            ...clampPhyCanvasChildAttributes(node, interaction.originChild, {
              x: interaction.originChild.x + (pointerScene.x - interaction.originPointerScene.x),
              y: interaction.originChild.y + (pointerScene.y - interaction.originPointerScene.y)
            })
          }),
        { persist: true }
      );
      return;
    }

    if (interaction.kind === "resize-child") {
      const pointerWorld = screenToWorldPoint(event.clientX, event.clientY, viewport, cameraRef.current);
      const pointerScene = worldPointToPhyCanvasScenePoint(node, pointerWorld);
      const resized = resizeTransformGeometry(
        interaction.originGeometry,
        interaction.handleId,
        pointerScene,
        interaction.minimumSize,
        event.shiftKey
      );
      interaction.didMutate = true;
      commitWorkspace(
        (document) =>
          updatePhyCanvasChild(
            document,
            interaction.nodeId,
            interaction.childId,
            clampPhyCanvasChildAttributes(
              node,
              interaction.originChild,
              getResizedChildAttributes(interaction.originChild, interaction.originGeometry, resized)
            )
          ),
        { persist: true }
      );
      return;
    }

    if (interaction.kind === "rotate-child") {
      const pointerWorld = screenToWorldPoint(event.clientX, event.clientY, viewport, cameraRef.current);
      const pointerScene = worldPointToPhyCanvasScenePoint(node, pointerWorld);
      const deltaAngle = getAngleDeltaDegrees(
        interaction.startPointerAngle,
        getPointerAngleDegrees(pointerScene, interaction.pivotScene)
      );
      const nextRotation = event.shiftKey
        ? snapAngle(interaction.originRotation + deltaAngle, 15)
        : interaction.originRotation + deltaAngle;
      interaction.didMutate = true;
      commitWorkspace(
        (document) =>
          updatePhyCanvasChild(
            document,
            interaction.nodeId,
            interaction.childId,
            clampPhyCanvasChildAttributes(node, interaction.originChild, {
              rotation: nextRotation
            })
          ),
        { persist: true }
      );
    }
  }

  function finishNodeInteraction(event: ReactPointerEvent<HTMLElement | HTMLButtonElement | SVGElement>) {
    const interaction = interactionRef.current;
    if (!interaction || !("pointerId" in interaction) || interaction.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    releaseInteractionPointer(event);

    if (
      (interaction.kind === "drag-node" ||
        interaction.kind === "resize-node" ||
        interaction.kind === "rotate-node" ||
        interaction.kind === "drag-child" ||
        interaction.kind === "resize-child" ||
        interaction.kind === "rotate-child") &&
      interaction.didMutate
    ) {
      pushHistorySnapshot(interaction.snapshot);
      scheduleBoardAnalysis();
    }

    if (interaction.kind === "drag-node" || interaction.kind === "resize-node" || interaction.kind === "rotate-node") {
      updateSelection([makeNodeObjectRef(interaction.nodeId)], false);
    }

    if (
      interaction.kind === "drag-child" ||
      interaction.kind === "resize-child" ||
      interaction.kind === "rotate-child"
    ) {
      updateSelection([makeChildObjectRef(interaction.nodeId, interaction.childId)], false);
    }

    interactionRef.current = null;
    setActiveTransform(null);
  }

  async function handleImportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceRef.current) {
      return;
    }

    const formData = new FormData();
    if (importMode === "text") {
      if (!importText.trim()) {
        setErrorMessage("请先输入题目文本。");
        return;
      }
      formData.append("text_content", importText);
      formData.append("filename", importFilename.trim() || "problem.md");
    } else {
      if (!importFile) {
        setErrorMessage("请先选择文件。");
        return;
      }
      formData.append("file", importFile);
    }

    setAiState("analyzing-source");
    setErrorMessage(null);
    try {
      await runLockedRemoteMutation("importing", async () => {
        const attachRequestId = nextRequestId();
        const attachVersion = changeVersionRef.current;
        const attached = await attachWorkspaceSource(workspaceId, formData);
        applyServerWorkspace(attached, {
          source: "import",
          requestId: attachRequestId,
          baseChangeVersion: attachVersion,
          preserveTool: true
        });
        const analyzeSourceRequestId = nextRequestId();
        const analyzeSourceVersion = changeVersionRef.current;
        const analyzed = await analyzeWorkspaceSource(workspaceId, {});
        applyServerWorkspace(analyzed, {
          source: "analyze-source",
          requestId: analyzeSourceRequestId,
          baseChangeVersion: analyzeSourceVersion,
          preserveTool: true
        });
        const viewportRect = viewportRef.current?.getBoundingClientRect() ?? null;
        if (viewportRect && analyzed.whiteboard_nodes.length > 0) {
          setCameraState(
            fitCameraToNodes(analyzed.whiteboard_nodes, viewportRect, getCurrentOverlaySafeInsets(viewportRect))
          );
        }
      });
      setAiState("idle");
      updateSaveState("idle");
      setImportSheetOpen(false);
      setSidebarCollapsed(false);
      setImportText("");
      setImportFile(null);
    } catch (error) {
      setAiState("error");
      setErrorMessage(toMessage(error));
    }
  }

  async function handleAcceptSuggestion(suggestionId: string) {
    if (!workspaceRef.current) {
      return;
    }

    pushHistorySnapshot(workspaceRef.current);
    try {
      await runLockedRemoteMutation("accepting", async () => {
        const acceptRequestId = nextRequestId();
        const acceptVersion = changeVersionRef.current;
        const next = await acceptWorkspaceSuggestion(workspaceId, suggestionId);
        applyServerWorkspace(next, {
          source: "accept-suggestion",
          requestId: acceptRequestId,
          baseChangeVersion: acceptVersion,
          preserveTool: true
        });
      });
      updateSaveState("idle");
      setAiState("idle");
    } catch (error) {
      setErrorMessage(toMessage(error));
    }
  }

  async function handleRejectSuggestion(suggestionId: string) {
    try {
      await runLockedRemoteMutation("rejecting", async () => {
        const rejectRequestId = nextRequestId();
        const rejectVersion = changeVersionRef.current;
        const next = await rejectWorkspaceSuggestion(workspaceId, suggestionId);
        applyServerWorkspace(next, {
          source: "reject-suggestion",
          requestId: rejectRequestId,
          baseChangeVersion: rejectVersion,
          preserveSelection: true,
          preserveTool: true
        });
      });
      updateSaveState("idle");
    } catch (error) {
      setErrorMessage(toMessage(error));
    }
  }

  function handleUndo() {
    const previous = historyPast[historyPast.length - 1];
    const current = workspaceRef.current;
    if (!previous || !current) {
      return;
    }

    setHistoryPast((items) => items.slice(0, -1));
    setHistoryFuture((items) => [cloneDocument(current), ...items].slice(0, MAX_HISTORY));
    const restored = normalizeDocument(previous);
    restored.viewport = cameraRef.current;
    setWorkspaceSnapshot(restored);
    changeVersionRef.current += 1;
    updateSaveState("dirty");
    scheduleBoardAnalysis(600);
  }

  function handleRedo() {
    const next = historyFuture[0];
    const current = workspaceRef.current;
    if (!next || !current) {
      return;
    }

    setHistoryFuture((items) => items.slice(1));
    setHistoryPast((items) => [...items.slice(-(MAX_HISTORY - 1)), cloneDocument(current)]);
    const restored = normalizeDocument(next);
    restored.viewport = cameraRef.current;
    setWorkspaceSnapshot(restored);
    changeVersionRef.current += 1;
    updateSaveState("dirty");
    scheduleBoardAnalysis(600);
  }

  function handleRichBlockFocus(nodeId: string) {
    if (!workspaceRef.current || editingBaselineRef.current[nodeId]) {
      return;
    }
    editingBaselineRef.current[nodeId] = cloneDocument(workspaceRef.current);
  }

  function handleRichBlockBlur(nodeId: string) {
    const snapshot = editingBaselineRef.current[nodeId];
    if (!snapshot) {
      return;
    }
    delete editingBaselineRef.current[nodeId];
    pushHistorySnapshot(snapshot);
  }

  function updateRichBlockField(
    nodeId: string,
    field: keyof RichBlockNode["payload"],
    value: string
  ) {
    commitWorkspace(
      (document) => updateRichBlock(document, nodeId, field, value),
      { persist: true, analyze: field === "content" }
    );
  }

  function handleNodeSelect(nodeId: string) {
    updateSelection([makeNodeObjectRef(nodeId)], false);
    revealSelectionHud();
  }

  function handleChildSelect(nodeId: string, childId: string) {
    updateSelection([makeChildObjectRef(nodeId, childId)], false);
    revealSelectionHud();
  }

  function handleSuggestionMarkerClick(suggestion: BoardSuggestion) {
    const target = suggestion.target_object_refs[0];
    if (target) {
      updateSelection([target], false);
      revealSelectionHud();
    }
    setSidebarCollapsed(false);
    setSelectedSuggestionId(suggestion.id);
  }

  function focusSuggestion(suggestion: BoardSuggestion) {
    const target = suggestion.target_object_refs[0];
    if (!workspaceRef.current || !target) {
      return;
    }

    updateSelection([target], false);
    revealSelectionHud();
    const rect = getObjectWorldRect(workspaceRef.current, target);
    if (!rect || !viewportRef.current) {
      return;
    }

    const viewportRect = viewportRef.current.getBoundingClientRect();
    setCameraState(
      focusCameraOnRect(rect, camera.zoom, viewportRect, getCurrentOverlaySafeInsets(viewportRect))
    );
  }

  function handleChatStubSubmit() {
    if (!chatDraft.trim()) {
      return;
    }
    setErrorMessage("当前版本右侧只保留 AI 侧栏壳体，真正的 Tutor 聊天流尚未接入。");
    setChatDraft("");
  }

  const worldStyle = {
    width: `${WORLD_WIDTH}px`,
    height: `${WORLD_HEIGHT}px`,
    transform: `scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`
  };
  const gridStyle = {
    "--wb-grid-size": `${GRID_STEP * camera.zoom}px`,
    "--wb-grid-major-size": `${GRID_MAJOR_STEP * camera.zoom}px`,
    "--wb-grid-x": `${-camera.x * camera.zoom}px`,
    "--wb-grid-y": `${-camera.y * camera.zoom}px`
  } as CSSProperties;
  const viewportBounds = viewportRef.current?.getBoundingClientRect() ?? null;
  const overlaySafeInsets = getCurrentOverlaySafeInsets(viewportBounds);
  const selectionMenuAnchor = selectionScreenGeometry ? getSelectionMenuAnchor(selectionScreenGeometry) : null;
  const moreMenuAnchor = selectionScreenGeometry ? getMoreMenuAnchor(selectionScreenGeometry) : null;
  const selectionMenuPosition =
    selectionMenuAnchor && selectionScreenRect && viewportBounds
      ? getSelectionMenuPosition(selectionMenuAnchor, selectionScreenRect, viewportBounds, overlaySafeInsets)
      : null;
  const moreMenuPosition =
    moreMenuAnchor && selectionScreenRect && viewportBounds
      ? getMoreMenuPosition(moreMenuAnchor, selectionScreenRect, viewportBounds, overlaySafeInsets)
      : null;
  const visibleSuggestionMarkers =
    viewportBounds === null
      ? suggestionMarkers
      : suggestionMarkers.map((marker) => ({
          ...marker,
          ...clampMarkerPosition(marker.left, marker.top, viewportBounds, overlaySafeInsets)
        }));
  const remoteBusy = remoteMutationState !== "idle";
  const canTransformSelectedChild =
    !!selectedChild && selectedNode?.kind === "phy_canvas" && !selectedNode.locked && !!selectionGeometry?.canResize;
  const isRotating = activeTransform === "rotate-node" || activeTransform === "rotate-child";
  const isTransforming = activeTransform !== null;
  const showTopLevelTransformHandles =
    !!selectionScreenGeometry &&
    selectedNodeIsTopLevel &&
    !!selectedNode &&
    !selectedNode.locked &&
    selectionScreenGeometry.canResize;
  const showChildTransformHandles =
    !!selectionScreenGeometry &&
    !selectedNodeIsTopLevel &&
    canTransformSelectedChild &&
    selectionScreenGeometry.canResize;
  const showRotateHandle =
    !!selectionScreenGeometry &&
    ((selectedNodeIsTopLevel && !!selectedNode && !selectedNode.locked && selectionScreenGeometry.canRotate) ||
      (!selectedNodeIsTopLevel && canTransformSelectedChild && selectionScreenGeometry.canRotate));
  const showMoveHandle =
    !!selectionScreenGeometry &&
    ((selectedNodeIsTopLevel && !!selectedNode && !selectedNode.locked) ||
      (!selectedNodeIsTopLevel && !!selectedChild && selectedNode?.kind === "phy_canvas" && !selectedNode.locked));
  const moveHandlePosition =
    selectionScreenGeometry && viewportBounds
      ? getMoveHandlePosition(selectionScreenGeometry, viewportBounds, overlaySafeInsets)
      : null;
  const showSelectionMenu = !!selectionScreenGeometry && selectionHudVisible && !isTransforming;
  const showSelectionAngle = !!selectionScreenGeometry && !!selectionGeometry && isRotating;
  const selectionOutlinePoints = selectionScreenGeometry
    ? selectionScreenGeometry.cornerOrder.map((point) => `${point.x},${point.y}`).join(" ")
    : "";
  const selectionAngleLabel = selectionGeometry ? formatAngleDegrees(selectionGeometry.rotation) : null;

  if (loading) {
    return (
      <div className="wb-loading-shell">
        <div className="wb-loading-card">
          <UiIcon name="diagram" className="wb-loading-icon" />
          <strong>正在打开工作台</strong>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="wb-loading-shell">
        <div className="wb-loading-card">
          <UiIcon name="close" className="wb-loading-icon" />
          <strong>工作台加载失败</strong>
          {errorMessage ? <span>{errorMessage}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="wb-layout">
      <div ref={topbarRef} className="wb-topbar" onPointerDown={(event) => event.stopPropagation()}>
        <div className="wb-topbar__cluster">
          <input
            className="wb-title-input"
            value={workspace.title}
            disabled={remoteBusy}
            onChange={(event) => {
              commitWorkspace(
                (document) => ({
                  ...document,
                  title: event.target.value
                }),
                { persist: true }
              );
            }}
            aria-label="工作台标题"
          />
          <span className={`wb-pill wb-pill--save wb-pill--${saveState}`}>{saveStateLabel(saveState)}</span>
          <span className={`wb-pill wb-pill--ai wb-pill--${aiState}`}>{aiStateLabel(aiState)}</span>
        </div>
        <div className="wb-topbar__cluster">
          <button className="wb-icon-button" type="button" title="撤销" onClick={handleUndo} disabled={!historyPast.length}>
            <UiIcon name="undo" />
          </button>
          <button className="wb-icon-button" type="button" title="重做" onClick={handleRedo} disabled={!historyFuture.length}>
            <UiIcon name="redo" />
          </button>
          <button className="wb-icon-button" type="button" title="立即保存" onClick={() => void saveCurrentWorkspace(true)}>
            <UiIcon name="save" />
          </button>
          <button className="wb-icon-button" type="button" title="缩小" onClick={() => zoomBy(-0.12)}>
            <UiIcon name="zoomOut" />
          </button>
          <span className="wb-zoom-readout">{Math.round(camera.zoom * 100)}%</span>
          <button className="wb-icon-button" type="button" title="放大" onClick={() => zoomBy(0.12)}>
            <UiIcon name="zoomIn" />
          </button>
          <button className="wb-icon-button" type="button" title="适配内容" onClick={fitAll}>
            <UiIcon name="focus" />
          </button>
          <button
            className="wb-icon-button"
            type="button"
            title={sidebarCollapsed ? "展开 AI 栏" : "收起 AI 栏"}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            <UiIcon name="sidebar" />
          </button>
        </div>
      </div>

      <div ref={dockRef} className="wb-dock wb-dock--left" onPointerDown={(event) => event.stopPropagation()}>
        <div className="wb-dock__section">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              className={`wb-tool-button ${activeTool === tool.id ? "is-active" : ""}`}
              type="button"
              title={tool.hint}
              onClick={() => updateActiveTool(tool.id)}
            >
              <UiIcon name={tool.icon} />
              <span>{tool.label}</span>
            </button>
          ))}
        </div>
        <div className="wb-dock__divider" />
        <div className="wb-dock__section">
          <button className="wb-tool-button" type="button" title="导入题目" onClick={() => setImportSheetOpen(true)}>
            <UiIcon name="upload" />
            <span>导入</span>
          </button>
          <button className="wb-tool-button" type="button" title="插入受力模板" onClick={insertTemplate}>
            <UiIcon name="template" />
            <span>模板</span>
          </button>
          <button
            className="wb-tool-button"
            type="button"
            title="检查当前板面"
            onClick={() => {
              setSidebarCollapsed(false);
              void runBoardAnalysis();
            }}
          >
            <UiIcon name="spark" />
            <span>AI</span>
          </button>
        </div>
      </div>

      <aside
        ref={sidebarRef}
        className={`wb-sidebar ${sidebarCollapsed ? "is-collapsed" : ""}`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="wb-sidebar__head">
          <div className="wb-sidebar__title">
            <UiIcon name="spark" />
            {!sidebarCollapsed ? <strong>AI</strong> : null}
          </div>
          <button
            className="wb-icon-button"
            type="button"
            title={sidebarCollapsed ? "展开 AI 栏" : "收起 AI 栏"}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            <UiIcon name={sidebarCollapsed ? "sidebar" : "close"} />
          </button>
        </div>

        {!sidebarCollapsed ? (
          <>
            <div className="wb-sidebar__status">
              <span className={`wb-pill wb-pill--ai wb-pill--${aiState}`}>{aiStateLabel(aiState)}</span>
              <button className="wb-mini-button" type="button" onClick={() => void runBoardAnalysis()}>
                <UiIcon name="refresh" />
                <span>{selectedObjectRef ? "检查所选" : "检查全板"}</span>
              </button>
            </div>

            <div className="wb-sidebar__tips">
              <span>只给建议，不会静默改写你的板面。</span>
            </div>

            <div className="wb-sidebar__body">
              <div className="wb-section-head">
                <strong>建议</strong>
                <span>{pendingSuggestions.length}</span>
              </div>
              <div className="wb-suggestion-list">
                {pendingSuggestions.length ? (
                  pendingSuggestions.map((suggestion) => (
                    <article
                      key={suggestion.id}
                      className={`wb-suggestion-card ${selectedSuggestion?.id === suggestion.id ? "is-active" : ""}`}
                    >
                      <button
                        className="wb-suggestion-card__main"
                        type="button"
                        onClick={() => {
                          setSelectedSuggestionId(suggestion.id);
                          focusSuggestion(suggestion);
                        }}
                      >
                        <div className="wb-suggestion-card__head">
                          <span className="wb-tag">{suggestionKindLabel(suggestion.kind)}</span>
                          <span className="wb-suggestion-target">
                            {suggestionTargetLabel(workspace, suggestion)}
                          </span>
                        </div>
                        <MarkdownMath content={suggestion.reason} className="wb-suggestion-card__reason" />
                      </button>
                      <div className="wb-suggestion-card__actions">
                        <button className="wb-mini-button" type="button" disabled={remoteBusy} onClick={() => void handleAcceptSuggestion(suggestion.id)}>
                          <UiIcon name="check" />
                          <span>接受</span>
                        </button>
                        <button className="wb-mini-button wb-mini-button--ghost" type="button" disabled={remoteBusy} onClick={() => void handleRejectSuggestion(suggestion.id)}>
                          <UiIcon name="close" />
                          <span>拒绝</span>
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="wb-empty-panel">
                    <UiIcon name="check" />
                    <span>当前没有待处理建议。</span>
                  </div>
                )}
              </div>
            </div>

            <div className="wb-sidebar__chat">
              <div className="wb-chat-bubble">
                右侧先保留 AI 侧栏壳体。完整 Tutor 聊天流会在后续版本接入。
              </div>
              <div className="wb-chat-input">
                <input
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  placeholder="先保留输入壳体"
                  aria-label="AI 输入壳体"
                />
                <button className="wb-icon-button" type="button" title="发送" onClick={handleChatStubSubmit}>
                  <UiIcon name="send" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="wb-sidebar__collapsed-stack">
            <button
              className="wb-rail-badge"
              type="button"
              title="展开建议"
              onClick={() => setSidebarCollapsed(false)}
            >
              <UiIcon name="spark" />
              <span>{pendingSuggestions.length}</span>
            </button>
          </div>
        )}
      </aside>

      <div
        ref={viewportRef}
        className="wb-viewport"
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerCancel={handleViewportPointerUp}
        onDragStart={(event) => event.preventDefault()}
        onWheel={(event: ReactWheelEvent<HTMLDivElement>) => {
          if (!viewportRef.current) {
            return;
          }
          if (event.ctrlKey || event.metaKey) {
            return;
          }
          if (event.altKey) {
            event.preventDefault();
            zoomAt(event.clientX, event.clientY, camera.zoom - event.deltaY * 0.0025);
            return;
          }
          event.preventDefault();
          setCameraState({
            x: cameraRef.current.x + event.deltaX / cameraRef.current.zoom,
            y: cameraRef.current.y + event.deltaY / cameraRef.current.zoom,
            zoom: cameraRef.current.zoom
          });
        }}
      >
        <div className="wb-grid" style={gridStyle} />
        <div className="wb-world" style={worldStyle}>
          {runtimeShapes.map((shape) => {
            const node = shape.node;
            const isSelected = selectedNodeRef === shape.objectRef;
            const hasSelectedChild =
              !!selectedObjectRef &&
              selectedObjectRef.startsWith(`${shape.objectRef}#child:`) &&
              node.kind === "phy_canvas";

            return (
              <div
                key={shape.id}
                className={`wb-node wb-node--${shape.kind} ${isSelected ? "is-selected" : ""} ${hasSelectedChild ? "is-context" : ""} ${node.locked ? "is-locked" : ""}`}
                style={{
                  left: `${node.rect.x}px`,
                  top: `${node.rect.y}px`,
                  width: `${node.rect.w}px`,
                  height: `${node.rect.h}px`,
                  transform: `rotate(${node.rect.rotation ?? 0}deg)`,
                  zIndex: node.z_index
                }}
                onPointerDown={(event) => startNodeDrag(event, node)}
                onPointerMove={handleNodeInteractionMove}
                onPointerUp={finishNodeInteraction}
                onPointerCancel={finishNodeInteraction}
                onClick={() => handleNodeSelect(node.id)}
                onDragStart={(event) => event.preventDefault()}
                draggable={false}
              >
                {node.kind === "source_image" ? (
                  <div className="wb-image-node">
                    {node.payload.preview_key ? (
                      <img src={buildPreviewUrl(node.payload.preview_key)} alt={node.payload.alt} draggable={false} />
                    ) : null}
                    <div className="wb-image-node__caption">
                      <span>{node.payload.caption ?? node.payload.alt}</span>
                    </div>
                  </div>
                ) : null}

                {node.kind === "rich_block" ? (
                  <div className={`wb-rich-block wb-rich-block--${node.payload.block_role}`}>
                    {isSelected ? (
                      <div className="wb-rich-block__editor">
                        <textarea
                          value={node.payload.content}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          onFocus={() => handleRichBlockFocus(node.id)}
                          onBlur={() => handleRichBlockBlur(node.id)}
                          onChange={(event) => updateRichBlockField(node.id, "content", event.target.value)}
                          placeholder="输入文字"
                          aria-label="块内容"
                        />
                      </div>
                    ) : (
                      <MarkdownMath content={node.payload.content} className="wb-rich-block__preview" />
                    )}
                  </div>
                ) : null}

                {node.kind === "phy_canvas" ? (
                  <div className="wb-phy-canvas">
                    <div className="wb-phy-canvas__head">
                      <span>{node.payload.summary ?? "受力分析图"}</span>
                    </div>
                    <svg
                      className="wb-phy-canvas__svg"
                      viewBox={`0 0 ${node.payload.bounds.width} ${node.payload.bounds.height}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {parsePhyCanvasObjects(node).map((item) => {
                        const childSelected = selectedObjectRef === item.objectRef;
                        const rotationOrigin = getPhyCanvasChildRotationOrigin(item);
                        const commonProps = {
                          className: `wb-phy-shape wb-phy-shape--${item.kind} ${childSelected ? "is-selected" : ""}`,
                          onPointerDown: (event: ReactPointerEvent<SVGElement>) => {
                            startChildDrag(event, node, item);
                          },
                          onPointerMove: handleNodeInteractionMove,
                          onPointerUp: finishNodeInteraction,
                          onPointerCancel: finishNodeInteraction,
                          onClick: (event: ReactMouseEvent<SVGElement>) => {
                            event.stopPropagation();
                            handleChildSelect(node.id, item.id);
                          }
                        };

                        if (item.kind === "body") {
                          return (
                            <g
                              key={item.id}
                              transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${rotationOrigin.x} ${rotationOrigin.y})`}
                              {...commonProps}
                            >
                              <rect width={item.w} height={item.h} rx="16" />
                              <text x={item.w / 2} y={item.h / 2 + 5} textAnchor="middle">
                                {item.label ?? "物体"}
                              </text>
                            </g>
                          );
                        }

                        if (item.kind === "surface") {
                          return (
                            <g
                              key={item.id}
                              transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${rotationOrigin.x} ${rotationOrigin.y})`}
                              {...commonProps}
                            >
                              <rect width={item.w} height={item.h} rx="6" />
                              <text x={item.w / 2} y="-8" textAnchor="middle">
                                {item.label ?? "接触面"}
                              </text>
                            </g>
                          );
                        }

                        if (item.kind === "force") {
                          return (
                            <g
                              key={item.id}
                              transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${rotationOrigin.x} ${rotationOrigin.y})`}
                              {...commonProps}
                            >
                              <line x1="0" y1={item.h / 2} x2={item.w - 12} y2={item.h / 2} />
                              <path d={`M${item.w - 12} ${item.h / 2 - 6} L${item.w} ${item.h / 2} L${item.w - 12} ${item.h / 2 + 6}`} />
                              <text x={item.w / 2} y={-8} textAnchor="middle">
                                {item.label ?? "F"}
                              </text>
                            </g>
                          );
                        }

                        return (
                          <g key={item.id} transform={`translate(${item.x} ${item.y})`} {...commonProps}>
                            <text>{item.text ?? item.label ?? item.id}</text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                ) : null}

                {node.kind === "ai_annotation" ? (
                  <div className="wb-ai-card">
                    <div className="wb-ai-card__head">
                      <UiIcon name="spark" />
                      <span>{node.payload.title}</span>
                    </div>
                    <MarkdownMath content={node.payload.text} className="wb-ai-card__body" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="wb-overlay-layer">
          {workspace.whiteboard_nodes.length === 0 ? (
            <div className="wb-empty-state" onPointerDown={(event) => event.stopPropagation()}>
              <button className="wb-empty-state__button" type="button" onClick={insertBlankStartNode}>
                <UiIcon name="block" />
                <span>空白开始</span>
              </button>
              <button className="wb-empty-state__button" type="button" onClick={() => setImportSheetOpen(true)}>
                <UiIcon name="upload" />
                <span>导入题目</span>
              </button>
              <button className="wb-empty-state__button" type="button" onClick={insertTemplate}>
                <UiIcon name="template" />
                <span>受力模板</span>
              </button>
            </div>
          ) : null}

          {visibleSuggestionMarkers.map((marker) => (
            <button
              key={marker.id}
              className={`wb-suggestion-marker ${marker.active ? "is-active" : ""}`}
              style={{ left: `${marker.left}px`, top: `${marker.top}px` }}
              type="button"
              title={marker.suggestion.reason}
              onClick={() => handleSuggestionMarkerClick(marker.suggestion)}
            >
              <UiIcon name="spark" />
            </button>
          ))}

          {selectionScreenGeometry ? (
            <>
              <div className={`wb-selection-gizmo ${selectedNodeIsTopLevel ? "is-node" : "is-child"}`}>
                <svg className="wb-selection-gizmo__svg" aria-hidden="true">
                  <polygon className="wb-selection-gizmo__outline" points={selectionOutlinePoints} />
                  {showSelectionAngle ? (
                    <>
                      <line
                        className="wb-selection-gizmo__axis wb-selection-gizmo__axis--x"
                        x1={selectionScreenGeometry.axisX[0].x}
                        y1={selectionScreenGeometry.axisX[0].y}
                        x2={selectionScreenGeometry.axisX[1].x}
                        y2={selectionScreenGeometry.axisX[1].y}
                      />
                      <line
                        className="wb-selection-gizmo__axis wb-selection-gizmo__axis--y"
                        x1={selectionScreenGeometry.axisY[0].x}
                        y1={selectionScreenGeometry.axisY[0].y}
                        x2={selectionScreenGeometry.axisY[1].x}
                        y2={selectionScreenGeometry.axisY[1].y}
                      />
                      {selectionScreenGeometry.rotationHandle ? (
                        <line
                          className="wb-selection-gizmo__arm"
                          x1={selectionScreenGeometry.rightEdgeMidpoint.x}
                          y1={selectionScreenGeometry.rightEdgeMidpoint.y}
                          x2={selectionScreenGeometry.rotationHandle.x}
                          y2={selectionScreenGeometry.rotationHandle.y}
                        />
                      ) : null}
                      <circle
                        className="wb-selection-gizmo__pivot"
                        cx={selectionScreenGeometry.pivot.x}
                        cy={selectionScreenGeometry.pivot.y}
                        r="5"
                      />
                    </>
                  ) : null}
                </svg>

                {showMoveHandle && selectedNode ? (
                  <button
                    className="wb-selection-handle wb-selection-handle--move"
                    type="button"
                    aria-label={selectedNodeIsTopLevel ? "移动所选节点" : "移动所选子元素"}
                    title={selectedNodeIsTopLevel ? "移动" : "移动子元素"}
                    style={{
                      left: `${moveHandlePosition?.x ?? selectionScreenGeometry.corners.nw.x}px`,
                      top: `${moveHandlePosition?.y ?? selectionScreenGeometry.corners.nw.y}px`
                    }}
                    onPointerDown={(event) => {
                      if (selectedNodeIsTopLevel) {
                        startNodeDrag(event, selectedNode);
                      } else if (selectedNode.kind === "phy_canvas" && selectedChild) {
                        startChildDrag(event, selectedNode, selectedChild);
                      }
                    }}
                    onPointerMove={handleNodeInteractionMove}
                    onPointerUp={finishNodeInteraction}
                    onPointerCancel={finishNodeInteraction}
                  />
                ) : null}

                {showRotateHandle && selectionScreenGeometry.rotationHandle ? (
                  <button
                    className="wb-selection-handle wb-selection-handle--rotate"
                    type="button"
                    title={selectedNodeIsTopLevel ? "旋转" : "旋转子元素"}
                    style={{
                      left: `${selectionScreenGeometry.rotationHandle.x}px`,
                      top: `${selectionScreenGeometry.rotationHandle.y}px`
                    }}
                    onPointerDown={
                      selectedNodeIsTopLevel && selectedNode
                        ? (event) => startNodeRotate(event, selectedNode)
                        : startChildRotate
                    }
                    onPointerMove={handleNodeInteractionMove}
                    onPointerUp={finishNodeInteraction}
                    onPointerCancel={finishNodeInteraction}
                  />
                ) : null}

                {showTopLevelTransformHandles && selectedNode
                  ? selectionScreenGeometry.resizeHandles.map((handle) => (
                      <button
                        key={handle.id}
                        className={`wb-selection-handle wb-selection-handle--corner wb-selection-handle--corner-${handle.id}`}
                        type="button"
                        title="缩放"
                        style={{
                          left: `${handle.point.x}px`,
                          top: `${handle.point.y}px`
                        }}
                        onPointerDown={(event) => startNodeResize(event, selectedNode, handle.id)}
                        onPointerMove={handleNodeInteractionMove}
                        onPointerUp={finishNodeInteraction}
                        onPointerCancel={finishNodeInteraction}
                      />
                    ))
                  : null}

                {showChildTransformHandles
                  ? selectionScreenGeometry.resizeHandles.map((handle) => (
                      <button
                        key={handle.id}
                        className={`wb-selection-handle wb-selection-handle--corner wb-selection-handle--corner-${handle.id}`}
                        type="button"
                        title="缩放子元素"
                        style={{
                          left: `${handle.point.x}px`,
                          top: `${handle.point.y}px`
                        }}
                        onPointerDown={(event) => startChildResize(event, handle.id)}
                        onPointerMove={handleNodeInteractionMove}
                        onPointerUp={finishNodeInteraction}
                        onPointerCancel={finishNodeInteraction}
                      />
                    ))
                  : null}
              </div>

              {showSelectionAngle && selectionScreenGeometry.rotationHandle && selectionAngleLabel ? (
                <div
                  className="wb-selection-angle"
                  style={{
                    left: `${selectionScreenGeometry.rotationHandle.x + 12}px`,
                    top: `${selectionScreenGeometry.rotationHandle.y}px`
                  }}
                >
                  {selectionAngleLabel}
                </div>
              ) : null}

              {showSelectionMenu ? (
                <div
                  className={`wb-selection-menu ${selectionMenuPosition?.placement === "below" ? "is-below" : ""}`}
                  style={{
                    left: `${selectionMenuPosition?.left ?? selectionMenuAnchor?.x ?? selectionScreenGeometry.aabb.left + selectionScreenGeometry.aabb.width / 2}px`,
                    top: `${selectionMenuPosition?.top ?? Math.max(16, selectionScreenGeometry.aabb.top - 20)}px`
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {selectedNodeIsTopLevel ? (
                    <>
                      <button className="wb-icon-button" type="button" title="复制" onClick={duplicateSelectedNode}>
                        <UiIcon name="duplicate" />
                      </button>
                      <button
                        className="wb-icon-button"
                        type="button"
                        title="AI 检查"
                        onClick={() => {
                          setSidebarCollapsed(false);
                          setSelectedSuggestionId(null);
                          void runBoardAnalysis();
                        }}
                      >
                        <UiIcon name="spark" />
                      </button>
                      <button className="wb-icon-button" type="button" title="删除" onClick={removeSelectedObject}>
                        <UiIcon name="trash" />
                      </button>
                      <button
                        className={`wb-icon-button ${moreMenuOpen ? "is-active" : ""}`}
                        type="button"
                        title="更多"
                        onClick={() => setMoreMenuOpen((value) => !value)}
                      >
                        <UiIcon name="more" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="wb-icon-button"
                        type="button"
                        title="AI 检查"
                        onClick={() => {
                          setSidebarCollapsed(false);
                          void runBoardAnalysis();
                        }}
                      >
                        <UiIcon name="spark" />
                      </button>
                      <button className="wb-icon-button" type="button" title="删除子元素" onClick={removeSelectedObject}>
                        <UiIcon name="trash" />
                      </button>
                    </>
                  )}
                </div>
              ) : null}

              {selectedNodeIsTopLevel && moreMenuOpen ? (
                <div
                  className="wb-more-menu"
                  style={{
                    left: `${moreMenuPosition?.left ?? moreMenuAnchor?.x ?? selectionScreenGeometry.aabb.left + selectionScreenGeometry.aabb.width / 2}px`,
                    top: `${moreMenuPosition?.top ?? Math.max(58, selectionScreenGeometry.aabb.top + 24)}px`
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <button className="wb-more-menu__item" type="button" onClick={bringSelectionForward}>
                    <UiIcon name="layers" />
                    <span>置前</span>
                  </button>
                  <button className="wb-more-menu__item" type="button" onClick={sendSelectionBackward}>
                    <UiIcon name="layers" />
                    <span>置后</span>
                  </button>
                  <button className="wb-more-menu__item" type="button" onClick={toggleSelectionLock}>
                    <UiIcon name={selectedNode?.locked ? "unlock" : "lock"} />
                    <span>{selectedNode?.locked ? "解锁" : "锁定"}</span>
                  </button>
                  <button className="wb-more-menu__item" type="button" onClick={focusSelection}>
                    <UiIcon name="focus" />
                    <span>定位</span>
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {importSheetOpen ? (
        <div className="wb-sheet-backdrop" onClick={() => setImportSheetOpen(false)}>
          <section className="wb-sheet" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="wb-sheet__head">
              <div className="wb-sheet__title">
                <UiIcon name="upload" />
                <strong>导入题目</strong>
              </div>
              <button className="wb-icon-button" type="button" title="关闭" onClick={() => setImportSheetOpen(false)}>
                <UiIcon name="close" />
              </button>
            </div>

            <div className="wb-segmented">
              <button
                className={`wb-segmented__item ${importMode === "text" ? "is-active" : ""}`}
                type="button"
                onClick={() => setImportMode("text")}
              >
                文本
              </button>
              <button
                className={`wb-segmented__item ${importMode === "file" ? "is-active" : ""}`}
                type="button"
                onClick={() => setImportMode("file")}
              >
                文件
              </button>
            </div>

            <form className="wb-import-form" onSubmit={handleImportSubmit}>
              {importMode === "text" ? (
                <>
                  <label className="wb-field">
                    <span>文件名</span>
                    <input value={importFilename} onChange={(event) => setImportFilename(event.target.value)} />
                  </label>
                  <label className="wb-field">
                    <span>题目文本</span>
                    <textarea
                      value={importText}
                      onChange={(event) => setImportText(event.target.value)}
                      placeholder="直接粘贴题目、已知条件或解题要求。"
                    />
                  </label>
                </>
              ) : (
                <label className="wb-dropzone">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.md,.txt,.tex,image/*,application/pdf"
                    onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                  />
                  <UiIcon name="upload" />
                  <strong>{importFile ? importFile.name : "选择图片 / PDF / 文本"}</strong>
                </label>
              )}

              <button className="wb-primary-button" type="submit" disabled={remoteBusy}>
                <UiIcon name="spark" />
                <span>导入并生成建议</span>
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="wb-toast" onPointerDown={(event) => event.stopPropagation()}>
          <span>{errorMessage}</span>
          <button className="wb-icon-button" type="button" title="关闭" onClick={() => setErrorMessage(null)}>
            <UiIcon name="close" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function normalizeDocument(document: WorkspaceDocument): WorkspaceDocument {
  return {
    ...document,
    viewport: document.viewport ?? DEFAULT_CAMERA,
    selection_state: {
      selected_object_refs: document.selection_state?.selected_object_refs ?? [],
      focused_subquestion_id: document.selection_state?.focused_subquestion_id,
      active_tool: (document.selection_state?.active_tool as ToolId | undefined) ?? "select"
    },
    suggestions: document.suggestions ?? []
  };
}

function cloneDocument(document: WorkspaceDocument): WorkspaceDocument {
  return JSON.parse(JSON.stringify(document)) as WorkspaceDocument;
}

function resolveSelection(document: WorkspaceDocument, refs: string[]): string[] {
  return refs.filter((item) => hasObjectRef(document, item));
}

function hasObjectRef(document: WorkspaceDocument, objectRef: string): boolean {
  const { nodeId, childId } = parseObjectRef(objectRef);
  const node = document.whiteboard_nodes.find((item) => item.id === nodeId);
  if (!node) {
    return false;
  }
  if (!childId) {
    return true;
  }
  if (node.kind !== "phy_canvas") {
    return false;
  }
  return parsePhyCanvasObjects(node).some((item) => item.id === childId);
}

function updateNodeRect(document: WorkspaceDocument, nodeId: string, rect: RectLike): WorkspaceDocument {
  return {
    ...document,
    whiteboard_nodes: sortNodes(
      document.whiteboard_nodes.map((node) => (node.id === nodeId ? { ...node, rect } : node))
    )
  };
}

function getNodeRect(document: WorkspaceDocument, nodeId: string): RectLike {
  return document.whiteboard_nodes.find((node) => node.id === nodeId)?.rect ?? {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    rotation: 0
  };
}

function updateRichBlock(
  document: WorkspaceDocument,
  nodeId: string,
  field: keyof RichBlockNode["payload"],
  value: string
): WorkspaceDocument {
  return {
    ...document,
    whiteboard_nodes: document.whiteboard_nodes.map((node) =>
      node.id === nodeId && node.kind === "rich_block"
        ? {
            ...node,
            payload: {
              ...node.payload,
              [field]: value
            }
          }
        : node
    )
  };
}

function duplicateNode(document: WorkspaceDocument, nodeId: string): WorkspaceDocument {
  const node = document.whiteboard_nodes.find((item) => item.id === nodeId);
  if (!node) {
    return document;
  }

  const duplicated = {
    ...cloneNode(node),
    id: makeNodeId(prefixForNode(node)),
    rect: {
      ...node.rect,
      x: node.rect.x + 28,
      y: node.rect.y + 28
    },
    z_index: Math.max(...document.whiteboard_nodes.map((item) => item.z_index), 1) + 1
  };

  return {
    ...document,
    whiteboard_nodes: sortNodes([...document.whiteboard_nodes, duplicated]),
    selection_state: {
      ...document.selection_state,
      selected_object_refs: [makeNodeObjectRef(duplicated.id)]
    }
  };
}

function setNodeOrder(document: WorkspaceDocument, nodeId: string, direction: "front" | "back"): WorkspaceDocument {
  const nodes = document.whiteboard_nodes;
  const target = nodes.find((item) => item.id === nodeId);
  if (!target) {
    return document;
  }

  const edgeValue =
    direction === "front"
      ? Math.max(...nodes.map((item) => item.z_index), 1) + 1
      : Math.min(...nodes.map((item) => item.z_index), 1) - 1;

  return {
    ...document,
    whiteboard_nodes: sortNodes(
      nodes.map((node) => (node.id === nodeId ? { ...node, z_index: edgeValue } : node))
    )
  };
}

function toggleNodeLock(document: WorkspaceDocument, nodeId: string): WorkspaceDocument {
  return {
    ...document,
    whiteboard_nodes: document.whiteboard_nodes.map((node) =>
      node.id === nodeId ? { ...node, locked: !node.locked } : node
    )
  };
}

function removeObjectReference(document: WorkspaceDocument, objectRef: string): WorkspaceDocument {
  const { nodeId, childId } = parseObjectRef(objectRef);
  if (!childId) {
    return {
      ...document,
      whiteboard_nodes: document.whiteboard_nodes.filter((node) => node.id !== nodeId),
      whiteboard_edges: document.whiteboard_edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
      suggestions: document.suggestions.filter(
        (item) => !item.target_object_refs.some((ref) => ref.startsWith(`node:${nodeId}`))
      ),
      selection_state: {
        ...document.selection_state,
        selected_object_refs: []
      }
    };
  }

  return {
    ...document,
    whiteboard_nodes: document.whiteboard_nodes.map((node) =>
      node.id === nodeId && node.kind === "phy_canvas"
        ? {
            ...node,
            payload: {
              ...node.payload,
              scene_xml: mutatePhyCanvasScene(node.payload.scene_xml, (root) => {
                const child = findPhyCanvasChild(root, childId);
                if (child) {
                  child.remove();
                }
              })
            }
          }
        : node
    ),
    suggestions: document.suggestions.filter((item) => !item.target_object_refs.includes(objectRef)),
    selection_state: {
      ...document.selection_state,
      selected_object_refs: []
    }
  };
}

function updatePhyCanvasChild(
  document: WorkspaceDocument,
  nodeId: string,
  childId: string,
  attrs: Partial<Record<"x" | "y" | "w" | "h" | "rotation", number>>
): WorkspaceDocument {
  return {
    ...document,
    whiteboard_nodes: document.whiteboard_nodes.map((node) =>
      node.id === nodeId && node.kind === "phy_canvas"
        ? {
            ...node,
            payload: {
              ...node.payload,
              scene_xml: mutatePhyCanvasScene(node.payload.scene_xml, (root) => {
                const child = findPhyCanvasChild(root, childId);
                if (!child) {
                  return;
                }

                for (const [name, value] of Object.entries(attrs)) {
                  if (typeof value === "number" && Number.isFinite(value)) {
                    child.setAttribute(name, String(value));
                  }
                }
              })
            }
          }
        : node
    )
  };
}

function cloneNode(node: WhiteboardNode): WhiteboardNode {
  return JSON.parse(JSON.stringify(node)) as WhiteboardNode;
}

function prefixForNode(node: WhiteboardNode): string {
  switch (node.kind) {
    case "source_image":
      return "source";
    case "phy_canvas":
      return "diagram";
    case "ai_annotation":
      return "ai";
    case "rich_block":
    default:
      return "block";
  }
}

function getNextNodeZIndex(document: WorkspaceDocument, count: number): number[] {
  const base = Math.max(0, ...document.whiteboard_nodes.map((item) => item.z_index));
  return Array.from({ length: count }, (_, index) => base + index + 1);
}

function rebaseNodeStack(document: WorkspaceDocument, nodes: WhiteboardNode[]): WhiteboardNode[] {
  const zIndices = getNextNodeZIndex(document, nodes.length);
  return nodes.map((node, index) => ({
    ...cloneNode(node),
    z_index: zIndices[index] ?? node.z_index
  }));
}

function clampCamera(camera: CameraState, viewportSize: SizeLike = DEFAULT_VIEWPORT_SIZE): CameraState {
  const zoom = clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM);
  const horizontalGutter = viewportSize.width / zoom;
  const verticalGutter = viewportSize.height / zoom;
  return {
    x: clamp(camera.x, -horizontalGutter, Math.max(0, WORLD_WIDTH - viewportSize.width / zoom) + horizontalGutter),
    y: clamp(camera.y, -verticalGutter, Math.max(0, WORLD_HEIGHT - viewportSize.height / zoom) + verticalGutter),
    zoom
  };
}

function clampRect(rect: RectLike): RectLike {
  return {
    ...rect,
    x: clamp(rect.x, 0, WORLD_WIDTH - rect.w),
    y: clamp(rect.y, 0, WORLD_HEIGHT - rect.h)
  };
}

function screenToWorldPoint(clientX: number, clientY: number, viewport: DOMRect, camera: CameraState): Point {
  return {
    x: (clientX - viewport.left) / camera.zoom + camera.x,
    y: (clientY - viewport.top) / camera.zoom + camera.y
  };
}

function distanceBetween(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function snapSceneValue(value: number) {
  return Math.round(value * 10) / 10;
}

function minNodeSize(kind: WhiteboardNode["kind"]) {
  switch (kind) {
    case "source_image":
      return { w: 220, h: 140 };
    case "phy_canvas":
      return { w: 280, h: 180 };
    case "ai_annotation":
      return { w: 180, h: 120 };
    case "rich_block":
    default:
      return { w: 140, h: 72 };
  }
}

function minChildSize(kind: string) {
  switch (kind) {
    case "surface":
      return { w: 72, h: 8 };
    case "force":
      return { w: 48, h: 12 };
    case "label":
      return { w: 42, h: 20 };
    case "body":
    default:
      return { w: 48, h: 36 };
  }
}

function clampPhyCanvasChildAttributes(
  node: Extract<WhiteboardNode, { kind: "phy_canvas" }>,
  child: PhyCanvasObject,
  attributes: Partial<Pick<PhyCanvasObject, "x" | "y" | "w" | "h" | "rotation">>
) {
  const bounds = {
    width: Math.max(1, node.payload.bounds.width),
    height: Math.max(1, node.payload.bounds.height)
  };
  const minimumSize = minChildSize(child.kind);
  const nextChild: PhyCanvasObject = {
    ...child,
    x: attributes.x ?? child.x,
    y: attributes.y ?? child.y,
    w: attributes.w ?? child.w,
    h: attributes.h ?? child.h,
    rotation: attributes.rotation ?? child.rotation
  };

  nextChild.w = clamp(nextChild.w, minimumSize.w, bounds.width);
  nextChild.h = clamp(nextChild.h, minimumSize.h, bounds.height);

  let geometry = getPhyCanvasChildSceneGeometry(nextChild);
  if ((typeof attributes.w === "number" || typeof attributes.h === "number") && child.kind !== "label") {
    const fitScale = Math.min(
      bounds.width / Math.max(geometry.aabb.w, 1),
      bounds.height / Math.max(geometry.aabb.h, 1),
      1
    );
    if (fitScale < 1) {
      nextChild.w = Math.max(minimumSize.w, nextChild.w * fitScale);
      nextChild.h = Math.max(minimumSize.h, nextChild.h * fitScale);
      geometry = getPhyCanvasChildSceneGeometry(nextChild);
    }
  }
  const dx = clampAabbOffset(geometry.aabb.x, geometry.aabb.x + geometry.aabb.w, bounds.width);
  const dy = clampAabbOffset(geometry.aabb.y, geometry.aabb.y + geometry.aabb.h, bounds.height);
  nextChild.x += dx;
  nextChild.y += dy;

  const nextAttributes: Partial<Record<"x" | "y" | "w" | "h" | "rotation", number>> = {
    ...attributes,
    x: snapSceneValue(nextChild.x),
    y: snapSceneValue(nextChild.y)
  };

  if (typeof attributes.w === "number" || nextChild.w !== child.w) {
    nextAttributes.w = snapSceneValue(nextChild.w);
  }
  if (typeof attributes.h === "number" || nextChild.h !== child.h) {
    nextAttributes.h = snapSceneValue(nextChild.h);
  }
  if (typeof attributes.rotation === "number") {
    nextAttributes.rotation = snapSceneValue(nextChild.rotation);
  }

  return nextAttributes;
}

function clampAabbOffset(min: number, max: number, limit: number) {
  if (max - min > limit) {
    return limit / 2 - (min + max) / 2;
  }
  if (min < 0) {
    return -min;
  }
  if (max > limit) {
    return limit - max;
  }
  return 0;
}

function sameCamera(left: CameraState, right: CameraState) {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

function focusCameraOnRect(
  rect: RectLike,
  zoom: number,
  viewportRect: DOMRect,
  insets: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 }
) {
  const usableWidth = Math.max(120, viewportRect.width - insets.left - insets.right);
  const usableHeight = Math.max(120, viewportRect.height - insets.top - insets.bottom);
  const screenCenterX = insets.left + usableWidth / 2;
  const screenCenterY = insets.top + usableHeight / 2;
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  return {
    x: centerX - screenCenterX / zoom,
    y: centerY - screenCenterY / zoom,
    zoom
  };
}

function fitCameraToNodes(
  nodes: WhiteboardNode[],
  viewportRect: DOMRect,
  insets: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 }
) {
  const bounds = getDocumentBounds(nodes);
  const padding = 96;
  const usableWidth = Math.max(160, viewportRect.width - insets.left - insets.right - padding);
  const usableHeight = Math.max(160, viewportRect.height - insets.top - insets.bottom - padding);
  const nextZoom = clamp(
    Math.min(
      usableWidth / Math.max(bounds.w, 320),
      usableHeight / Math.max(bounds.h, 240)
    ),
    MIN_ZOOM,
    Math.min(1.25, MAX_ZOOM)
  );

  return focusCameraOnRect(bounds, nextZoom, viewportRect, insets);
}

function getOverlaySafeInsets(
  viewportRect: DOMRect | null,
  topbarRect: DOMRect | null,
  dockRect: DOMRect | null,
  sidebarRect: DOMRect | null
): EdgeInsets {
  const insets: EdgeInsets = { top: 16, right: 16, bottom: 16, left: 16 };
  if (!viewportRect) {
    return insets;
  }

  if (topbarRect) {
    insets.top = Math.max(insets.top, topbarRect.bottom - viewportRect.top + 12);
  }
  if (dockRect) {
    if (dockRect.height > dockRect.width) {
      insets.left = Math.max(insets.left, dockRect.right - viewportRect.left + 12);
    } else {
      insets.bottom = Math.max(insets.bottom, viewportRect.bottom - dockRect.top + 12);
    }
  }
  if (sidebarRect) {
    if (sidebarRect.height > sidebarRect.width) {
      insets.right = Math.max(insets.right, viewportRect.right - sidebarRect.left + 12);
    } else {
      insets.bottom = Math.max(insets.bottom, viewportRect.bottom - sidebarRect.top + 12);
    }
  }

  return insets;
}

function clampMarkerPosition(left: number, top: number, viewportRect: DOMRect, insets: EdgeInsets) {
  const size = 34;
  return {
    left: clamp(left, insets.left, viewportRect.width - insets.right - size),
    top: clamp(top, insets.top, viewportRect.height - insets.bottom - size)
  };
}

function isNativeTextInputTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest("input, textarea, select, [contenteditable='true']");
}

function getSelectionMenuPosition(anchor: Point, rect: ScreenRect, viewportRect: DOMRect, insets: EdgeInsets) {
  const menuWidth = 220;
  const menuHeight = 54;
  const centerX = clamp(
    anchor.x,
    insets.left + menuWidth / 2,
    viewportRect.width - insets.right - menuWidth / 2
  );
  const placeBelow = anchor.y - insets.top < menuHeight + 18;
  return {
    left: centerX,
    top: placeBelow
      ? Math.min(viewportRect.height - insets.bottom - menuHeight, rect.top + rect.height + 14)
      : Math.max(insets.top + menuHeight, Math.min(anchor.y - 18, rect.top - 18)),
    placement: placeBelow ? ("below" as const) : ("above" as const)
  };
}

function getMoreMenuPosition(anchor: Point, rect: ScreenRect, viewportRect: DOMRect, insets: EdgeInsets) {
  const menuWidth = 182;
  const menuHeight = 180;
  return {
    left: clamp(
      anchor.x,
      insets.left + menuWidth / 2,
      viewportRect.width - insets.right - menuWidth / 2
    ),
    top: clamp(
      Math.max(anchor.y + 18, rect.top + rect.height + 22),
      insets.top + 48,
      viewportRect.height - insets.bottom - menuHeight
    )
  };
}

function getMoveHandlePosition(
  geometry: ScreenTransformGeometry,
  viewportRect: DOMRect,
  insets: EdgeInsets
) {
  const offset = 24;
  const handleRadius = 16;
  const outward = {
    x: geometry.corners.nw.x - geometry.center.x,
    y: geometry.corners.nw.y - geometry.center.y
  };
  const length = Math.hypot(outward.x, outward.y) || 1;
  const x = geometry.corners.nw.x + (outward.x / length) * offset;
  const y = geometry.corners.nw.y + (outward.y / length) * offset;

  return {
    x: clamp(x, insets.left + handleRadius, viewportRect.width - insets.right - handleRadius),
    y: clamp(y, insets.top + handleRadius, viewportRect.height - insets.bottom - handleRadius)
  };
}

function getResizedChildAttributes(
  child: PhyCanvasObject,
  geometry: TransformGeometry,
  resized: { center: Point; width: number; height: number }
) {
  if (child.kind === "force") {
    const pivot = {
      x: resized.center.x - geometry.axisXUnit.x * (resized.width / 2),
      y: resized.center.y - geometry.axisXUnit.y * (resized.width / 2)
    };
    return {
      x: snapSceneValue(pivot.x),
      y: snapSceneValue(pivot.y - resized.height / 2),
      w: snapSceneValue(resized.width),
      h: snapSceneValue(resized.height)
    };
  }

  return {
    x: snapSceneValue(resized.center.x - resized.width / 2),
    y: snapSceneValue(resized.center.y - resized.height / 2),
    w: snapSceneValue(resized.width),
    h: snapSceneValue(resized.height)
  };
}

function getPointerAngleDegrees(pointer: Point, pivot: Point) {
  return (Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x) * 180) / Math.PI;
}

function getAngleDeltaDegrees(startAngle: number, currentAngle: number) {
  return normalizeAngleDegrees(currentAngle - startAngle);
}

function normalizeAngleDegrees(angle: number) {
  let normalized = angle % 360;
  if (normalized > 180) {
    normalized -= 360;
  }
  if (normalized <= -180) {
    normalized += 360;
  }
  return normalized;
}

function snapAngle(angle: number, step: number) {
  return Math.round(angle / step) * step;
}

function formatAngleDegrees(angle: number) {
  const rounded = Math.round(normalizeAngleDegrees(angle));
  return `${Object.is(rounded, -0) ? 0 : rounded}°`;
}

function richBlockDefaultTitle(node: Extract<WhiteboardNode, { kind: "rich_block" }>) {
  switch (node.payload.block_role) {
    case "condition":
      return "已知条件";
    case "derivation":
      return "推导";
    case "equation":
      return "公式";
    default:
      return "笔记";
  }
}

function suggestionKindLabel(kind: BoardSuggestion["kind"]) {
  switch (kind) {
    case "diagram_rebuild":
      return "重建";
    case "force_completion":
      return "补力";
    case "equation_hint":
      return "列式";
    case "label_fix":
      return "标注";
    case "next_step":
    default:
      return "下一步";
  }
}

function suggestionTargetLabel(document: WorkspaceDocument, suggestion: BoardSuggestion) {
  const target = suggestion.target_object_refs[0];
  if (!target) {
    return "当前板面";
  }
  const { nodeId, childId } = parseObjectRef(target);
  const node = document.whiteboard_nodes.find((item) => item.id === nodeId);
  if (!node) {
    return "当前板面";
  }
  if (!childId) {
    return node.kind === "rich_block"
      ? node.payload.title ?? richBlockDefaultTitle(node)
      : node.kind === "phy_canvas"
        ? node.payload.summary ?? "受力分析图"
        : node.kind === "source_image"
          ? node.payload.caption ?? node.payload.alt
          : node.payload.title;
  }
  if (node.kind !== "phy_canvas") {
    return "局部对象";
  }
  const child = parsePhyCanvasObjects(node).find((item) => item.id === childId);
  return child?.label ?? child?.text ?? childId;
}

function saveStateLabel(state: SaveState) {
  switch (state) {
    case "dirty":
      return "未保存";
    case "saving":
      return "保存中";
    case "error":
      return "保存失败";
    case "idle":
    default:
      return "已保存";
  }
}

function aiStateLabel(state: AiState) {
  switch (state) {
    case "queued":
      return "待分析";
    case "analyzing-source":
      return "解析中";
    case "analyzing-board":
      return "检查中";
    case "error":
      return "AI 异常";
    case "idle":
    default:
      return "AI 就绪";
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "发生未知错误。";
}
