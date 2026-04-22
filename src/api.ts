import type {
  ApiEnvelope,
  AppSettings,
  AppStatus,
  ExportFormat,
  CaptureMode,
  HistorySnapshot,
  PreflightIssue,
  Project,
  ProjectSummary,
  Step,
  TrashItem
} from "./types";
import { hostedApi, isHostedBrowserRuntime } from "./hostedApi";

const API_BASE = import.meta.env.VITE_INSTRADOC_API ?? "http://127.0.0.1:8765";

export function getStepImageUrl(projectId: string, stepId: string, cacheKey = "") {
  const params = cacheKey ? `?v=${encodeURIComponent(cacheKey)}` : "";
  return `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/steps/${encodeURIComponent(stepId)}/image${params}`;
}

export function getExportDownloadUrl(projectId: string, path: string) {
  if (path.startsWith("blob:") || path.startsWith("data:")) return path;
  return `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/export/download?path=${encodeURIComponent(path)}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });
  const envelope = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !envelope.ok) {
    throw new Error(envelope.error?.message || `Request failed: ${res.status}`);
  }
  return envelope.data as T;
}

const sidecarApi = {
  status: () => request<AppStatus>("/api/app/status"),
  settings: () => request<AppSettings>("/api/settings"),
  saveSettings: (settings: Partial<AppSettings>) =>
    request<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(settings) }),
  projects: () => request<ProjectSummary[]>("/api/projects"),
  createProject: (payload: { name: string; author?: string; description?: string; folder?: string }) =>
    request<Project>("/api/projects", { method: "POST", body: JSON.stringify(payload) }),
  project: (projectId: string) => request<Project>(`/api/projects/${encodeURIComponent(projectId)}`),
  updateProject: (projectId: string, payload: Partial<Project>) =>
    request<Project>(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  importSteps: (projectId: string, paths: string[]) =>
    request<{ project: Project; steps: Step[] }>(`/api/projects/${encodeURIComponent(projectId)}/steps/import`, {
      method: "POST",
      body: JSON.stringify({ paths })
    }),
  uploadSteps: (projectId: string, files: Array<{ name: string; dataBase64: string }>) =>
    request<{ project: Project; steps: Step[] }>(`/api/projects/${encodeURIComponent(projectId)}/steps/upload`, {
      method: "POST",
      body: JSON.stringify({ files })
    }),
  captureStep: (projectId: string, mode: CaptureMode, rect?: { x: number; y: number; w: number; h: number }) =>
    request<{ project: Project; step: Step }>(`/api/projects/${encodeURIComponent(projectId)}/capture`, {
      method: "POST",
      body: JSON.stringify({ mode, rect })
    }),
  updateStep: (projectId: string, stepId: string, payload: Partial<Step>) =>
    request<Project>(`/api/projects/${encodeURIComponent(projectId)}/steps/${encodeURIComponent(stepId)}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  deleteStep: (projectId: string, stepId: string) =>
    request<Project>(`/api/projects/${encodeURIComponent(projectId)}/steps/${encodeURIComponent(stepId)}`, {
      method: "DELETE"
    }),
  reorderSteps: (projectId: string, stepIds: string[]) =>
    request<Project>(`/api/projects/${encodeURIComponent(projectId)}/steps/reorder`, {
      method: "POST",
      body: JSON.stringify({ stepIds })
    }),
  preflight: (projectId: string) =>
    request<{ issues: PreflightIssue[]; hasCritical: boolean }>(
      `/api/projects/${encodeURIComponent(projectId)}/preflight`,
      { method: "POST", body: "{}" }
    ),
  exportProject: (projectId: string, format: ExportFormat) =>
    request<{ path: string; downloadName?: string; paths?: string[]; format: ExportFormat }>(
      `/api/projects/${encodeURIComponent(projectId)}/export`,
      { method: "POST", body: JSON.stringify({ format, mode: "web" }) }
    ),
  exportDownloadUrl: getExportDownloadUrl,
  hideRecentProject: (projectId: string) =>
    request<ProjectSummary[]>("/api/projects/recent/hide", {
      method: "POST",
      body: JSON.stringify({ projectId })
    }),
  listHistory: (projectId: string) =>
    request<{ items: HistorySnapshot[] }>(`/api/projects/${encodeURIComponent(projectId)}/history`),
  createSnapshot: (projectId: string, reason: string, comment = "") =>
    request<{ snapshotId: string; items: HistorySnapshot[] }>(`/api/projects/${encodeURIComponent(projectId)}/history`, {
      method: "POST",
      body: JSON.stringify({ action: "snapshot", reason, comment })
    }),
  restoreSnapshot: (projectId: string, snapshotId: string) =>
    request<{ project: Project }>(`/api/projects/${encodeURIComponent(projectId)}/history`, {
      method: "POST",
      body: JSON.stringify({ action: "restore", snapshotId })
    }),
  listTrash: (projectId: string) =>
    request<{ items: TrashItem[] }>(`/api/projects/${encodeURIComponent(projectId)}/trash`),
  restoreTrashItem: (projectId: string, itemId: string) =>
    request<{ step: Step | null; project: Project; items: TrashItem[] }>(`/api/projects/${encodeURIComponent(projectId)}/trash`, {
      method: "POST",
      body: JSON.stringify({ action: "restore", itemId })
    }),
  deleteTrashItem: (projectId: string, itemId: string) =>
    request<{ deleted: boolean; items: TrashItem[] }>(`/api/projects/${encodeURIComponent(projectId)}/trash`, {
      method: "POST",
      body: JSON.stringify({ action: "delete", itemId })
    }),
  clearTrash: (projectId: string) =>
    request<{ items: TrashItem[] }>(`/api/projects/${encodeURIComponent(projectId)}/trash`, {
      method: "POST",
      body: JSON.stringify({ action: "clear" })
    }),
  stepImageUrl: getStepImageUrl,
  exportProjectArchive: async (_project: Project) => {
    throw new Error("Project archive export is available in hosted-browser mode.");
  },
  importProjectArchive: async (_file: File) => {
    throw new Error("Project archive import is available in hosted-browser mode.");
  }
};

export const api = isHostedBrowserRuntime ? hostedApi : sidecarApi;
