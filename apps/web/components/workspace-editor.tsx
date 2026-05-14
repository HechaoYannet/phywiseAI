"use client";

import type { BoardSuggestion, WorkspaceDocument } from "@phywise/contracts";
import type { PhyCanvasNode, RichBlockNode, WhiteboardNode } from "@phywise/whiteboard-schema";
import { makeNodeId } from "@phywise/whiteboard-schema";
import type {
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
import {
  documentToRuntimeShapes,
  makeNodeObjectRef,
  parseObjectRef,
  parsePhyCanvasObjects,
  sortNodes
} from "../lib/board-adapter";
import { type BoardTool, createForceAnalysisTemplate, createNodeFromTool } from "../lib/workspace-presets";

interface WorkspaceEditorProps {
  workspaceId: string;
}

interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

interface Point {
  x: number;
  y: number;
}

interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
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
      start: Point;
      originRect: RectLike;
      snapshot: WorkspaceDocument;
      didMutate: boolean;
    }
  | {
      kind: "rotate-node";
      pointerId: number;
      nodeId: string;
      center: Point;
      startAngle: number;
      originRotation: number;
      snapshot: WorkspaceDocument;
      didMutate: boolean;
    };

const WORLD_WIDTH = 5200;
const WORLD_HEIGHT = 3600;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.6;
const AUTOSAVE_DELAY = 900;
const ANALYZE_DELAY = 1400;
const MAX_HISTORY = 40;
const DEFAULT_CAMERA: CameraState = { x: 120, y: 80, zoom: 1 };

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
  const workspaceRef = useRef<WorkspaceDocument | null>(null);
  const cameraRef = useRef<CameraState>(DEFAULT_CAMERA);
  const interactionRef = useRef<InteractionState | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const analyzeTimerRef = useRef<number | null>(null);
  const changeVersionRef = useRef(0);
  const editingBaselineRef = useRef<Record<string, WorkspaceDocument>>({});

  const [workspace, setWorkspace] = useState<WorkspaceDocument | null>(null);
  const [camera, setCamera] = useState<CameraState>(DEFAULT_CAMERA);
  const [historyPast, setHistoryPast] = useState<WorkspaceDocument[]>([]);
  const [historyFuture, setHistoryFuture] = useState<WorkspaceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [aiState, setAiState] = useState<AiState>("idle");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [importMode, setImportMode] = useState<"text" | "file">("text");
  const [importText, setImportText] = useState("");
  const [importFilename, setImportFilename] = useState("problem.md");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("wb-no-scroll");
    return () => {
      document.body.classList.remove("wb-no-scroll");
    };
  }, []);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

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
        workspaceRef.current = normalized;
        setWorkspace(normalized);
        setCamera(normalized.viewport ?? DEFAULT_CAMERA);
        setHistoryPast([]);
        setHistoryFuture([]);
        setSaveState("idle");
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
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        !!target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveCurrentWorkspace(true);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelectedNode();
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
        const rect = targetRef ? getObjectWorldRect(workspace, targetRef) : null;
        if (!rect) {
          return null;
        }
        const screenRect = worldRectToScreenRect(rect, camera);
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

  const selectionWorldRect = useMemo(() => {
    if (!workspace || !selectedObjectRef) {
      return null;
    }
    return getObjectWorldRect(workspace, selectedObjectRef);
  }, [workspace, selectedObjectRef]);

  const selectionScreenRect = useMemo(() => {
    if (!selectionWorldRect) {
      return null;
    }
    return worldRectToScreenRect(selectionWorldRect, camera);
  }, [camera, selectionWorldRect]);

  async function saveCurrentWorkspace(force = false) {
    const current = workspaceRef.current;
    if (!current) {
      return;
    }

    if (!force && saveState !== "dirty") {
      return;
    }

    const snapshot = normalizeDocument({
      ...cloneDocument(current),
      viewport: cameraRef.current
    });
    const saveVersion = changeVersionRef.current;
    setSaveState("saving");

    try {
      const result = await saveWorkspace(workspaceId, { document: snapshot });
      if (changeVersionRef.current === saveVersion) {
        applyServerWorkspace(result, { preserveSelection: true, preserveTool: true });
        setSaveState("idle");
      } else {
        const next = workspaceRef.current;
        if (next) {
          const merged = {
            ...next,
            updated_at: result.updated_at,
            revision_id: result.revision_id
          };
          workspaceRef.current = merged;
          setWorkspace(merged);
        }
        setSaveState("dirty");
      }
    } catch (error) {
      setSaveState("error");
      setErrorMessage(toMessage(error));
    }
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
    if (!current) {
      return;
    }

    setAiState("analyzing-board");
    try {
      const result = await analyzeWorkspaceBoard(workspaceId, {
        selected_object_refs: current.selection_state.selected_object_refs ?? []
      });
      applyServerWorkspace(result, { preserveSelection: true, preserveTool: true });
      setAiState("idle");
    } catch (error) {
      setAiState("error");
      setErrorMessage(toMessage(error));
    }
  }

  function applyServerWorkspace(
    nextDocument: WorkspaceDocument,
    options?: { preserveSelection?: boolean; preserveTool?: boolean }
  ) {
    const current = workspaceRef.current;
    const normalized = normalizeDocument(nextDocument);
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

    workspaceRef.current = merged;
    setWorkspace(merged);
  }

  function commitWorkspace(
    updater: (document: WorkspaceDocument) => WorkspaceDocument,
    options?: { persist?: boolean; pushHistory?: boolean; analyze?: boolean }
  ) {
    const current = workspaceRef.current;
    if (!current) {
      return;
    }

    const snapshot = cloneDocument(current);
    const nextDocument = normalizeDocument(updater(cloneDocument(current)));
    nextDocument.viewport = cameraRef.current;
    workspaceRef.current = nextDocument;
    setWorkspace(nextDocument);

    if (options?.pushHistory) {
      pushHistorySnapshot(snapshot);
    }

    if (options?.persist) {
      changeVersionRef.current += 1;
      setSaveState("dirty");
    }

    if (options?.analyze) {
      scheduleBoardAnalysis();
    }
  }

  function pushHistorySnapshot(snapshot: WorkspaceDocument) {
    setHistoryPast((previous) => [...previous.slice(-(MAX_HISTORY - 1)), cloneDocument(snapshot)]);
    setHistoryFuture([]);
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
      { persist }
    );
    setMoreMenuOpen(false);
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
      {}
    );
  }

  function insertNodeAt(worldPoint: Point, tool: Exclude<ToolId, "select">) {
    const anchorX = Math.max(48, worldPoint.x - (tool === "diagram" ? 180 : 140));
    const anchorY = Math.max(48, worldPoint.y - (tool === "diagram" ? 120 : 90));
    const nextNode = createNodeFromTool(tool, anchorX, anchorY);
    commitWorkspace(
      (document) => ({
        ...document,
        whiteboard_nodes: sortNodes([...document.whiteboard_nodes, nextNode]),
        selection_state: {
          ...document.selection_state,
          selected_object_refs: [makeNodeObjectRef(nextNode.id)],
          active_tool: "select"
        }
      }),
      { persist: true, pushHistory: true, analyze: true }
    );
  }

  function insertTemplate() {
    commitWorkspace(
      (document) => ({
        ...document,
        whiteboard_nodes: sortNodes([...document.whiteboard_nodes, ...createForceAnalysisTemplate()]),
        selection_state: {
          ...document.selection_state,
          selected_object_refs: [],
          active_tool: "select"
        }
      }),
      { persist: true, pushHistory: true, analyze: true }
    );
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

    const viewport = viewportRef.current.getBoundingClientRect();
    const nextCamera = clampCamera({
      x: selectionWorldRect.x + selectionWorldRect.w / 2 - viewport.width / camera.zoom / 2,
      y: selectionWorldRect.y + selectionWorldRect.h / 2 - viewport.height / camera.zoom / 2,
      zoom: camera.zoom
    });
    setCamera(nextCamera);
  }

  function fitAll() {
    if (!workspaceRef.current || !viewportRef.current) {
      return;
    }

    const nodes = workspaceRef.current.whiteboard_nodes;
    if (!nodes.length) {
      setCamera(DEFAULT_CAMERA);
      return;
    }

    const viewport = viewportRef.current.getBoundingClientRect();
    const padding = 220;
    const bounds = getDocumentBounds(nodes);
    const nextZoom = clamp(
      Math.min(
        (viewport.width - padding) / Math.max(bounds.w, 320),
        (viewport.height - padding) / Math.max(bounds.h, 240)
      ),
      MIN_ZOOM,
      Math.min(1.25, MAX_ZOOM)
    );

    setCamera(
      clampCamera({
        x: bounds.x + bounds.w / 2 - viewport.width / nextZoom / 2,
        y: bounds.y + bounds.h / 2 - viewport.height / nextZoom / 2,
        zoom: nextZoom
      })
    );
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
    });
    setCamera(nextCamera);
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

    if (event.button !== 0 && event.pointerType === "mouse") {
      return;
    }

    const viewport = viewportRef.current?.getBoundingClientRect();
    if (!viewport) {
      return;
    }

    if (activeTool !== "select") {
      const worldPoint = screenToWorldPoint(event.clientX, event.clientY, viewport, cameraRef.current);
      insertNodeAt(worldPoint, activeTool);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
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

    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (interaction.kind === "pan" && interaction.pointerId === event.pointerId) {
      const dx = event.clientX - interaction.start.x;
      const dy = event.clientY - interaction.start.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        interaction.moved = true;
      }
      setCamera(
        clampCamera({
          x: interaction.originCamera.x - dx / interaction.originCamera.zoom,
          y: interaction.originCamera.y - dy / interaction.originCamera.zoom,
          zoom: interaction.originCamera.zoom
        })
      );
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
      });
      setCamera(nextCamera);
    }
  }

  function handleViewportPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
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
  }

  function startNodeDrag(event: ReactPointerEvent<HTMLElement>, node: WhiteboardNode) {
    if (activeTool !== "select" || node.locked) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, button")) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
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

  function startNodeResize(event: ReactPointerEvent<HTMLButtonElement>, node: WhiteboardNode) {
    if (node.locked) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      kind: "resize-node",
      pointerId: event.pointerId,
      nodeId: node.id,
      start: { x: event.clientX, y: event.clientY },
      originRect: node.rect,
      snapshot: cloneDocument(workspaceRef.current!),
      didMutate: false
    };
  }

  function startNodeRotate(event: ReactPointerEvent<HTMLButtonElement>, node: WhiteboardNode) {
    if (!viewportRef.current || node.locked) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const center = {
      x: node.rect.x + node.rect.w / 2,
      y: node.rect.y + node.rect.h / 2
    };
    const viewport = viewportRef.current.getBoundingClientRect();
    const pointerWorld = screenToWorldPoint(event.clientX, event.clientY, viewport, cameraRef.current);
    interactionRef.current = {
      kind: "rotate-node",
      pointerId: event.pointerId,
      nodeId: node.id,
      center,
      startAngle: Math.atan2(pointerWorld.y - center.y, pointerWorld.x - center.x),
      originRotation: node.rect.rotation ?? 0,
      snapshot: cloneDocument(workspaceRef.current!),
      didMutate: false
    };
  }

  function handleNodeInteractionMove(event: ReactPointerEvent<HTMLElement | HTMLButtonElement>) {
    const interaction = interactionRef.current;
    if (!interaction || !workspaceRef.current || !viewportRef.current) {
      return;
    }

    if (!("pointerId" in interaction) || interaction.pointerId !== event.pointerId) {
      return;
    }

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
      const dx = (event.clientX - interaction.start.x) / cameraRef.current.zoom;
      const dy = (event.clientY - interaction.start.y) / cameraRef.current.zoom;
      const nextRect = clampRect({
        ...interaction.originRect,
        w: Math.max(180, interaction.originRect.w + dx),
        h: Math.max(96, interaction.originRect.h + dy)
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
      const angle =
        (Math.atan2(pointerWorld.y - interaction.center.y, pointerWorld.x - interaction.center.x) -
          interaction.startAngle) *
        (180 / Math.PI);
      interaction.didMutate = true;
      commitWorkspace(
        (document) =>
          updateNodeRect(document, interaction.nodeId, {
            ...getNodeRect(document, interaction.nodeId),
            rotation: interaction.originRotation + angle
          }),
        { persist: true }
      );
    }
  }

  function finishNodeInteraction(event: ReactPointerEvent<HTMLElement | HTMLButtonElement>) {
    const interaction = interactionRef.current;
    if (!interaction || !("pointerId" in interaction) || interaction.pointerId !== event.pointerId) {
      return;
    }

    if (
      (interaction.kind === "drag-node" ||
        interaction.kind === "resize-node" ||
        interaction.kind === "rotate-node") &&
      interaction.didMutate
    ) {
      pushHistorySnapshot(interaction.snapshot);
      scheduleBoardAnalysis();
    }

    interactionRef.current = null;
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
      const attached = await attachWorkspaceSource(workspaceId, formData);
      applyServerWorkspace(attached, { preserveTool: true });
      const analyzed = await analyzeWorkspaceSource(workspaceId, {});
      applyServerWorkspace(analyzed, { preserveTool: true });
      setAiState("idle");
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
      const next = await acceptWorkspaceSuggestion(workspaceId, suggestionId);
      applyServerWorkspace(next, { preserveTool: true });
      setSaveState("idle");
      setAiState("idle");
    } catch (error) {
      setErrorMessage(toMessage(error));
    }
  }

  async function handleRejectSuggestion(suggestionId: string) {
    try {
      const next = await rejectWorkspaceSuggestion(workspaceId, suggestionId);
      applyServerWorkspace(next, { preserveSelection: true, preserveTool: true });
      setSaveState("idle");
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
    workspaceRef.current = restored;
    setWorkspace(restored);
    changeVersionRef.current += 1;
    setSaveState("dirty");
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
    workspaceRef.current = restored;
    setWorkspace(restored);
    changeVersionRef.current += 1;
    setSaveState("dirty");
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
  }

  function handleChildSelect(nodeId: string, childId: string) {
    updateSelection([`node:${nodeId}#child:${childId}`], false);
  }

  function handleSuggestionMarkerClick(suggestion: BoardSuggestion) {
    const target = suggestion.target_object_refs[0];
    if (target) {
      updateSelection([target], false);
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
    const rect = getObjectWorldRect(workspaceRef.current, target);
    if (!rect || !viewportRef.current) {
      return;
    }

    const viewport = viewportRef.current.getBoundingClientRect();
    setCamera(
      clampCamera({
        x: rect.x + rect.w / 2 - viewport.width / camera.zoom / 2,
        y: rect.y + rect.h / 2 - viewport.height / camera.zoom / 2,
        zoom: camera.zoom
      })
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
    transform: `translate(${-camera.x}px, ${-camera.y}px) scale(${camera.zoom})`
  };

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
      <div className="wb-topbar" onPointerDown={(event) => event.stopPropagation()}>
        <div className="wb-topbar__cluster">
          <input
            className="wb-title-input"
            value={workspace.title}
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

      <div className="wb-dock wb-dock--left" onPointerDown={(event) => event.stopPropagation()}>
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
                        <p>{suggestion.reason}</p>
                      </button>
                      <div className="wb-suggestion-card__actions">
                        <button className="wb-mini-button" type="button" onClick={() => void handleAcceptSuggestion(suggestion.id)}>
                          <UiIcon name="check" />
                          <span>接受</span>
                        </button>
                        <button className="wb-mini-button wb-mini-button--ghost" type="button" onClick={() => void handleRejectSuggestion(suggestion.id)}>
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
        onWheel={(event: ReactWheelEvent<HTMLDivElement>) => {
          if (!viewportRef.current) {
            return;
          }
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            zoomAt(event.clientX, event.clientY, camera.zoom - event.deltaY * 0.0025);
            return;
          }
          setCamera(
            clampCamera({
              x: cameraRef.current.x + event.deltaX / cameraRef.current.zoom,
              y: cameraRef.current.y + event.deltaY / cameraRef.current.zoom,
              zoom: cameraRef.current.zoom
            })
          );
        }}
      >
        <div className="wb-grid" />
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
                onClick={() => handleNodeSelect(node.id)}
              >
                {node.kind === "source_image" ? (
                  <button className="wb-image-node" type="button" onClick={() => handleNodeSelect(node.id)}>
                    {node.payload.preview_key ? (
                      <img src={buildPreviewUrl(node.payload.preview_key)} alt={node.payload.alt} />
                    ) : null}
                    <div className="wb-image-node__caption">
                      <span>{node.payload.caption ?? node.payload.alt}</span>
                    </div>
                  </button>
                ) : null}

                {node.kind === "rich_block" ? (
                  <div className={`wb-rich-block wb-rich-block--${node.payload.block_role}`}>
                    <div className="wb-rich-block__eyebrow">{shape.title}</div>
                    {isSelected ? (
                      <div className="wb-rich-block__editor">
                        <input
                          value={node.payload.title ?? ""}
                          onFocus={() => handleRichBlockFocus(node.id)}
                          onBlur={() => handleRichBlockBlur(node.id)}
                          onChange={(event) => updateRichBlockField(node.id, "title", event.target.value)}
                          placeholder="标题"
                          aria-label="块标题"
                        />
                        <textarea
                          value={node.payload.content}
                          onFocus={() => handleRichBlockFocus(node.id)}
                          onBlur={() => handleRichBlockBlur(node.id)}
                          onChange={(event) => updateRichBlockField(node.id, "content", event.target.value)}
                          aria-label="块内容"
                        />
                      </div>
                    ) : (
                      <div className="wb-rich-block__preview">
                        <strong>{node.payload.title ?? richBlockDefaultTitle(node)}</strong>
                        <p>{node.payload.content}</p>
                      </div>
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
                      preserveAspectRatio="none"
                    >
                      {parsePhyCanvasObjects(node).map((item) => {
                        const childSelected = selectedObjectRef === item.objectRef;
                        const commonProps = {
                          className: `wb-phy-shape wb-phy-shape--${item.kind} ${childSelected ? "is-selected" : ""}`,
                          onPointerDown: (event: ReactPointerEvent<SVGElement>) => {
                            event.stopPropagation();
                            handleChildSelect(node.id, item.id);
                          },
                          onClick: (event: ReactMouseEvent<SVGElement>) => {
                            event.stopPropagation();
                            handleChildSelect(node.id, item.id);
                          }
                        };

                        if (item.kind === "body") {
                          return (
                            <g key={item.id} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`} {...commonProps}>
                              <rect width={item.w} height={item.h} rx="16" />
                              <text x={item.w / 2} y={item.h / 2 + 5} textAnchor="middle">
                                {item.label ?? "物体"}
                              </text>
                            </g>
                          );
                        }

                        if (item.kind === "surface") {
                          return (
                            <g key={item.id} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`} {...commonProps}>
                              <rect width={item.w} height={item.h} rx="6" />
                              <text x={item.w / 2} y="-8" textAnchor="middle">
                                {item.label ?? "接触面"}
                              </text>
                            </g>
                          );
                        }

                        if (item.kind === "force") {
                          return (
                            <g key={item.id} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`} {...commonProps}>
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
                  <button className="wb-ai-card" type="button" onClick={() => handleNodeSelect(node.id)}>
                    <div className="wb-ai-card__head">
                      <UiIcon name="spark" />
                      <span>{node.payload.title}</span>
                    </div>
                    <p>{node.payload.text}</p>
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="wb-overlay-layer">
          {workspace.whiteboard_nodes.length === 0 ? (
            <div className="wb-empty-state" onPointerDown={(event) => event.stopPropagation()}>
              <button className="wb-empty-state__button" type="button" onClick={() => updateActiveTool("block")}>
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

          {suggestionMarkers.map((marker) => (
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

          {selectionScreenRect ? (
            <>
              <div
                className={`wb-selection-frame ${selectedNodeIsTopLevel ? "is-node" : "is-child"}`}
                style={{
                  left: `${selectionScreenRect.left}px`,
                  top: `${selectionScreenRect.top}px`,
                  width: `${selectionScreenRect.width}px`,
                  height: `${selectionScreenRect.height}px`
                }}
              >
                {selectedNodeIsTopLevel && selectedNode ? (
                  <>
                    <button
                      className="wb-selection-handle wb-selection-handle--rotate"
                      type="button"
                      title="旋转"
                      onPointerDown={(event) => startNodeRotate(event, selectedNode)}
                      onPointerMove={handleNodeInteractionMove}
                      onPointerUp={finishNodeInteraction}
                    />
                    <button
                      className="wb-selection-handle wb-selection-handle--resize"
                      type="button"
                      title="缩放"
                      onPointerDown={(event) => startNodeResize(event, selectedNode)}
                      onPointerMove={handleNodeInteractionMove}
                      onPointerUp={finishNodeInteraction}
                    />
                  </>
                ) : null}
              </div>

              <div
                className="wb-selection-menu"
                style={{
                  left: `${selectionScreenRect.left + selectionScreenRect.width / 2}px`,
                  top: `${Math.max(16, selectionScreenRect.top - 20)}px`
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

              {selectedNodeIsTopLevel && moreMenuOpen ? (
                <div
                  className="wb-more-menu"
                  style={{
                    left: `${selectionScreenRect.left + selectionScreenRect.width / 2}px`,
                    top: `${Math.max(58, selectionScreenRect.top + 24)}px`
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

              <button className="wb-primary-button" type="submit">
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
              scene_xml: mutateSceneXml(node.payload.scene_xml, (root) => {
                const child = findSceneChild(root, childId);
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

function getObjectWorldRect(document: WorkspaceDocument, objectRef: string): RectLike | null {
  const { nodeId, childId } = parseObjectRef(objectRef);
  const node = document.whiteboard_nodes.find((item) => item.id === nodeId);
  if (!node) {
    return null;
  }
  if (!childId) {
    return node.rect;
  }
  if (node.kind !== "phy_canvas") {
    return node.rect;
  }

  const child = parsePhyCanvasObjects(node).find((item) => item.id === childId);
  if (!child) {
    return node.rect;
  }
  const scaleX = node.rect.w / node.payload.bounds.width;
  const scaleY = node.rect.h / node.payload.bounds.height;
  return {
    x: node.rect.x + child.x * scaleX,
    y: node.rect.y + child.y * scaleY,
    w: Math.max(40, child.w * scaleX),
    h: Math.max(28, child.h * scaleY),
    rotation: child.rotation
  };
}

function worldRectToScreenRect(rect: RectLike, camera: CameraState) {
  return {
    left: (rect.x - camera.x) * camera.zoom,
    top: (rect.y - camera.y) * camera.zoom,
    width: rect.w * camera.zoom,
    height: rect.h * camera.zoom
  };
}

function clampCamera(camera: CameraState): CameraState {
  return {
    x: clamp(camera.x, 0, Math.max(0, WORLD_WIDTH - 240 / camera.zoom)),
    y: clamp(camera.y, 0, Math.max(0, WORLD_HEIGHT - 180 / camera.zoom)),
    zoom: clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM)
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

function getDocumentBounds(nodes: WhiteboardNode[]) {
  const minX = Math.min(...nodes.map((node) => node.rect.x));
  const minY = Math.min(...nodes.map((node) => node.rect.y));
  const maxX = Math.max(...nodes.map((node) => node.rect.x + node.rect.w));
  const maxY = Math.max(...nodes.map((node) => node.rect.y + node.rect.h));
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  };
}

function mutateSceneXml(sceneXml: string, updater: (root: Element) => void): string {
  if (typeof DOMParser === "undefined") {
    return sceneXml;
  }
  const document = new DOMParser().parseFromString(sceneXml, "application/xml");
  const root = document.documentElement;
  if (!root) {
    return sceneXml;
  }
  updater(root);
  return new XMLSerializer().serializeToString(root);
}

function findSceneChild(root: Element, childId: string) {
  return Array.from(root.children).find((item) => item.getAttribute("id") === childId) ?? null;
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
