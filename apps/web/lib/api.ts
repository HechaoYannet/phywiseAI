import type {
  AnalyzeBoardInput,
  AnalyzeSourceInput,
  CreateParseJobInput,
  CreateWorkspaceInput,
  ParseJob,
  ProblemParseResult,
  SourceAsset,
  UpdateWorkspaceInput,
  WorkspaceDocument
} from "@phywise/contracts";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8000";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function createUpload(formData: FormData): Promise<SourceAsset> {
  const response = await fetch(`${API_ORIGIN}/api/uploads`, {
    method: "POST",
    body: formData
  });

  return handleResponse<SourceAsset>(response);
}

export async function createParseJob(input: CreateParseJobInput): Promise<ParseJob> {
  const response = await fetch(`${API_ORIGIN}/api/problems/parse-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<ParseJob>(response);
}

export async function getParseJob(jobId: string): Promise<ParseJob> {
  const response = await fetch(`${API_ORIGIN}/api/problems/parse-jobs/${jobId}`, {
    cache: "no-store"
  });

  return handleResponse<ParseJob>(response);
}

export async function getProblem(problemId: string): Promise<ProblemParseResult> {
  const response = await fetch(`${API_ORIGIN}/api/problems/${problemId}`, {
    cache: "no-store"
  });

  return handleResponse<ProblemParseResult>(response);
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceDocument> {
  const response = await fetch(`${API_ORIGIN}/api/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<WorkspaceDocument>(response);
}

export async function getWorkspace(workspaceId: string): Promise<WorkspaceDocument> {
  const response = await fetch(`${API_ORIGIN}/api/workspaces/${workspaceId}`, {
    cache: "no-store"
  });

  return handleResponse<WorkspaceDocument>(response);
}

export async function saveWorkspace(
  workspaceId: string,
  input: UpdateWorkspaceInput
): Promise<WorkspaceDocument> {
  const response = await fetch(`${API_ORIGIN}/api/workspaces/${workspaceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<WorkspaceDocument>(response);
}

export async function attachWorkspaceSource(
  workspaceId: string,
  formData: FormData
): Promise<WorkspaceDocument> {
  const response = await fetch(`${API_ORIGIN}/api/workspaces/${workspaceId}/sources`, {
    method: "POST",
    body: formData
  });

  return handleResponse<WorkspaceDocument>(response);
}

export async function analyzeWorkspaceSource(
  workspaceId: string,
  input: AnalyzeSourceInput = {}
): Promise<WorkspaceDocument> {
  const response = await fetch(`${API_ORIGIN}/api/workspaces/${workspaceId}/analyze-source`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<WorkspaceDocument>(response);
}

export async function analyzeWorkspaceBoard(
  workspaceId: string,
  input: AnalyzeBoardInput
): Promise<WorkspaceDocument> {
  const response = await fetch(`${API_ORIGIN}/api/workspaces/${workspaceId}/analyze-board`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<WorkspaceDocument>(response);
}

export async function acceptWorkspaceSuggestion(
  workspaceId: string,
  suggestionId: string
): Promise<WorkspaceDocument> {
  const response = await fetch(
    `${API_ORIGIN}/api/workspaces/${workspaceId}/suggestions/${suggestionId}/accept`,
    {
      method: "POST"
    }
  );

  return handleResponse<WorkspaceDocument>(response);
}

export async function rejectWorkspaceSuggestion(
  workspaceId: string,
  suggestionId: string
): Promise<WorkspaceDocument> {
  const response = await fetch(
    `${API_ORIGIN}/api/workspaces/${workspaceId}/suggestions/${suggestionId}/reject`,
    {
      method: "POST"
    }
  );

  return handleResponse<WorkspaceDocument>(response);
}

export function buildPreviewUrl(previewKey: string): string {
  return `${API_ORIGIN}/api/uploads/previews/${previewKey}`;
}
