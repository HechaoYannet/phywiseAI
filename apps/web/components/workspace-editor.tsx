"use client";

import type { BoardSuggestion, WorkspaceDocument } from "@phywise/contracts";
import type { WhiteboardNode } from "@phywise/whiteboard-schema";
import { useEffect, useMemo, useRef, useState } from "react";

import { documentToRuntimeShapes, sortNodes } from "../lib/board-adapter";
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
import { type BoardTool, createForceAnalysisTemplate, createNodeFromTool } from "../lib/workspace-presets";

interface WorkspaceEditorProps {
  workspaceId: string;
}

interface DragState {
  nodeId: string;
  originX: number;
  originY: number;
  pointerX: number;
  pointerY: number;
  snapshot: WorkspaceDocument;
}

const TOOLS: Array<{
  id: BoardTool;
  label: string;
  description: string;
  disabled?: boolean;
}> = [
  { id: "select", label: "选择", description: "拖拽、框定和编辑已有节点。" },
  { id: "text", label: "文本", description: "写题意、步骤和中间判断。" },
  { id: "formula", label: "公式", description: "放置平衡式、分解式和推导。" },
  { id: "body", label: "物体", description: "添加受力主体。" },
  { id: "surface", label: "斜面", description: "添加接触面或斜面。" },
  { id: "force", label: "力箭头", description: "添加受力方向和标签。" },
  { id: "condition", label: "条件", description: "整理题干中的已知条件。" },
  { id: "import", label: "导入", description: "把图片、PDF 或文本导入当前工作台。" }
];

function cloneDocument(document: WorkspaceDocument): WorkspaceDocument {
  return JSON.parse(JSON.stringify(document)) as WorkspaceDocument;
}

function stableSnapshot(document: WorkspaceDocument): string {
  return JSON.stringify({
    ...document,
    selection_state: {
      ...document.selection_state,
      selected_node_ids: [],
      active_tool: null
    },
    updated_at: null,
    revision_id: null
  });
}

function hasAnalyzableContent(document: WorkspaceDocument): boolean {
  return document.whiteboard_nodes.some((node) =>
    [
      "source_image",
      "free_text",
      "formula_block",
      "physics_body",
      "surface_line",
      "force_arrow",
      "condition_card"
    ].includes(node.kind)
  );
}

function buildAnalysisSignature(document: WorkspaceDocument): string {
  return JSON.stringify({
    source_asset_id: document.source_asset_id,
    nodes: document.whiteboard_nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      role: node.semantic_role,
      rect: node.rect,
      payload: node.payload
    }))
  });
}

function findNode(document: WorkspaceDocument | null, nodeId: string | undefined): WhiteboardNode | null {
  if (!document || !nodeId) {
    return null;
  }
  return document.whiteboard_nodes.find((node) => node.id === nodeId) ?? null;
}

function nextSelection(document: WorkspaceDocument, selectedNodeIds: string[]): WorkspaceDocument {
  return {
    ...document,
    selection_state: {
      ...document.selection_state,
      selected_node_ids: selectedNodeIds
    }
  };
}

function suggestionAnchor(
  workspace: WorkspaceDocument,
  suggestion: BoardSuggestion,
  index: number
): { left: number; top: number } {
  const target = suggestion.target_node_ids
    .map((nodeId) => workspace.whiteboard_nodes.find((node) => node.id === nodeId))
    .find(Boolean);
  if (target) {
    return {
      left: target.rect.x + target.rect.w + 18,
      top: target.rect.y + index * 8
    };
  }
  return {
    left: 1120,
    top: 100 + index * 150
  };
}

