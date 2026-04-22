export type AnnotationType =
  | "arrow"
  | "rect"
  | "circle"
  | "text"
  | "blur"
  | "number"
  | "highlight"
  | "crop"
  | "freehand";

export type CaptureMode = "fullscreen" | "activeWindow" | "region" | "import";
export type ExportFormat = "pdf" | "docx" | "html" | "images";

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface AppStatus {
  appName: string;
  version: string;
  versionLabel: "Beta v.2";
  runtimeMode: "local-dev" | "desktop" | "hosted";
  capabilities: {
    localSave: boolean;
    desktopCapture: boolean;
    browserCapture: boolean;
    guestProjects: boolean;
    authenticatedProjects: boolean;
  };
  baseDir: string;
  projectsDir: string;
  exportDir: string;
  figmaHandoff: "pending" | "ready";
}

export interface AppSettings {
  language: "ru" | "en";
  theme_mode: "light" | "dark";
  capture_hotkey: string;
  overlay_hotkey: string;
  save_hotkey: string;
  export_pdf_hotkey: string;
  home_hotkey: string;
  default_projects_folder: string;
  default_export_folder: string;
  default_author: string;
  recent_projects: string[];
  annotation_color: string;
  annotation_width: number;
  autosave: boolean;
  preflight_mode: "warning" | "strict";
  [key: string]: unknown;
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  x: number;
  y: number;
  x2: number;
  y2: number;
  text: string;
  color: string;
  font_size: number;
  line_width: number;
  number: number;
  opacity: number;
  angle: number;
}

export interface Note {
  id: string;
  type: "info" | "warning" | "tip";
  text: string;
}

export interface Step {
  id: string;
  image_path: string;
  title: string;
  description: string;
  notes: Note[];
  annotations: Annotation[];
  tags: string[];
  order: number;
  crop_rect?: { x: number; y: number; w: number; h: number } | null;
}

export interface Project {
  id: string;
  folder: string;
  schema_version: number;
  name: string;
  description: string;
  author: string;
  version: string;
  created: string;
  modified: string;
  tags: string[];
  steps: Step[];
  orientation: "portrait" | "landscape";
  watermark: string;
  last_pdf_path: string;
  lastPdfPath?: string;
  history: Record<string, unknown>;
  wizard_profile: Record<string, unknown>;
  ai_settings: Record<string, unknown>;
}

export interface ProjectSummary {
  id: string;
  folder: string;
  name: string;
  description: string;
  author: string;
  version: string;
  modified: string;
  created: string;
  stepCount: number;
  lastPdfPath: string;
  status: "draft" | "exported";
  loadError?: string;
}

export interface PreflightIssue {
  severity: "info" | "warning" | "critical";
  code: string;
  message: string;
  step_id: string;
  step_index: number;
}

export interface HistorySnapshot {
  snapshot_id: string;
  ts: string;
  reason: string;
  comment: string;
}

export interface TrashItem {
  id: string;
  deleted_at: string;
  step: Partial<Step>;
  image_original_rel?: string;
  image_trash_rel?: string;
  deleted_permanently?: boolean;
}