export function WorkspaceEditor({ workspaceId }: WorkspaceEditorProps) {
  const [workspace, setWorkspace] = useState<WorkspaceDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState("加载中");
  const [aiState, setAiState] = useState("空闲");
  const [activeTool, setActiveTool] = useState<BoardTool>("select");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [undoStack, setUndoStack] = useState<WorkspaceDocument[]>([]);
  const [redoStack, setRedoStack] = useState<WorkspaceDocument[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<"file" | "text">("file");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFilename, setImportFilename] = useState("board-problem.md");
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<WorkspaceDocument | null>(null);
  const lastSavedSnapshot = useRef("");
  const saveTimer = useRef<number | null>(null);
  const analyzeTimer = useRef<number | null>(null);
  const lastAnalyzeSignature = useRef("");

  function replaceWorkspace(nextWorkspace: WorkspaceDocument) {
    workspaceRef.current = nextWorkspace;
    setWorkspace(nextWorkspace);
  }

  function commitWorkspace(nextWorkspace: WorkspaceDocument, options?: { recordHistory?: boolean; historyBase?: WorkspaceDocument }) {
    const current = workspaceRef.current;
    if (!current) {
      replaceWorkspace(nextWorkspace);
      return;
    }

    if (stableSnapshot(current) === stableSnapshot(nextWorkspace)) {
      replaceWorkspace(nextWorkspace);
      return;
    }

    if (options?.recordHistory ?? true) {
      const historyBase = cloneDocument(options?.historyBase ?? current);
      setUndoStack((items) => [...items.slice(-39), historyBase]);
      setRedoStack([]);
    }

    replaceWorkspace(nextWorkspace);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await getWorkspace(workspaceId);
        if (cancelled) {
          return;
        }
        replaceWorkspace(result);
        lastSavedSnapshot.current = stableSnapshot(result);
        lastAnalyzeSignature.current = buildAnalysisSignature(result);
        setSaveState("已加载");
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "加载工作台失败。");
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
    if (!drag || !workspaceRef.current) {
      return;
    }

    const activeDrag = drag;

    function handlePointerMove(event: PointerEvent) {
      const current = workspaceRef.current;
      if (!current) {
        return;
      }

      const nextWorkspace = cloneDocument(current);
      nextWorkspace.whiteboard_nodes = sortNodes(
        nextWorkspace.whiteboard_nodes.map((node) =>
          node.id === activeDrag.nodeId
            ? {
                ...node,
                rect: {
                  ...node.rect,
                  x: Math.max(24, activeDrag.originX + (event.clientX - activeDrag.pointerX)),
                  y: Math.max(24, activeDrag.originY + (event.clientY - activeDrag.pointerY))
                }
              }
            : node
        )
      );
      replaceWorkspace(nextWorkspace);
    }

    function handlePointerUp() {
      const current = workspaceRef.current;
      if (
        current &&
        stableSnapshot(current) !== stableSnapshot(activeDrag.snapshot)
      ) {
        setUndoStack((items) => [...items.slice(-39), cloneDocument(activeDrag.snapshot)]);
        setRedoStack([]);
      }
      setDrag(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [drag]);

  useEffect(() => {
    if (!workspace || loading) {
      return;
    }

    const snapshot = stableSnapshot(workspace);
    if (snapshot === lastSavedSnapshot.current) {
      return;
    }

    setSaveState("待保存");
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
    }

    const payload = cloneDocument(workspace);
    saveTimer.current = window.setTimeout(async () => {
      try {
        setSaveState("保存中");
        const snapshotAtDispatch = stableSnapshot(payload);
        const saved = await saveWorkspace(workspaceId, { document: payload });
        const current = workspaceRef.current;
        lastSavedSnapshot.current = stableSnapshot(saved);

        if (current && stableSnapshot(current) === snapshotAtDispatch) {
          replaceWorkspace(saved);
          setSaveState("已保存");
        } else {
          setSaveState("待保存");
        }
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "保存失败。");
        setSaveState("保存失败");
      }
    }, 900);

    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, [loading, workspace, workspaceId]);

  useEffect(() => {
    if (!workspace || loading || !hasAnalyzableContent(workspace)) {
      return;
    }

    const signature = buildAnalysisSignature(workspace);
    if (signature === lastAnalyzeSignature.current) {
      return;
    }

    if (analyzeTimer.current !== null) {
      window.clearTimeout(analyzeTimer.current);
    }

    analyzeTimer.current = window.setTimeout(async () => {
      try {
        lastAnalyzeSignature.current = signature;
        setAiState("自动检查中");
        const result = await analyzeWorkspaceBoard(workspaceId, {
          selected_node_ids: workspace.selection_state.selected_node_ids ?? []
        });
        replaceWorkspace(result);
        setAiState(
          result.suggestions.some((item) => item.status === "pending") ? "有新建议" : "空闲"
        );
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "AI 检查失败。");
        setAiState("检查失败");
      }
    }, 1500);

    return () => {
      if (analyzeTimer.current !== null) {
        window.clearTimeout(analyzeTimer.current);
      }
    };
  }, [loading, workspace, workspaceId]);

  const runtimeShapes = useMemo(
    () => (workspace ? documentToRuntimeShapes(workspace) : []),
    [workspace]
  );
  const pendingSuggestions = useMemo(
    () => workspace?.suggestions.filter((item) => item.status === "pending") ?? [],
    [workspace]
  );
  const selectedNodeId = workspace?.selection_state.selected_node_ids?.[0];
  const selectedNode = findNode(workspace, selectedNodeId);

  function updateDocument(mutator: (document: WorkspaceDocument) => WorkspaceDocument, recordHistory = true) {
    const current = workspaceRef.current;
    if (!current) {
      return;
    }
    const nextWorkspace = mutator(cloneDocument(current));
    commitWorkspace(nextWorkspace, { recordHistory });
  }

  function handleSelect(nodeId: string) {
    updateDocument((document) => nextSelection(document, [nodeId]), false);
  }

  function handleBoardClick(event: React.PointerEvent<HTMLDivElement>) {
    if (!workspaceRef.current || !boardRef.current) {
      return;
    }

    if (
      !(event.target instanceof HTMLElement) ||
      event.target.dataset.boardCanvas !== "true"
    ) {
      return;
    }

    if (activeTool === "select") {
      updateDocument((document) => nextSelection(document, []), false);
      return;
    }

    if (activeTool === "import") {
      setImportOpen(true);
      return;
    }

    const boardRect = boardRef.current.getBoundingClientRect();
    const x = event.clientX - boardRect.left + boardRef.current.scrollLeft - 80;
    const y = event.clientY - boardRect.top + boardRef.current.scrollTop - 60;
    const nextNode = createNodeFromTool(activeTool, Math.max(40, x), Math.max(40, y));
    updateDocument((document) => {
      const nextDocument = cloneDocument(document);
      nextDocument.whiteboard_nodes = sortNodes([...nextDocument.whiteboard_nodes, nextNode]);
      nextDocument.selection_state.selected_node_ids = [nextNode.id];
      nextDocument.selection_state.active_tool = activeTool;
      return nextDocument;
    });
  }

  function handleUndo() {
    if (!undoStack.length) {
      return;
    }
    const current = workspaceRef.current;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((items) => items.slice(0, -1));
    if (current) {
      setRedoStack((items) => [...items.slice(-39), cloneDocument(current)]);
    }
    replaceWorkspace(cloneDocument(previous));
  }

  function handleRedo() {
    if (!redoStack.length) {
      return;
    }
    const current = workspaceRef.current;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((items) => items.slice(0, -1));
    if (current) {
      setUndoStack((items) => [...items.slice(-39), cloneDocument(current)]);
    }
    replaceWorkspace(cloneDocument(next));
  }

  async function handleImportSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (importBusy) {
      return;
    }
    if (importMode === "file" && !importFile) {
      return;
    }
    if (importMode === "text" && !importText.trim()) {
      return;
    }

    setImportBusy(true);
    setError(null);
    setAiState("导入中");

    try {
      const formData = new FormData();
      if (importMode === "file" && importFile) {
        formData.append("file", importFile);
      } else {
        formData.append("text_content", importText);
        formData.append("filename", importFilename);
      }

      const attached = await attachWorkspaceSource(workspaceId, formData);
      replaceWorkspace(attached);
      setAiState("解析导入内容中");
      const analyzed = await analyzeWorkspaceSource(workspaceId, {});
      replaceWorkspace(analyzed);
      lastAnalyzeSignature.current = buildAnalysisSignature(analyzed);
      setImportOpen(false);
      setImportFile(null);
      setImportText("");
      setAiState(analyzed.suggestions.some((item) => item.status === "pending") ? "有新建议" : "空闲");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "导入失败。");
      setAiState("导入失败");
    } finally {
      setImportBusy(false);
    }
  }

  async function handleAnalyzeSelection() {
    if (!workspaceRef.current) {
      return;
    }

    try {
      setAiState("手动检查中");
      const analyzed = await analyzeWorkspaceBoard(workspaceId, {
        selected_node_ids: workspaceRef.current.selection_state.selected_node_ids ?? []
      });
      replaceWorkspace(analyzed);
      lastAnalyzeSignature.current = buildAnalysisSignature(analyzed);
      setAiState(analyzed.suggestions.some((item) => item.status === "pending") ? "有新建议" : "空闲");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "检查失败。");
      setAiState("检查失败");
    }
  }

  async function handleSuggestionAction(suggestionId: string, action: "accept" | "reject") {
    try {
      setAiState(action === "accept" ? "应用建议中" : "更新建议中");
      const result =
        action === "accept"
          ? await acceptWorkspaceSuggestion(workspaceId, suggestionId)
          : await rejectWorkspaceSuggestion(workspaceId, suggestionId);
      replaceWorkspace(result);
      lastAnalyzeSignature.current = buildAnalysisSignature(result);
      setAiState(result.suggestions.some((item) => item.status === "pending") ? "有新建议" : "空闲");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "建议操作失败。");
      setAiState("操作失败");
    }
  }

  function insertTemplate() {
    updateDocument((document) => {
      const nextDocument = cloneDocument(document);
      nextDocument.whiteboard_nodes = sortNodes([
        ...nextDocument.whiteboard_nodes,
        ...createForceAnalysisTemplate()
      ]);
      nextDocument.selection_state.selected_node_ids = [];
      return nextDocument;
    });
  }

  function resetBoard() {
    updateDocument((document) => ({
      ...document,
      whiteboard_nodes: [],
      whiteboard_edges: [],
      suggestions: [],
      selection_state: {
        ...document.selection_state,
        selected_node_ids: []
      }
    }));
  }

  function updateSelectedNode(nextNode: WhiteboardNode) {
    updateDocument((document) => ({
      ...document,
      whiteboard_nodes: sortNodes(
        document.whiteboard_nodes.map((node) => (node.id === nextNode.id ? nextNode : node))
      )
    }));
  }

  function removeSelectedNode() {
    if (!selectedNode) {
      return;
    }
    updateDocument((document) => ({
      ...document,
      whiteboard_nodes: sortNodes(document.whiteboard_nodes.filter((node) => node.id !== selectedNode.id)),
      suggestions: document.suggestions.filter((item) => !item.target_node_ids.includes(selectedNode.id)),
      selection_state: {
        ...document.selection_state,
        selected_node_ids: []
      }
    }));
  }

  if (loading) {
    return <main className="launch-shell">正在加载工作台…</main>;
  }

  if (!workspace) {
    return <main className="launch-shell">未找到工作台。</main>;
  }

  return (
    <main className="board-workspace-shell">
      <header className="workspace-topbar">
        <div className="topbar-title">
          <span className="eyebrow">Force Analysis Workspace</span>
          <input
            className="workspace-title-input"
            value={workspace.title}
            onChange={(event) =>
              updateDocument((document) => ({ ...document, title: event.target.value }), false)
            }
          />
          <p>默认从空白画板进入，导入题目、受力图构建、列式和 AI 检查都在同一工作区内完成。</p>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-link action-button" onClick={() => setImportOpen(true)}>
            文件
          </button>
          <button
            type="button"
            className="secondary-link action-button"
            onClick={handleUndo}
            disabled={!undoStack.length}
          >
            撤销
          </button>
          <button
            type="button"
            className="secondary-link action-button"
            onClick={handleRedo}
            disabled={!redoStack.length}
          >
            重做
          </button>
          <button type="button" className="primary-link action-button" onClick={handleAnalyzeSelection}>
            {workspace.selection_state.selected_node_ids?.length ? "检查这部分" : "检查全板"}
          </button>
          <div className="state-pill">
            <strong>保存</strong>
            <span>{saveState}</span>
          </div>
          <div className="state-pill">
            <strong>AI</strong>
            <span>{aiState}</span>
          </div>
        </div>
      </header>

      <section className="workspace-stage">
        <aside className="tool-rail">
          <div className="workspace-card">
            <div className="card-head">
              <h2>工具</h2>
              <span className="status-tag">{activeTool}</span>
            </div>
            <div className="tool-list">
              {TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className={tool.id === activeTool ? "tool-button active-tool" : "tool-button"}
                  onClick={() => {
                    setActiveTool(tool.id);
                    if (tool.id === "import") {
                      setImportOpen(true);
                    }
                    updateDocument(
                      (document) => ({
                        ...document,
                        selection_state: {
                          ...document.selection_state,
                          active_tool: tool.id
                        }
                      }),
                      false
                    );
                  }}
                  disabled={tool.disabled}
                >
                  <strong>{tool.label}</strong>
                  <span>{tool.description}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="board-stage">
          <div className="starter-bar">
            <button type="button" className="secondary-link action-button" onClick={resetBoard}>
              空白开始
            </button>
            <button type="button" className="secondary-link action-button" onClick={() => setImportOpen(true)}>
              导入题目
            </button>
            <button type="button" className="secondary-link action-button" onClick={insertTemplate}>
              插入受力分析模板
            </button>
          </div>

          <div
            ref={boardRef}
            className="board-surface-v2"
            onPointerDown={handleBoardClick}
          >
            <div className="board-canvas" data-board-canvas="true">
              {runtimeShapes.map((shape) => (
                <BoardShape
                  key={shape.id}
                  shape={shape}
                  selected={workspace.selection_state.selected_node_ids?.includes(shape.nodeId) ?? false}
                  onSelect={() => handleSelect(shape.nodeId)}
                  onDragStart={(event) =>
                    setDrag({
                      nodeId: shape.nodeId,
                      originX: shape.node.rect.x,
                      originY: shape.node.rect.y,
                      pointerX: event.clientX,
                      pointerY: event.clientY,
                      snapshot: cloneDocument(workspace)
                    })
                  }
                />
              ))}

              {pendingSuggestions.map((suggestion, index) => {
                const anchor = suggestionAnchor(workspace, suggestion, index);
                return (
                  <article
                    key={suggestion.id}
                    className="suggestion-float"
                    style={{ left: `${anchor.left}px`, top: `${anchor.top}px` }}
                  >
                    <span className="node-kind">{suggestion.kind}</span>
                    <p>{suggestion.reason}</p>
                    <div className="suggestion-actions">
                      <button
                        type="button"
                        className="primary-link action-button"
                        onClick={() => handleSuggestionAction(suggestion.id, "accept")}
                      >
                        接受
                      </button>
                      <button
                        type="button"
                        className="secondary-link action-button"
                        onClick={() => handleSuggestionAction(suggestion.id, "reject")}
                      >
                        拒绝
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="inspector-rail">
          <div className="workspace-card">
            <div className="card-head">
              <h2>板面状态</h2>
              <span className="status-tag">{workspace.whiteboard_nodes.length} nodes</span>
            </div>
            <ul className="compact-list">
              <li>问题 ID：{workspace.problem_id ?? "空白工作台"}</li>
              <li>资源 ID：{workspace.source_asset_id ?? "尚未导入"}</li>
              <li>当前 revision：{workspace.revision_id ?? "待生成"}</li>
            </ul>
          </div>

          <div className="workspace-card">
            <div className="card-head">
              <h2>AI 建议</h2>
              <span className="status-tag">{pendingSuggestions.length} pending</span>
            </div>
            {pendingSuggestions.length ? (
              <div className="suggestion-list">
                {pendingSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="suggestion-list-item"
                    onClick={() => {
                      const target = item.target_node_ids[0];
                      if (target) {
                        handleSelect(target);
                      }
                    }}
                  >
                    <strong>{item.kind}</strong>
                    <span>{item.reason}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="status-note">当前没有待处理建议。</p>
            )}
          </div>

          {importOpen ? (
            <div className="workspace-card">
              <div className="card-head">
                <h2>导入题目</h2>
                <span className="status-tag">板内导入</span>
              </div>
              <div className="mode-switch">
                <button
                  type="button"
                  className={importMode === "file" ? "mode-button active-mode" : "mode-button"}
                  onClick={() => setImportMode("file")}
                >
                  文件
                </button>
                <button
                  type="button"
                  className={importMode === "text" ? "mode-button active-mode" : "mode-button"}
                  onClick={() => setImportMode("text")}
                >
                  文本
                </button>
              </div>
              <form className="upload-form" onSubmit={handleImportSubmit}>
                {importMode === "file" ? (
                  <label className="file-drop">
                    <span>选择图片、PDF 或文本文件</span>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.pdf,.md,.txt,.tex"
                      onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                    />
                    <small>{importFile ? importFile.name : "支持 JPG / PNG / PDF / MD / TXT / TEX"}</small>
                  </label>
                ) : (
                  <div className="text-entry">
                    <label className="stacked-field">
                      <span>文件名</span>
                      <input
                        value={importFilename}
                        onChange={(event) => setImportFilename(event.target.value)}
                      />
                    </label>
                    <label className="stacked-field">
                      <span>题目文本</span>
                      <textarea
                        rows={8}
                        value={importText}
                        onChange={(event) => setImportText(event.target.value)}
                        placeholder="粘贴题干、小问和已知条件。"
                      />
                    </label>
                  </div>
                )}
                <div className="submit-row">
                  <button type="submit" className="primary-link" disabled={importBusy}>
                    {importBusy ? "处理中" : "导入并分析"}
                  </button>
                  <button
                    type="button"
                    className="secondary-link action-button"
                    onClick={() => setImportOpen(false)}
                  >
                    关闭
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          <div className="workspace-card">
            <div className="card-head">
              <h2>检查器</h2>
              <span className="status-tag">{selectedNode ? selectedNode.kind : "无选中"}</span>
            </div>
            {selectedNode ? (
              <>
                <NodeInspector node={selectedNode} onChange={updateSelectedNode} />
                <div className="submit-row">
                  <button type="button" className="secondary-link action-button" onClick={removeSelectedNode}>
                    删除节点
                  </button>
                </div>
              </>
            ) : (
              <p className="status-note">选择一个节点后，可在这里编辑文字、方向、标签和语义角色。</p>
            )}
          </div>

          {error ? <p className="error-copy">{error}</p> : null}
        </aside>
      </section>
    </main>
  );
}

function BoardShape({
  shape,
  selected,
  onSelect,
  onDragStart
}: {
  shape: ReturnType<typeof documentToRuntimeShapes>[number];
  selected: boolean;
  onSelect: () => void;
  onDragStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const { node } = shape;
  const commonStyle = {
    left: `${node.rect.x}px`,
    top: `${node.rect.y}px`,
    width: `${node.rect.w}px`,
    height: `${node.rect.h}px`,
    transform: node.rect.rotation ? `rotate(${node.rect.rotation}deg)` : undefined
  };

  if (shape.kind === "surface") {
    return (
      <div
        className={selected ? "surface-node selected-node" : "surface-node"}
        style={commonStyle}
        onClick={onSelect}
      >
        <button type="button" className="shape-dragger" onPointerDown={onDragStart}>
          拖动
        </button>
        <span>{shape.title}</span>
      </div>
    );
  }

  if (shape.kind === "force") {
    return (
      <div
        className={selected ? "force-node selected-node" : "force-node"}
        style={commonStyle}
        onClick={onSelect}
      >
        <button type="button" className="shape-dragger" onPointerDown={onDragStart}>
          拖动
        </button>
        <span className="force-label">{shape.title}</span>
      </div>
    );
  }

  if (shape.kind === "body") {
    return (
      <div
        className={selected ? "body-node-card selected-node" : "body-node-card"}
        style={commonStyle}
        onClick={onSelect}
      >
        <button type="button" className="shape-dragger" onPointerDown={onDragStart}>
          拖动
        </button>
        <strong>{shape.title}</strong>
        {shape.subtitle ? <span>{shape.subtitle}</span> : null}
      </div>
    );
  }

  if (shape.kind === "image" && node.kind === "source_image") {
    const previewKey = String(node.payload.preview_key ?? "");
    return (
      <div
        className={selected ? "board-card-node image-node-card selected-node" : "board-card-node image-node-card"}
        style={commonStyle}
        onClick={onSelect}
      >
        <button type="button" className="shape-dragger" onPointerDown={onDragStart}>
          拖动
        </button>
        {previewKey ? <img src={buildPreviewUrl(previewKey)} alt={String(node.payload.alt ?? "题图")} /> : null}
        <strong>{shape.title}</strong>
      </div>
    );
  }

  return (
    <div
      className={selected ? "board-card-node selected-node" : "board-card-node"}
      style={commonStyle}
      onClick={onSelect}
    >
      <button type="button" className="shape-dragger" onPointerDown={onDragStart}>
        拖动
      </button>
      <span className="node-kind">{node.kind}</span>
      <strong>{shape.title}</strong>
      {shape.subtitle ? <p>{shape.subtitle}</p> : null}
    </div>
  );
}

function NodeInspector({
  node,
  onChange
}: {
  node: WhiteboardNode;
  onChange: (node: WhiteboardNode) => void;
}) {
  function updatePayload(partialPayload: Record<string, unknown>) {
    onChange({ ...node, payload: { ...node.payload, ...partialPayload } } as WhiteboardNode);
  }

  function updateRect(partialRect: Partial<WhiteboardNode["rect"]>) {
    onChange({ ...node, rect: { ...node.rect, ...partialRect } } as WhiteboardNode);
  }

  return (
    <div className="node-form">
      <label className="stacked-field">
        <span>语义角色</span>
        <input
          value={node.semantic_role ?? ""}
          onChange={(event) => onChange({ ...node, semantic_role: event.target.value })}
        />
      </label>

      {node.kind === "free_text" ? (
        <label className="stacked-field">
          <span>文本</span>
          <textarea
            rows={6}
            value={String(node.payload.text ?? node.payload.markdown ?? "")}
            onChange={(event) =>
              updatePayload({ text: event.target.value, markdown: event.target.value })
            }
          />
        </label>
      ) : null}

      {node.kind === "formula_block" ? (
        <>
          <label className="stacked-field">
            <span>LaTeX</span>
            <input
              value={String(node.payload.latex ?? "")}
              onChange={(event) => updatePayload({ latex: event.target.value })}
            />
          </label>
          <label className="stacked-field">
            <span>说明</span>
            <textarea
              rows={4}
              value={String(node.payload.explanation ?? "")}
              onChange={(event) => updatePayload({ explanation: event.target.value })}
            />
          </label>
        </>
      ) : null}

      {node.kind === "physics_body" ? (
        <>
          <label className="stacked-field">
            <span>物体标签</span>
            <input
              value={String(node.payload.label ?? "")}
              onChange={(event) => updatePayload({ label: event.target.value })}
            />
          </label>
          <label className="stacked-field">
            <span>备注</span>
            <textarea
              rows={3}
              value={String(node.payload.notes ?? "")}
              onChange={(event) => updatePayload({ notes: event.target.value })}
            />
          </label>
        </>
      ) : null}

      {node.kind === "surface_line" ? (
        <>
          <label className="stacked-field">
            <span>表面标签</span>
            <input
              value={String(node.payload.label ?? "")}
              onChange={(event) => updatePayload({ label: event.target.value })}
            />
          </label>
          <label className="stacked-field">
            <span>倾角</span>
            <input
              value={String(node.payload.angle_text ?? "")}
              onChange={(event) => updatePayload({ angle_text: event.target.value })}
            />
          </label>
          <label className="stacked-field">
            <span>旋转角度</span>
            <input
              type="number"
              value={Number(node.rect.rotation ?? 0)}
              onChange={(event) => updateRect({ rotation: Number(event.target.value) })}
            />
          </label>
        </>
      ) : null}

      {node.kind === "force_arrow" ? (
        <>
          <label className="stacked-field">
            <span>力标签</span>
            <input
              value={String(node.payload.label ?? "")}
              onChange={(event) => updatePayload({ label: event.target.value })}
            />
          </label>
          <label className="stacked-field">
            <span>大小/备注</span>
            <input
              value={String(node.payload.magnitude_text ?? node.payload.notes ?? "")}
              onChange={(event) =>
                updatePayload({ magnitude_text: event.target.value, notes: event.target.value })
              }
            />
          </label>
          <label className="stacked-field">
            <span>方向角度</span>
            <input
              type="number"
              value={Number(node.rect.rotation ?? node.payload.direction_deg ?? 0)}
              onChange={(event) => {
                const direction = Number(event.target.value);
                onChange({
                  ...node,
                  rect: { ...node.rect, rotation: direction },
                  payload: { ...node.payload, direction_deg: direction }
                } as WhiteboardNode);
              }}
            />
          </label>
        </>
      ) : null}

      {node.kind === "condition_card" ? (
        <>
          <label className="stacked-field">
            <span>条件标签</span>
            <input
              value={String(node.payload.label ?? "")}
              onChange={(event) => updatePayload({ label: event.target.value })}
            />
          </label>
          <label className="stacked-field">
            <span>条件值</span>
            <textarea
              rows={4}
              value={String(node.payload.value ?? "")}
              onChange={(event) => updatePayload({ value: event.target.value })}
            />
          </label>
        </>
      ) : null}

      {node.kind === "source_image" ? (
        <label className="stacked-field">
          <span>题图标题</span>
          <input
            value={String(node.payload.caption ?? node.payload.alt ?? "")}
            onChange={(event) => updatePayload({ caption: event.target.value, alt: event.target.value })}
          />
        </label>
      ) : null}

      {node.kind === "ai_annotation" ? (
        <>
          <label className="stacked-field">
            <span>标题</span>
            <input
              value={String(node.payload.title ?? "")}
              onChange={(event) => updatePayload({ title: event.target.value })}
            />
          </label>
          <label className="stacked-field">
            <span>内容</span>
            <textarea
              rows={5}
              value={String(node.payload.text ?? "")}
              onChange={(event) => updatePayload({ text: event.target.value })}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}
