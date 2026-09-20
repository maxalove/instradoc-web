import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Calendar, Camera, CheckCircle2, CheckSquare, Circle, Code,
  Download, EyeOff, FileText, FileType2, Grid3x3, History, Image as ImageIcon, Info, List, Maximize2, Minus, Moon,
  MousePointer, Pencil, Plus, RotateCcw, Save, Scissors, Search, Settings, Share2, ShieldCheck, Sparkles,
  Square, Sun, Trash2, Type, Upload, User, X, type LucideIcon
} from "lucide-react";
import { api } from "./api";
import { Button } from "./components/Controls";
import { hostedStepImageUrl, isHostedBrowserRuntime } from "./hostedApi";
import { makeStepCounter, makeTranslator } from "./i18n";
import type {
  Annotation, AnnotationType, AppSettings, AppStatus, CaptureMode, ExportFormat, HistorySnapshot,
  Note, PreflightIssue, Project, ProjectSummary, Step, TrashItem
} from "./types";

type View = "home" | "editor";
type Modal = "newProject" | "export" | "preflight" | "settings" | "history" | "trash" | null;
type Tool = "select" | AnnotationType;
type Toast = { id: number; type: "success" | "error" | "info"; message: string; persistent?: boolean; actionLabel?: string; actionUrl?: string; actionDownloadName?: string };
type DragMode = "move" | "nw" | "ne" | "sw" | "se" | "arrow-start" | "arrow-end";
type DrawDraft = { stepId: string; startX: number; startY: number; annotation: Annotation } | null;
type PanDrag = { pointerId: number; startClientX: number; startClientY: number; startPan: { x: number; y: number } } | null;
type UndoEntry = { project: Project; selectedStepId: string; selectedAnnotationId: string };
type AnnotationMenu = { annId: string; clientX: number; clientY: number } | null;

const UNDO_LIMIT = 80;
const TITLE_TEXT_LIMIT = 28;
const CONTEXT_COLORS = ["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#a855f7", "#111827", "#ffffff"];
const CONTEXT_WIDTHS = [1, 2, 4, 8, 12];

const tools: Array<{ id: Tool; key: string; icon: LucideIcon }> = [
  { id: "select", key: "select", icon: MousePointer },
  { id: "text", key: "text", icon: Type },
  { id: "freehand", key: "freehand", icon: Pencil },
  { id: "crop", key: "crop", icon: Scissors },
  { id: "rect", key: "rectangle", icon: Square },
  { id: "circle", key: "circle", icon: Circle },
  { id: "arrow", key: "arrow", icon: ArrowRight },
  { id: "highlight", key: "highlight", icon: Sparkles },
  { id: "blur", key: "blur", icon: EyeOff },
  { id: "number", key: "number", icon: CheckCircle2 }
];

export function App() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Partial<AppSettings>>({});
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [selectedStepId, setSelectedStepId] = useState("");
  const [selectedAnnotationId, setSelectedAnnotationId] = useState("");
  const [view, setView] = useState<View>("home");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [stepSearch, setStepSearch] = useState("");
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [preflight, setPreflight] = useState<PreflightIssue[]>([]);
  const [historyItems, setHistoryItems] = useState<HistorySnapshot[]>([]);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [imageMetrics, setImageMetrics] = useState({ width: 1, height: 1 });
  const [drag, setDrag] = useState<{ annId: string; mode: DragMode; startX: number; startY: number; original: Annotation } | null>(null);
  const [drawDraft, setDrawDraft] = useState<DrawDraft>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState<PanDrag>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 900, height: 520 });
  const [inlineTextEdit, setInlineTextEdit] = useState<{ annId: string; value: string; kind: "text" | "number" } | null>(null);
  const [annotationMenu, setAnnotationMenu] = useState<AnnotationMenu>(null);
  const [draggingStepId, setDraggingStepId] = useState("");
  const [newProject, setNewProject] = useState({ name: "", author: "", description: "" });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectArchiveInputRef = useRef<HTMLInputElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragSaveRef = useRef<{ stepId: string; annotations: Annotation[] } | null>(null);
  const interactionUndoRef = useRef<UndoEntry | null>(null);
  const projectRef = useRef<Project | null>(null);
  const writeSeqRef = useRef(0);
  const toastId = useRef(0);
  const toastTimers = useRef(new Map<number, number>());
  const t = useMemo(() => makeTranslator(settings?.language ?? "ru"), [settings?.language]);
  const countSteps = useMemo(() => makeStepCounter(settings?.language ?? "ru"), [settings?.language]);

  const selectedStep = useMemo(
    () => project?.steps.find((s) => s.id === selectedStepId) ?? project?.steps[0] ?? null,
    [project, selectedStepId]
  );
  const selectedAnnotation = useMemo(
    () => selectedStep?.annotations.find((a) => a.id === selectedAnnotationId) ?? null,
    [selectedAnnotationId, selectedStep]
  );
  const filteredProjects = useMemo(() => filterProjects(projects, projectSearch), [projects, projectSearch]);
  const filteredSteps = useMemo(() => filterSteps(project?.steps ?? [], stepSearch), [project, stepSearch]);

  useEffect(() => {
    const theme = settings?.theme_mode === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#eef2f8" : "#060b16");
  }, [settings?.theme_mode]);

  useEffect(() => {
    document.documentElement.lang = settings?.language ?? "ru";
  }, [settings?.language]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    const handleEditorHotkeys = (event: KeyboardEvent) => {
      if ((event.key === "Delete" || event.key === "Backspace") && view === "editor" && !isTypingTarget(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        if (selectedAnnotationId) deleteAnnotation();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "s" || event.code === "KeyS") {
        event.preventDefault();
        event.stopPropagation();
        if (view === "editor") void saveProjectNow();
        return;
      }
      const isUndoKey = key === "z" || event.code === "KeyZ";
      const isRedoKey = key === "y" || event.code === "KeyY" || (isUndoKey && event.shiftKey);
      if (!isUndoKey && !isRedoKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (isUndoKey && !event.shiftKey) {
        void undoProjectChange();
        return;
      }
      void redoProjectChange();
    };
    window.addEventListener("keydown", handleEditorHotkeys, { capture: true });
    return () => window.removeEventListener("keydown", handleEditorHotkeys, { capture: true });
  }, [project, undoStack, redoStack, selectedStepId, selectedAnnotationId, view, selectedStep, selectedAnnotation]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setPanDrag(null);
    setDrawDraft(null);
    setInlineTextEdit(null);
    setAnnotationMenu(null);
  }, [selectedStepId]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize({ width: Math.max(240, rect.width), height: Math.max(240, rect.height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [selectedStepId, view]);

  useEffect(() => {
    setPan((current) => constrainPan(current, zoom));
  }, [stageSize.width, stageSize.height, imageMetrics.width, imageMetrics.height, zoom]);

  // React registers wheel listeners as passive, so preventDefault() from an onWheel
  // prop is ignored and the page scrolls while zooming. Bind it directly instead.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.addEventListener("wheel", handleCanvasWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleCanvasWheel);
  }, [view, selectedStepId, zoom, pan, stageSize, imageMetrics]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTypingTarget(event.target)) return;
      event.preventDefault();
      setSpaceDown(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceDown(false);
    };
    const blur = () => setSpaceDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  useEffect(() => () => toastTimers.current.forEach(window.clearTimeout), []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (!project) return;
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageFiles = items
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item, index) => item.getAsFile() ?? new File([], `clipboard_${index}.png`, { type: item.type }))
        .filter((file) => file.size > 0);
      if (!imageFiles.length) {
        toast(t("pasteNoImage"), "info");
        return;
      }
      event.preventDefault();
      void importFiles(imageFiles);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [project?.id, t]);

  async function bootstrap() {
    await run(async () => {
      const [nextStatus, nextSettings, nextProjects] = await Promise.all([api.status(), api.settings(), api.projects()]);
      setStatus(nextStatus);
      setSettings(nextSettings);
      setSettingsDraft(nextSettings);
      setProjects(nextProjects);
      setNewProject((current) => ({ ...current, author: nextSettings.default_author || "" }));
    }, true);
  }

  async function run(task: () => Promise<void>, persistentError = false) {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error", persistentError);
    } finally {
      setBusy(false);
    }
  }

  function toast(message: string, type: Toast["type"] = "info", persistent = false, action?: { label: string; url: string; downloadName?: string }) {
    const id = ++toastId.current;
    setToasts((current) => [
      ...current.slice(-2),
      { id, type, message, persistent, actionLabel: action?.label, actionUrl: action?.url, actionDownloadName: action?.downloadName }
    ]);
    // Each toast owns its timer, so a newer toast never extends an older one's life.
    if (!persistent) {
      toastTimers.current.set(id, window.setTimeout(() => closeToast(id), type === "error" ? 6500 : 4500));
    }
  }

  function closeToast(id: number) {
    const timer = toastTimers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      toastTimers.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }

  function currentUndoEntry(source = project): UndoEntry | null {
    if (!source) return null;
    return {
      project: cloneProject(source),
      selectedStepId,
      selectedAnnotationId
    };
  }

  function recordUndo(source = project) {
    const entry = currentUndoEntry(source);
    if (!entry) return;
    setUndoStack((current) => [...current, entry].slice(-UNDO_LIMIT));
    setRedoStack([]);
  }

  function setProjectState(nextProject: Project | null) {
    projectRef.current = nextProject;
    setProject(nextProject);
  }

  function nextWriteSeq() {
    writeSeqRef.current += 1;
    return writeSeqRef.current;
  }

  async function resyncCurrentProject() {
    const current = projectRef.current;
    if (!current) return;
    try {
      await api.updateProject(current.id, current);
    } catch {
      // The visible project state is still the source of truth; the next edit will retry persistence.
    }
  }

  async function applyUndoEntry(entry: UndoEntry) {
    const writeSeq = nextWriteSeq();
    setProjectState(entry.project);
    setSelectedStepId(entry.selectedStepId || entry.project.steps[0]?.id || "");
    setSelectedAnnotationId(entry.selectedAnnotationId);
    setDrawDraft(null);
    setDrag(null);
    setPanDrag(null);
    setInlineTextEdit(null);
    setSaveState("saving");
    try {
      const saved = await api.updateProject(entry.project.id, entry.project);
      if (writeSeqRef.current !== writeSeq) return;
      setProjectState({ ...entry.project, modified: saved.modified || entry.project.modified });
      setSaveState("saved");
      setProjects(await api.projects());
    } catch (error) {
      setSaveState("error");
      toast(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function undoProjectChange() {
    if (!project || undoStack.length === 0) return;
    const target = undoStack[undoStack.length - 1];
    const current = currentUndoEntry(project);
    setUndoStack((stack) => stack.slice(0, -1));
    if (current) setRedoStack((stack) => [...stack, current].slice(-UNDO_LIMIT));
    await applyUndoEntry(target);
  }

  async function redoProjectChange() {
    if (!project || redoStack.length === 0) return;
    const target = redoStack[redoStack.length - 1];
    const current = currentUndoEntry(project);
    setRedoStack((stack) => stack.slice(0, -1));
    if (current) setUndoStack((stack) => [...stack, current].slice(-UNDO_LIMIT));
    await applyUndoEntry(target);
  }

  async function createProject() {
    if (!newProject.name.trim()) return toast(t("projectNameRequired"), "error");
    if (newProject.author.length > 16) return toast(t("authorLimit"), "error");
    await run(async () => {
      const created = await api.createProject({
        ...newProject,
        name: limitTitleText(newProject.name),
        description: newProject.description
      });
      setProject(created);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedStepId(created.steps[0]?.id ?? "");
      setProjects(await api.projects());
      setModal(null);
      setNewProject({ name: "", author: settings?.default_author || "", description: "" });
      setView("editor");
      toast(t("projectCreated"), "success");
    });
  }

  async function openProject(projectId: string) {
    await run(async () => {
      const loaded = await api.project(projectId);
      setProject(loaded);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedStepId(loaded.steps[0]?.id ?? "");
      setSelectedAnnotationId("");
      setPreflight([]);
      setView("editor");
    });
  }

  async function saveStep(stepId: string, patch: Partial<Step>, quiet = true, undoEntry: UndoEntry | null = currentUndoEntry()) {
    if (!project) return;
    const normalizedPatch = normalizeStepPatch(patch);
    const writeSeq = nextWriteSeq();
    const previous = project;
    const optimistic = { ...project, steps: project.steps.map((s) => (s.id === stepId ? { ...s, ...normalizedPatch } : s)) };
    if (undoEntry) {
      setUndoStack((current) => [...current, undoEntry].slice(-UNDO_LIMIT));
      setRedoStack([]);
    }
    setProjectState(optimistic);
    setSaveState("saving");
    try {
      const saved = await api.updateStep(project.id, stepId, normalizedPatch);
      if (writeSeqRef.current !== writeSeq) {
        void resyncCurrentProject();
        return;
      }
      setProjectState(saved);
      setSaveState("saved");
      if (!quiet) toast(t("stepSaved"), "success");
    } catch (error) {
      if (writeSeqRef.current !== writeSeq) return;
      setProjectState(previous);
      setSaveState("error");
      toast(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function importFiles(files: FileList | File[], successMessage = t("importDone")) {
    if (!project) return toast(t("openProjectFirst"), "error");
    const selected = Array.from(files);
    if (!selected.length) return;
    await run(async () => {
      recordUndo();
      const payload = await Promise.all(selected.map(async (file) => ({ name: file.name, dataBase64: await fileToBase64(file) })));
      const result = await api.uploadSteps(project.id, payload);
      setProject(result.project);
      setSelectedStepId(result.steps[result.steps.length - 1]?.id ?? result.project.steps[0]?.id ?? "");
      setSelectedAnnotationId("");
      setProjects(await api.projects());
      toast(successMessage, "success");
    });
  }

  async function capture(mode: CaptureMode) {
    if (!project) return toast(t("openProjectFirst"), "error");
    if (status?.runtimeMode !== "desktop" && (mode === "activeWindow" || mode === "fullscreen")) {
      await captureBrowserWindow();
      return;
    }
    if (mode === "region" && status?.runtimeMode !== "desktop") {
      toast(t("regionDesktopOnly"), "info");
      return;
    }
    await run(async () => {
      const result = await api.captureStep(project.id, mode);
      setProject(result.project);
      setSelectedStepId(result.step.id);
      setSelectedAnnotationId("");
      setProjects(await api.projects());
      toast(t("captureDone"), "success");
    });
  }

  async function captureBrowserWindow() {
    if (!project) return toast(t("openProjectFirst"), "error");
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast(t("captureBrowserUnsupported"), "error");
      return;
    }
    setBusy(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas capture is unavailable");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Unable to encode screenshot");
      const file = new File([blob], `screen_${Date.now()}.png`, { type: "image/png" });
      await importFiles([file], t("captureDone"));
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      toast(name === "NotAllowedError" || name === "AbortError" ? t("captureCancelled") : error instanceof Error ? error.message : String(error), name === "NotAllowedError" || name === "AbortError" ? "info" : "error");
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setBusy(false);
    }
  }

  async function runPreflight(open = true) {
    if (!project) return;
    await run(async () => {
      const result = await api.preflight(project.id);
      setPreflight(result.issues);
      if (open) setModal("preflight");
      toast(result.hasCritical ? t("preflightCritical") : t("preflightComplete"), result.hasCritical ? "error" : "success");
    });
  }

  async function exportCurrent(format: ExportFormat) {
    if (!project) return;
    await run(async () => {
      const result = await api.exportProject(project.id, format);
      setModal(null);
      const downloadUrl = api.exportDownloadUrl(project.id, result.path);
      startBrowserDownload(downloadUrl, result.downloadName);
      toast(`${t("exportReady")}: ${result.downloadName || format.toUpperCase()}`, "success", false, { label: t("download"), url: downloadUrl, downloadName: result.downloadName });
      // Exporting can stamp the project (last PDF path); reload it so later saves
      // do not write the pre-export copy back over that stamp.
      setProjectState(await api.project(project.id));
      setProjects(await api.projects());
    });
  }

  async function exportProjectArchive() {
    if (!project) return;
    await run(async () => {
      await api.exportProjectArchive(project);
      toast(t("projectArchiveReady"), "success");
    });
  }

  async function importProjectArchive(file: File) {
    await run(async () => {
      const imported = await api.importProjectArchive(file);
      setProject(imported);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedStepId(imported.steps[0]?.id ?? "");
      setSelectedAnnotationId("");
      setProjects(await api.projects());
      setView("editor");
      toast(t("projectImported"), "success");
    });
  }

  async function saveSettings() {
    if (String(settingsDraft.default_author ?? "").length > 16) {
      toast(t("authorLimit"), "error");
      return;
    }
    await run(async () => {
      const saved = await api.saveSettings(settingsDraft);
      setSettings(saved);
      setSettingsDraft(saved);
      setModal(null);
      toast(t("settingsSaved"), "success");
    });
  }

  // The editor autosaves on every edit; this forces a full flush so "Save" is not a no-op.
  async function saveProjectNow() {
    const current = projectRef.current;
    if (!current) return;
    const writeSeq = nextWriteSeq();
    setSaveState("saving");
    try {
      const saved = await api.updateProject(current.id, current);
      if (writeSeqRef.current !== writeSeq) return;
      setProjectState({ ...current, modified: saved.modified || current.modified });
      setSaveState("saved");
      setProjects(await api.projects());
      toast(t("projectSaved"), "success");
    } catch (error) {
      setSaveState("error");
      toast(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function toggleTheme() {
    const next: AppSettings["theme_mode"] = settings?.theme_mode === "light" ? "dark" : "light";
    setSettings((current) => (current ? { ...current, theme_mode: next } : current));
    setSettingsDraft((current) => ({ ...current, theme_mode: next }));
    try {
      await api.saveSettings({ theme_mode: next });
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function deleteStep() {
    if (!project || !selectedStep || !window.confirm(t("confirmDeleteStep"))) return;
    await run(async () => {
      recordUndo();
      const saved = await api.deleteStep(project.id, selectedStep.id);
      setProject(saved);
      setSelectedStepId(saved.steps[0]?.id ?? "");
      setSelectedAnnotationId("");
      setProjects(await api.projects());
      toast(t("stepDeleted"), "success");
    });
  }

  async function moveStep(direction: -1 | 1) {
    if (!project || !selectedStep) return;
    const index = project.steps.findIndex((step) => step.id === selectedStep.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= project.steps.length) return;
    recordUndo();
    const steps = [...project.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    await run(async () => setProject(await api.reorderSteps(project.id, steps.map((step) => step.id))));
  }

  async function reorderStepTo(stepId: string, targetStepId: string) {
    if (!project || stepId === targetStepId) return;
    const steps = [...project.steps];
    const from = steps.findIndex((step) => step.id === stepId);
    const to = steps.findIndex((step) => step.id === targetStepId);
    if (from < 0 || to < 0) return;
    recordUndo();
    const [moved] = steps.splice(from, 1);
    steps.splice(to, 0, moved);
    const nextIds = steps.map((step) => step.id);
    setProject({ ...project, steps: steps.map((step, index) => ({ ...step, order: index })) });
    await run(async () => {
      const saved = await api.reorderSteps(project.id, nextIds);
      setProject(saved);
      setSelectedStepId(stepId);
    });
  }

  function handleStepKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, stepId: string) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const index = project?.steps.findIndex((step) => step.id === stepId) ?? -1;
    const targetIndex = index + (event.key === "ArrowUp" ? -1 : 1);
    const target = project?.steps[targetIndex];
    if (target) void reorderStepTo(stepId, target.id);
  }

  async function hideRecentProject(projectId: string) {
    await run(async () => {
      setProjects(await api.hideRecentProject(projectId));
      toast(t("projectHidden"), "success");
    });
  }

  async function openHistory() {
    if (!project) return;
    await run(async () => {
      setHistoryItems((await api.listHistory(project.id)).items);
      setModal("history");
    });
  }

  async function createSnapshot() {
    if (!project) return;
    await run(async () => {
      setHistoryItems((await api.createSnapshot(project.id, "manual", "Beta v.2 UI")).items);
      toast(t("snapshotCreated"), "success");
    });
  }

  async function restoreSnapshot(snapshotId: string) {
    if (!project) return;
    await run(async () => {
      recordUndo();
      const result = await api.restoreSnapshot(project.id, snapshotId);
      setProject(result.project);
      setSelectedStepId(result.project.steps[0]?.id ?? "");
      setSelectedAnnotationId("");
      setModal(null);
      toast(t("snapshotRestored"), "success");
    });
  }

  async function openTrash() {
    if (!project) return;
    await run(async () => {
      setTrashItems((await api.listTrash(project.id)).items);
      setModal("trash");
    });
  }

  async function restoreTrash(itemId: string) {
    if (!project) return;
    await run(async () => {
      recordUndo();
      const result = await api.restoreTrashItem(project.id, itemId);
      setProject(result.project);
      setTrashItems(result.items);
      setSelectedStepId(result.step?.id ?? result.project.steps[result.project.steps.length - 1]?.id ?? result.project.steps[0]?.id ?? "");
      toast(t("trashRestored"), "success");
    });
  }

  async function deleteTrash(itemId: string) {
    if (!project || !window.confirm(t("confirmDeleteForever"))) return;
    await run(async () => setTrashItems((await api.deleteTrashItem(project.id, itemId)).items));
  }

  async function clearTrash() {
    if (!project || !window.confirm(t("confirmClearTrash"))) return;
    await run(async () => {
      setTrashItems((await api.clearTrash(project.id)).items);
      toast(t("trashCleared"), "success");
    });
  }

  function beginCanvasPointer(event: React.PointerEvent<SVGSVGElement>) {
    if (!selectedStep) return;
    setAnnotationMenu(null);
    if (activeTool === "select") {
      if (event.button === 0) {
        setSelectedAnnotationId("");
        setInlineTextEdit(null);
      }
      return;
    }
    event.preventDefault();
    interactionUndoRef.current = currentUndoEntry();
    svgRef.current?.setPointerCapture(event.pointerId);
    const p = point(event);
    if (activeTool === "crop") {
      const crop = shapeAnnotation(createAnnotation("crop", p.x, p.y, 1), p.x, p.y, p.x, p.y);
      setDrawDraft({ stepId: selectedStep.id, startX: p.x, startY: p.y, annotation: crop });
      setSelectedAnnotationId("");
      return;
    }
    const annotation = createAnnotation(activeTool, p.x, p.y, nextNumberAnnotationValue(selectedStep));
    const next = shapeAnnotation(annotation, p.x, p.y, p.x, p.y, activeTool === "number" ? "click" : "draft");
    setDrawDraft({ stepId: selectedStep.id, startX: p.x, startY: p.y, annotation: next });
    setSelectedAnnotationId(annotation.id);
    setProject(project ? { ...project, steps: project.steps.map((s) => (s.id === selectedStep.id ? { ...s, annotations: [...s.annotations, next] } : s)) } : project);
    if (activeTool === "number") {
      void saveStep(selectedStep.id, { annotations: [...selectedStep.annotations, next] }, true, interactionUndoRef.current);
      interactionUndoRef.current = null;
      setDrawDraft(null);
    }
  }

  function startDrag(event: React.PointerEvent<SVGElement>, annotation: Annotation, mode: DragMode = "move") {
    if (activeTool !== "select") return;
    event.stopPropagation();
    setAnnotationMenu(null);
    svgRef.current?.setPointerCapture(event.pointerId);
    setSelectedAnnotationId(annotation.id);
    interactionUndoRef.current = currentUndoEntry();
    const p = point(event);
    const original = mode === "move" || annotation.type === "arrow" || annotation.type === "number" ? annotation : normalizeAnnotationBox(annotation);
    setDrag({ annId: annotation.id, mode, startX: p.x, startY: p.y, original });
  }

  function moveCanvasPointer(event: React.PointerEvent<SVGSVGElement>) {
    if (drawDraft && project && selectedStep && selectedStep.id === drawDraft.stepId) {
      const p = point(event);
      const next = drawDraft.annotation.type === "freehand"
        ? appendFreehandPoint(drawDraft.annotation, p.x, p.y)
        : shapeAnnotation(drawDraft.annotation, drawDraft.startX, drawDraft.startY, p.x, p.y);
      setDrawDraft({ ...drawDraft, annotation: next });
      if (drawDraft.annotation.type === "crop") return;
      setProject({
        ...project,
        steps: project.steps.map((s) =>
          s.id === selectedStep.id
            ? { ...s, annotations: s.annotations.map((ann) => (ann.id === next.id ? next : ann)) }
            : s
        )
      });
      return;
    }
    if (!project || !selectedStep || !drag) return;
    const p = point(event);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    const annotations = selectedStep.annotations.map((ann) =>
      ann.id === drag.annId
        ? transformAnnotation(drag.original, drag.mode, dx, dy, p.x, p.y)
        : ann
    );
    dragSaveRef.current = { stepId: selectedStep.id, annotations };
    setProject({ ...project, steps: project.steps.map((s) => (s.id === selectedStep.id ? { ...s, annotations } : s)) });
  }

  function endCanvasPointer() {
    if (drawDraft && selectedStep) {
      const annotation = normalizeDrawnAnnotation(drawDraft.annotation);
      if (annotation.type === "crop") {
        const cropRect = cropRectFromAnnotation(annotation, imageMetrics);
        void saveStep(selectedStep.id, { crop_rect: cropRect }, true, interactionUndoRef.current);
        interactionUndoRef.current = null;
        setDrawDraft(null);
        return;
      }
      const annotations = selectedStep.annotations.map((ann) => (ann.id === annotation.id ? annotation : ann));
      void saveStep(selectedStep.id, { annotations }, true, interactionUndoRef.current);
      interactionUndoRef.current = null;
      setDrawDraft(null);
      if (annotation.type === "text") {
        setInlineTextEdit({ annId: annotation.id, value: annotation.text || t("text"), kind: "text" });
      }
      return;
    }
    if (dragSaveRef.current) {
      const annotations = dragSaveRef.current.annotations.map(normalizeAnnotationBox);
      void saveStep(dragSaveRef.current.stepId, { annotations }, true, interactionUndoRef.current);
    }
    interactionUndoRef.current = null;
    dragSaveRef.current = null;
    setDrag(null);
  }

  function point(event: React.PointerEvent<SVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    const viewRect = selectedStep ? visibleImageRect(selectedStep, imageMetrics) : { x: 0, y: 0, w: imageMetrics.width, h: imageMetrics.height };
    return {
      x: clamp(viewRect.x + ((event.clientX - rect.left) / Math.max(1, rect.width)) * viewRect.w, 0, imageMetrics.width),
      y: clamp(viewRect.y + ((event.clientY - rect.top) / Math.max(1, rect.height)) * viewRect.h, 0, imageMetrics.height)
    };
  }

  function handleCanvasWheel(event: WheelEvent) {
    event.preventDefault();
    if (event.shiftKey) {
      setPan((current) => constrainPan({ ...current, x: current.x - event.deltaY }, zoom));
      return;
    }
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    const next = clamp(Number((zoom + delta).toFixed(2)), 0.25, 4);
    setPan(panForZoomAnchor(event.clientX, event.clientY, next));
    setZoom(next);
  }

  function zoomBy(delta: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const next = clamp(Number((zoom + delta).toFixed(2)), 0.25, 4);
    setPan(panForZoomAnchor(centerX, centerY, next));
    setZoom(next);
  }

  function panForZoomAnchor(clientX: number, clientY: number, nextZoom: number) {
    const stageRect = stageRef.current?.getBoundingClientRect();
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!stageRect || !svgRect) return pan;
    const fitScale = canvasFitScale();
    const rect = selectedStep ? visibleImageRect(selectedStep, imageMetrics) : { w: imageMetrics.width, h: imageMetrics.height };
    const currentWidth = rect.w * fitScale * zoom;
    const currentHeight = rect.h * fitScale * zoom;
    const nextWidth = rect.w * fitScale * nextZoom;
    const nextHeight = rect.h * fitScale * nextZoom;
    const stageCenterX = stageRect.left + stageRect.width / 2;
    const stageCenterY = stageRect.top + stageRect.height / 2;
    const currentLeft = stageCenterX + pan.x - currentWidth / 2;
    const currentTop = stageCenterY + pan.y - currentHeight / 2;
    const anchorRatioX = clamp((clientX - currentLeft) / Math.max(1, currentWidth), 0, 1);
    const anchorRatioY = clamp((clientY - currentTop) / Math.max(1, currentHeight), 0, 1);
    return constrainPan({
      x: clientX - stageCenterX + nextWidth / 2 - anchorRatioX * nextWidth,
      y: clientY - stageCenterY + nextHeight / 2 - anchorRatioY * nextHeight
    }, nextZoom);
  }

  function canvasFitScale() {
    const rect = selectedStep ? visibleImageRect(selectedStep, imageMetrics) : { w: imageMetrics.width, h: imageMetrics.height };
    return clamp(
      Math.min((stageSize.width - 24) / rect.w, (stageSize.height - 24) / rect.h),
      0.05,
      3.5
    );
  }

  function constrainPan(nextPan: { x: number; y: number }, nextZoom: number) {
    const rect = selectedStep ? visibleImageRect(selectedStep, imageMetrics) : { w: imageMetrics.width, h: imageMetrics.height };
    const displayWidth = rect.w * canvasFitScale() * nextZoom;
    const displayHeight = rect.h * canvasFitScale() * nextZoom;
    const limitX = Math.max(0, (displayWidth - stageSize.width) / 2 + Math.min(180, stageSize.width * 0.18));
    const limitY = Math.max(0, (displayHeight - stageSize.height) / 2 + Math.min(180, stageSize.height * 0.18));
    return {
      x: clamp(nextPan.x, -limitX, limitX),
      y: clamp(nextPan.y, -limitY, limitY)
    };
  }

  // zoom === 1 means "fit the stage"; the displayed percentage is the real scale
  // against the source pixels, so these two controls do different things.
  function fitCanvas() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function zoomToActualSize() {
    setZoom(clamp(Number((1 / canvasFitScale()).toFixed(2)), 0.25, 4));
    setPan({ x: 0, y: 0 });
  }

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as Element | null;
    const isCanvasPan =
      event.button === 0 &&
      activeTool === "select" &&
      zoom > 1 &&
      !target?.closest(".figma-ann, .figma-resize-handles, .figma-ann-arrow-head, .figma-inline-text-editor");
    if (!(spaceDown || event.button === 1 || event.button === 2 || isCanvasPan)) return;
    if (isCanvasPan) {
      setSelectedAnnotationId("");
      setInlineTextEdit(null);
    }
    event.preventDefault();
    event.stopPropagation();
    stageRef.current?.setPointerCapture(event.pointerId);
    setPanDrag({ pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, startPan: pan });
  }

  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    if (!panDrag) return;
    event.preventDefault();
    setPan({
      ...constrainPan({
        x: panDrag.startPan.x + event.clientX - panDrag.startClientX,
        y: panDrag.startPan.y + event.clientY - panDrag.startClientY
      }, zoom)
    });
  }

  function endPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!panDrag) return;
    stageRef.current?.releasePointerCapture(event.pointerId);
    setPanDrag(null);
  }

  function updateAnnotation(patch: Partial<Annotation>) {
    if (!selectedStep || !selectedAnnotation) return;
    setAnnotationMenu(null);
    const annotations = selectedStep.annotations.map((ann) => (ann.id === selectedAnnotation.id ? { ...ann, ...patch } : ann));
    void saveStep(selectedStep.id, { annotations });
  }

  function deleteAnnotation() {
    if (!selectedStep || !selectedAnnotation) return;
    setAnnotationMenu(null);
    setSelectedAnnotationId("");
    void saveStep(selectedStep.id, { annotations: selectedStep.annotations.filter((ann) => ann.id !== selectedAnnotation.id) });
  }

  function openAnnotationMenu(event: React.MouseEvent<SVGElement>, annotation: Annotation) {
    if (activeTool !== "select") return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedAnnotationId(annotation.id);
    setInlineTextEdit(null);
    setAnnotationMenu({ annId: annotation.id, clientX: event.clientX, clientY: event.clientY });
  }

  function updateCropRect(nextCropRect: Step["crop_rect"]) {
    if (!selectedStep) return;
    setAnnotationMenu(null);
    void saveStep(selectedStep.id, { crop_rect: nextCropRect });
  }

  function commitInlineEdit() {
    if (!inlineTextEdit || !selectedAnnotation) return;
    if (inlineTextEdit.kind === "number") {
      updateAnnotation({ number: Math.max(1, Math.round(Number(inlineTextEdit.value) || 1)) });
      return;
    }
    updateAnnotation({ text: inlineTextEdit.value });
  }

  function updateNoteText(text: string) {
    if (!selectedStep) return;
    const notes: Note[] = selectedStep.notes.length
      ? selectedStep.notes.map((note, index) => (index === 0 ? { ...note, text } : note))
      : [{ id: makeId(), type: "info", text }];
    void saveStep(selectedStep.id, { notes });
  }

  function stepImageUrl(step: Step, cacheKey = project?.modified ?? "") {
    return isHostedBrowserRuntime ? hostedStepImageUrl(step) : api.stepImageUrl(project?.id ?? "", step.id, cacheKey);
  }

  // Preflight codes are localized here; the raw backend message is the fallback.
  function issueMessage(issue: PreflightIssue) {
    const key = `preflight_${issue.code}`;
    const translated = t(key);
    return translated === key ? issue.message : translated;
  }

  // Position within the whole project, so numbering stays stable while the list is filtered.
  function stepNumber(stepId: string) {
    return (project?.steps.findIndex((step) => step.id === stepId) ?? -1) + 1;
  }

  function themeToggle() {
    const light = settings?.theme_mode === "light";
    return (
      <Button
        variant="tertiary"
        className="btn-icon"
        onClick={toggleTheme}
        title={light ? t("switchToDark") : t("switchToLight")}
        aria-label={light ? t("switchToDark") : t("switchToLight")}
      >
        {light ? <Moon size={17} /> : <Sun size={17} />}
      </Button>
    );
  }

  return (
    <div className="figma-app" onMouseDown={(event) => { if (!(event.target as Element | null)?.closest(".figma-annotation-menu")) setAnnotationMenu(null); }} onContextMenu={(event) => event.preventDefault()}>
      <div className="figma-bg-grid" aria-hidden="true" />
      <div className="figma-glow figma-glow-blue" aria-hidden="true" />
      <div className="figma-glow figma-glow-purple" aria-hidden="true" />
      <input
        ref={fileInputRef}
        className="figma-hidden-input"
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.bmp"
        multiple
        onChange={(event) => {
          if (event.currentTarget.files) void importFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={projectArchiveInputRef}
        className="figma-hidden-input"
        type="file"
        accept=".idoc.zip,.zip"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importProjectArchive(file);
          event.currentTarget.value = "";
        }}
      />
      {busy && <div className="figma-busy-bar" role="progressbar" aria-label={t("working")} />}
      <div className="figma-toast-stack">
        {toasts.map((item) => (
          <div className={`figma-toast figma-toast-${item.type}`} role={item.type === "error" ? "alert" : "status"} key={item.id}>
            {item.type === "error" ? <AlertTriangle size={17} /> : item.type === "info" ? <Info size={17} /> : <CheckCircle2 size={17} />}
            <span>{item.message}</span>
            {item.actionUrl && (
              <a className="figma-toast-action" href={item.actionUrl} download={item.actionDownloadName}>
                {item.actionLabel}
              </a>
            )}
            <button onClick={() => closeToast(item.id)} aria-label={t("dismiss")}>
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
      {view === "home" ? home() : editor()}
      {annotationContextMenu()}
      {modalView()}
    </div>
  );

  function home() {
    return (
      <main className="figma-page">
        <header className="figma-home-header">
          <div className="figma-shell">
            <div className="figma-header-row">
              <div className="figma-brand-block">
                <div className="figma-brand-mark">ID</div>
                <div>
                  <h1>InstraDoc</h1>
                  <p>{t("brandSubtitle")}</p>
                </div>
              </div>
              <div className="figma-inline-actions">
                {themeToggle()}
                <Button variant="tertiary" className="btn-icon" onClick={() => setModal("settings")} title={t("settings")} aria-label={t("settings")}>
                  <Settings size={18} />
                </Button>
                {isHostedBrowserRuntime && (
                  <Button variant="tertiary" onClick={() => projectArchiveInputRef.current?.click()} disabled={busy}>
                    <Upload size={18} />
                    {t("importProjectArchive")}
                  </Button>
                )}
                <Button variant="primary" onClick={() => setModal("newProject")} disabled={busy}>
                  <Plus size={18} />
                  {t("newProject")}
                </Button>
              </div>
            </div>
          </div>
        </header>
        <section className="figma-shell figma-home-content">
          <div className="figma-hero-copy">
            <span className="figma-kicker">
              <Sparkles size={15} />
              {status?.versionLabel ?? "Beta v.2"} · {t("betaConcept")}
            </span>
            <h2>{t("heroTitle")}</h2>
            <p>{t("heroBody")}</p>
            {isHostedBrowserRuntime && (
              <p className="figma-muted-copy">
                <ShieldCheck size={16} />
                <span>{t("hostedPrivacy")}</span>
              </p>
            )}
          </div>
          <div className="figma-search-row">
            <label className="figma-search">
              <Search size={18} />
              <input value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} placeholder={t("searchProjects")} />
            </label>
            <div className="figma-segmented" role="group" aria-label={t("viewMode")}>
              <button className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")} title={t("viewGrid")} aria-label={t("viewGrid")} aria-pressed={viewMode === "grid"}><Grid3x3 size={17} /></button>
              <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} title={t("viewList")} aria-label={t("viewList")} aria-pressed={viewMode === "list"}><List size={17} /></button>
            </div>
          </div>
          <section>
            <div className="figma-section-title">
              <h3>{t("recentProjects")}</h3>
              <span>{t("visible")}: {filteredProjects.length}</span>
            </div>
            {filteredProjects.length === 0 ? (
              <div className="figma-empty"><FileText size={44} /><strong>{t("noProjects")}</strong><span>{t("noProjectsBody")}</span></div>
            ) : (
              <div className={viewMode === "grid" ? "figma-project-grid" : "figma-project-list"}>
                {filteredProjects.map((item) => (
                  <article className="figma-project-card" key={item.id}>
                    <button className="figma-project-open" onClick={() => openProject(item.id)}>
                      <div className="figma-project-icon"><FileText size={22} /></div>
                      <div className="figma-project-main">
                        <h4 title={item.name}>{item.name}</h4>
                        <p>{item.description || t("noDescription")}</p>
                        <div className="figma-project-meta">
                          <span className={`figma-status ${item.status}`}>{item.status === "exported" ? t("pdfReady") : t("draft")}</span>
                          <span><FileText size={13} />{countSteps(item.stepCount)}</span>
                          <span><User size={13} />{item.author || t("unknownAuthor")}</span>
                          <span><Calendar size={13} />{item.modified}</span>
                        </div>
                      </div>
                    </button>
                    <button className="figma-project-hide" onClick={() => hideRecentProject(item.id)} title={t("hideProject")} aria-label={t("hideProject")}><X size={15} /></button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
    );
  }

  function editor() {
    if (!project) {
      return (
        <main className="figma-page figma-editor-empty">
          <div className="figma-empty">
            <FileText size={44} />
            <strong>{t("noProjectSelected")}</strong>
            <span>{t("returnHome")}</span>
            <Button onClick={() => setView("home")}><ArrowLeft size={16} />{t("backHome")}</Button>
          </div>
        </main>
      );
    }
    return (
      <main className="figma-editor">
        <header className="figma-editor-header">
          <div className="figma-editor-title">
            <Button variant="tertiary" onClick={() => setView("home")}><ArrowLeft size={16} />{t("back")}</Button>
            <div className="figma-divider" />
            <div className="figma-editor-title-text">
              <h1 title={project.name}>{project.name}</h1>
              <p className="figma-editor-meta">
                <span>{t("lastSaved")}: {project.modified}</span>
                <span className={`figma-save-state ${saveState}`}>
                  {saveState === "saving" ? t("saving") : saveState === "error" ? t("saveError") : t("saved")}
                </span>
              </p>
            </div>
          </div>
          <div className="figma-editor-actions">
            <Button variant="tertiary" className="btn-icon" onClick={openHistory} title={t("history")} aria-label={t("history")}><History size={17} /></Button>
            <Button variant="tertiary" className="btn-icon" onClick={openTrash} title={t("trash")} aria-label={t("trash")}><Trash2 size={17} /></Button>
            <Button variant="tertiary" className="btn-icon" onClick={() => runPreflight(true)} title={t("preflight")} aria-label={t("preflight")}><CheckSquare size={17} /></Button>
            {themeToggle()}
            <Button variant="tertiary" className="btn-icon" onClick={() => setModal("settings")} title={t("settings")} aria-label={t("settings")}><Settings size={17} /></Button>
            <div className="figma-divider" />
            <Button onClick={saveProjectNow} disabled={busy} title={`${t("save")} (Ctrl+S)`}><Save size={16} />{t("save")}</Button>
            {isHostedBrowserRuntime && (
              <Button variant="tertiary" onClick={exportProjectArchive} disabled={busy} title={t("downloadProjectArchiveHint")}>
                <Download size={16} />{t("downloadProjectArchive")}
              </Button>
            )}
            <Button variant="primary" onClick={() => setModal("export")} disabled={busy}><Share2 size={16} />{t("export")}</Button>
          </div>
        </header>
        <div className="figma-toolbar">
          <div className="figma-tool-group" role="group" aria-label={t("tools")}>
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  className={activeTool === tool.id ? "active" : ""}
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id)}
                  aria-pressed={activeTool === tool.id}
                  title={t(tool.key)}
                >
                  <Icon size={16} />{t(tool.key)}
                </button>
              );
            })}
          </div>
          <div className="figma-toolbar-spacer" />
          <Button onClick={() => capture("activeWindow")} disabled={busy} title={t("captureActiveHint")}><Camera size={16} />{t("captureActive")}</Button>
          {status?.runtimeMode === "desktop" && (
            <Button onClick={() => capture("region")} disabled={busy}><Scissors size={16} />{t("captureRegion")}</Button>
          )}
          <Button variant="primary" onClick={() => fileInputRef.current?.click()} disabled={busy}><Plus size={16} />{t("importImage")}</Button>
        </div>
        <section className="figma-editor-layout">
          <aside className="figma-side-panel">
            <div className="figma-panel-head">
              <h2>{t("stepsTitle")}</h2>
              <div className="figma-inline-actions">
                <span className="figma-panel-count">{project.steps.length}</span>
                <Button variant="tertiary" className="btn-sm btn-icon" onClick={() => fileInputRef.current?.click()} title={t("importImage")} aria-label={t("importImage")}><Plus size={16} /></Button>
              </div>
            </div>
            <label className="figma-mini-search"><Search size={15} /><input value={stepSearch} onChange={(e) => setStepSearch(e.target.value)} placeholder={t("searchSteps")} /></label>
            <div className="figma-step-list">
              {filteredSteps.length === 0 ? <div className="figma-mini-empty">{stepSearch ? t("noStepMatches") : t("emptySteps")}</div> : filteredSteps.map((step) => (
                <button
                  className={`figma-step-thumb ${selectedStep?.id === step.id ? "active" : ""} ${draggingStepId === step.id ? "dragging" : ""}`}
                  key={step.id}
                  draggable
                  onClick={() => { setSelectedStepId(step.id); setSelectedAnnotationId(""); }}
                  onDragStart={(e) => { setDraggingStepId(step.id); e.dataTransfer.setData("text/plain", step.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                  onDrop={(e) => { e.preventDefault(); const sourceId = e.dataTransfer.getData("text/plain") || draggingStepId; setDraggingStepId(""); void reorderStepTo(sourceId, step.id); }}
                  onDragEnd={() => setDraggingStepId("")}
                  onKeyDown={(e) => handleStepKeyDown(e, step.id)}
                >
                  <div className="figma-step-preview">
                    {step.image_path ? <img src={stepImageUrl(step, project.modified)} alt="" /> : <ImageIcon size={20} />}
                    <span className="figma-step-index">{stepNumber(step.id)}</span>
                  </div>
                  <div className="figma-step-body">
                    <strong>{step.title || `${t("step")} ${stepNumber(step.id)}`}</strong>
                    <span>{step.description || t("noDescription")}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>
          <section className="figma-canvas-zone">
            <div className="figma-canvas-card">
              <div className="figma-canvas">{selectedStep?.image_path ? imageCanvas(selectedStep) : emptyCanvas()}</div>
              <p className="figma-canvas-hint">{t("selectedToolHint")}</p>
            </div>
          </section>
          <aside className="figma-side-panel">
            <div className="figma-panel-head">
              <h2>{t("properties")}</h2>
              {selectedStep && <span className="figma-panel-count">{t("step")} {stepNumber(selectedStep.id)}</span>}
            </div>
            {selectedStep ? properties(selectedStep) : <div className="figma-mini-empty">{t("emptySteps")}</div>}
          </aside>
        </section>
      </main>
    );
  }

  function emptyCanvas() {
    return (
      <div className="figma-canvas-placeholder">
        <ImageIcon size={64} />
        <strong>{t("noScreenshot")}</strong>
        <span>{t("noScreenshotBody")}</span>
        <Button variant="primary" onClick={() => fileInputRef.current?.click()}><Plus size={16} />{t("importImage")}</Button>
      </div>
    );
  }

  function imageCanvas(step: Step) {
    const textEdit = inlineTextEdit;
    const editingAnnotation = textEdit ? step.annotations.find((ann) => ann.id === textEdit.annId && (ann.type === "text" || ann.type === "number")) : null;
    const fitScale = canvasFitScale();
    const displayScale = fitScale * zoom;
    const visibleRect = visibleImageRect(step, imageMetrics);
    const displayWidth = Math.max(1, Math.round(visibleRect.w * displayScale));
    const displayHeight = Math.max(1, Math.round(visibleRect.h * displayScale));
    const fullImageWidth = Math.max(1, Math.round(imageMetrics.width * displayScale));
    const fullImageHeight = Math.max(1, Math.round(imageMetrics.height * displayScale));
    const imageUrl = stepImageUrl(step, `${project?.modified}-${step.annotations.length}`);
    const stageClass = [
      "figma-image-stage",
      activeTool !== "select" ? "draw-mode" : "",
      spaceDown ? "pan-ready" : "",
      panDrag ? "panning" : ""
    ].filter(Boolean).join(" ");
    return (
      <div className="figma-stage-shell">
        <div className="figma-stage-actions" role="group" aria-label={t("zoom")}>
          <Button variant="tertiary" className="btn-sm btn-icon" onClick={() => zoomBy(-0.15)} disabled={zoom <= 0.25} title={t("zoomOut")} aria-label={t("zoomOut")}><Minus size={15} /></Button>
          <Button variant="tertiary" className="btn-sm figma-zoom-value" onClick={zoomToActualSize} title={t("zoomActual")}>{Math.round(displayScale * 100)}%</Button>
          <Button variant="tertiary" className="btn-sm btn-icon" onClick={() => zoomBy(0.15)} disabled={zoom >= 4} title={t("zoomIn")} aria-label={t("zoomIn")}><Plus size={15} /></Button>
          <div className="figma-divider" />
          <Button variant="tertiary" className="btn-sm" onClick={fitCanvas} title={t("fitHint")}><Maximize2 size={14} />{t("fit")}</Button>
        </div>
        <div
          ref={stageRef}
          className={stageClass}
          onPointerDownCapture={startPan}
          onPointerMoveCapture={movePan}
          onPointerUpCapture={endPan}
          onPointerCancelCapture={endPan}
          onContextMenu={(event) => { if (panDrag || spaceDown) event.preventDefault(); }}
        >
          <div
            className="figma-image-transform"
            style={{
              left: `calc(50% + ${pan.x}px)`,
              top: `calc(50% + ${pan.y}px)`,
              width: `${displayWidth}px`,
              height: `${displayHeight}px`,
              transform: "translate(-50%, -50%)"
            }}
          >
            <div className="figma-crop-viewport" style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}>
              <img
                src={imageUrl}
                alt={step.title || t("stepTitle")}
                draggable={false}
                width={fullImageWidth}
                height={fullImageHeight}
                style={{
                  width: `${fullImageWidth}px`,
                  height: `${fullImageHeight}px`,
                  transform: `translate(${-visibleRect.x * displayScale}px, ${-visibleRect.y * displayScale}px)`
                }}
                onLoad={(e) => setImageMetrics({ width: e.currentTarget.naturalWidth || 1, height: e.currentTarget.naturalHeight || 1 })}
              />
            </div>
            <svg
              ref={svgRef}
              className="figma-annotation-layer"
              width={displayWidth}
              height={displayHeight}
              viewBox={`${visibleRect.x} ${visibleRect.y} ${visibleRect.w} ${visibleRect.h}`}
              onPointerDown={beginCanvasPointer}
              onPointerMove={moveCanvasPointer}
              onPointerUp={endCanvasPointer}
              onPointerLeave={endCanvasPointer}
            >
              {step.annotations.map((annotation) => annotationNode(annotation, imageUrl))}
              {cropOverlay(step)}
            </svg>
            {editingAnnotation && (
              <input
                className="figma-inline-text-editor"
                autoFocus
                value={textEdit?.value ?? ""}
                type={textEdit?.kind === "number" ? "number" : "text"}
                style={{
                  left: `${((Math.min(editingAnnotation.x, editingAnnotation.x2) - visibleRect.x) / visibleRect.w) * 100}%`,
                  top: `${((Math.min(editingAnnotation.y, editingAnnotation.y2) - visibleRect.y) / visibleRect.h) * 100}%`,
                  width: `${Math.max(textEdit?.kind === "number" ? 70 : 120, Math.abs(editingAnnotation.x2 - editingAnnotation.x) * displayScale)}px`,
                  fontSize: `${editingAnnotation.font_size * displayScale}px`,
                  color: editingAnnotation.color
                }}
                onChange={(e) => setInlineTextEdit({ annId: editingAnnotation.id, value: e.target.value, kind: textEdit?.kind ?? "text" })}
                onBlur={() => {
                  commitInlineEdit();
                  setInlineTextEdit(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitInlineEdit();
                    setInlineTextEdit(null);
                  }
                  if (e.key === "Escape") setInlineTextEdit(null);
                }}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  function annotationNode(annotation: Annotation, imageUrl: string) {
    const selected = annotation.id === selectedAnnotationId;
    if (annotation.type === "crop") return null;
    const common = {
      className: `figma-ann ${selected ? "selected" : ""}`,
      onPointerDown: activeTool === "select" ? (e: React.PointerEvent<SVGElement>) => startDrag(e, annotation) : undefined,
      onContextMenu: (e: React.MouseEvent<SVGElement>) => openAnnotationMenu(e, annotation)
    };
    const x = Math.min(annotation.x, annotation.x2);
    const y = Math.min(annotation.y, annotation.y2);
    const w = Math.max(2, Math.abs(annotation.x2 - annotation.x));
    const h = Math.max(2, Math.abs(annotation.y2 - annotation.y));
    const showHandles = selected && activeTool === "select";
    if (annotation.type === "circle") {
      return <g key={annotation.id}>{<ellipse {...common} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="none" stroke={annotation.color} strokeWidth={annotation.line_width} />}{showHandles && resizeHandles(annotation)}</g>;
    }
    if (annotation.type === "arrow") {
      const geometry = arrowGeometry(annotation.x, annotation.y, annotation.x2, annotation.y2, annotation.line_width);
      return (
        <g key={annotation.id}>
          <line {...common} x1={annotation.x} y1={annotation.y} x2={geometry.lineEnd.x} y2={geometry.lineEnd.y} stroke={annotation.color} strokeWidth={annotation.line_width} strokeLinecap="round" />
          <polygon className="figma-ann-arrow-head" points={geometry.points} fill={annotation.color} onContextMenu={(e) => openAnnotationMenu(e, annotation)} onPointerDown={activeTool === "select" ? (e) => startDrag(e, annotation, "arrow-end") : undefined} />
          {showHandles && arrowHandles(annotation)}
        </g>
      );
    }
    if (annotation.type === "freehand") {
      const points = freehandPoints(annotation);
      const d = points.length > 1 ? points.map((p, index) => `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") : "";
      return (
        <g key={annotation.id}>
          <path
            className={`figma-ann figma-ann-hit ${selected ? "selected" : ""}`}
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(18, annotation.line_width + 12)}
            strokeLinecap="round"
            strokeLinejoin="round"
            onPointerDown={activeTool === "select" ? (e) => startDrag(e, annotation) : undefined}
            onContextMenu={(e) => openAnnotationMenu(e, annotation)}
          />
          <path {...common} d={d} fill="none" stroke={annotation.color} strokeWidth={annotation.line_width} strokeLinecap="round" strokeLinejoin="round" />
          {showHandles && resizeHandles(annotation)}
        </g>
      );
    }
    if (annotation.type === "text") {
      return <g key={annotation.id}><text {...common} onDoubleClick={(e) => { e.stopPropagation(); setSelectedAnnotationId(annotation.id); setInlineTextEdit({ annId: annotation.id, value: annotation.text || t("text"), kind: "text" }); }} x={annotation.x} y={annotation.y} fill={annotation.color} fontSize={annotation.font_size} fontWeight={700}>{annotation.text || t("text")}</text>{showHandles && resizeHandles(annotation)}</g>;
    }
    if (annotation.type === "number") {
      return <g key={annotation.id}><circle {...common} onDoubleClick={(e) => { e.stopPropagation(); setSelectedAnnotationId(annotation.id); setInlineTextEdit({ annId: annotation.id, value: String(annotation.number || 1), kind: "number" }); }} cx={annotation.x} cy={annotation.y} r={Math.max(18, annotation.font_size)} fill={annotation.color} /><text x={annotation.x} y={annotation.y + annotation.font_size * 0.34} textAnchor="middle" fill="#fff" fontSize={annotation.font_size} fontWeight={800} pointerEvents="none">{annotation.number}</text></g>;
    }
    if (annotation.type === "blur") {
      const clipId = `blur-clip-${annotation.id}`;
      const filterId = `blur-filter-${annotation.id}`;
      return (
        <g key={annotation.id}>
          <defs>
            <clipPath id={clipId}><rect x={x} y={y} width={w} height={h} rx={8} /></clipPath>
            <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>
          <image href={imageUrl} x={0} y={0} width={imageMetrics.width} height={imageMetrics.height} preserveAspectRatio="none" clipPath={`url(#${clipId})`} filter={`url(#${filterId})`} pointerEvents="none" />
          <rect {...common} x={x} y={y} width={w} height={h} rx={8} fill="rgba(255,255,255,0.08)" stroke={annotation.color} strokeWidth={annotation.line_width} strokeDasharray="10 8" />
          {showHandles && resizeHandles(annotation)}
        </g>
      );
    }
    return <g key={annotation.id}><rect {...common} x={x} y={y} width={w} height={h} rx={annotation.type === "highlight" ? 0 : 8} fill={annotation.type === "highlight" ? withAlpha(annotation.color, 0.26) : "none"} stroke={annotation.color} strokeWidth={annotation.type === "highlight" ? 1 : annotation.line_width} />{showHandles && resizeHandles(annotation)}</g>;
  }

  function cropOverlay(step: Step) {
    const draft = drawDraft?.annotation.type === "crop" ? drawDraft.annotation : null;
    const rect = draft ? cropRectFromAnnotation(draft, imageMetrics) : null;
    if (!rect) return null;
    const view = visibleImageRect(step, imageMetrics, false);
    return (
      <g className="figma-crop-overlay" pointerEvents="none">
        <path
          d={`M ${view.x} ${view.y} H ${view.x + view.w} V ${view.y + view.h} H ${view.x} Z M ${rect.x} ${rect.y} H ${rect.x + rect.w} V ${rect.y + rect.h} H ${rect.x} Z`}
          fill="rgba(2,6,23,0.46)"
          fillRule="evenodd"
        />
        <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="none" stroke="#60a5fa" strokeWidth={2} strokeDasharray="10 6" />
      </g>
    );
  }

  function resizeHandles(annotation: Annotation) {
    const x = Math.min(annotation.x, annotation.x2);
    const y = Math.min(annotation.y, annotation.y2);
    const w = Math.max(2, Math.abs(annotation.x2 - annotation.x));
    const h = Math.max(2, Math.abs(annotation.y2 - annotation.y));
    return (
      <g className="figma-resize-handles">
        <rect x={x - 6} y={y - 6} width={12} height={12} onPointerDown={(e) => startDrag(e, annotation, "nw")} />
        <rect x={x + w - 6} y={y - 6} width={12} height={12} onPointerDown={(e) => startDrag(e, annotation, "ne")} />
        <rect x={x - 6} y={y + h - 6} width={12} height={12} onPointerDown={(e) => startDrag(e, annotation, "sw")} />
        <rect x={x + w - 6} y={y + h - 6} width={12} height={12} onPointerDown={(e) => startDrag(e, annotation, "se")} />
      </g>
    );
  }

  function arrowHandles(annotation: Annotation) {
    return (
      <g className="figma-resize-handles">
        <circle cx={annotation.x} cy={annotation.y} r={8} onPointerDown={(e) => startDrag(e, annotation, "arrow-start")} />
        <circle cx={annotation.x2} cy={annotation.y2} r={8} onPointerDown={(e) => startDrag(e, annotation, "arrow-end")} />
      </g>
    );
  }

  function properties(step: Step) {
    return (
      <form className="figma-properties" onSubmit={(e) => e.preventDefault()}>
        <label>{t("stepTitle")}<input value={step.title} maxLength={TITLE_TEXT_LIMIT} placeholder={`${t("step")} ${stepNumber(step.id)}`} onChange={(e) => saveStep(step.id, { title: e.target.value })} /><small>{step.title.length}/{TITLE_TEXT_LIMIT}</small></label>
        <label>{t("description")}<textarea value={step.description} placeholder={t("descriptionPlaceholder")} onChange={(e) => saveStep(step.id, { description: e.target.value })} /></label>
        <label>{t("notes")}<textarea value={step.notes[0]?.text ?? ""} placeholder={t("notesPlaceholder")} onChange={(e) => updateNoteText(e.target.value)} /></label>
        <label>{t("tags")}<input value={step.tags.join(", ")} placeholder={t("tagsPlaceholder")} onChange={(e) => saveStep(step.id, { tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></label>
        <div className="figma-properties-section">
          <h3>{t("crop")}<span className="figma-panel-note">{step.crop_rect ? `${Math.round(step.crop_rect.w)} × ${Math.round(step.crop_rect.h)}` : t("cropNotSet")}</span></h3>
          <div className="figma-inline-actions">
            <Button variant="tertiary" className="btn-sm" onClick={() => setActiveTool("crop")}><Scissors size={15} />{t("cropSelect")}</Button>
            <Button variant="tertiary" className="btn-sm" onClick={() => updateCropRect(null)} disabled={!step.crop_rect}><RotateCcw size={15} />{t("cropReset")}</Button>
          </div>
        </div>
        <div className="figma-properties-section">
          <h3>{t("stepActions")}</h3>
          <div className="figma-inline-actions">
            <Button variant="tertiary" className="btn-sm btn-icon" onClick={() => moveStep(-1)} disabled={stepNumber(step.id) <= 1} title={t("moveUp")} aria-label={t("moveUp")}><ArrowLeft size={15} /></Button>
            <Button variant="tertiary" className="btn-sm btn-icon" onClick={() => moveStep(1)} disabled={stepNumber(step.id) >= project!.steps.length} title={t("moveDown")} aria-label={t("moveDown")}><ArrowRight size={15} /></Button>
            <Button variant="danger" className="btn-sm" onClick={deleteStep}><Trash2 size={15} />{t("deleteStep")}</Button>
          </div>
        </div>
        {selectedAnnotation && (
          <div className="figma-annotation-editor">
            <h3><Pencil size={13} />{t("annotation")}</h3>
            {selectedAnnotation.type === "text" && <label>{t("text")}<input value={selectedAnnotation.text} onChange={(e) => updateAnnotation({ text: e.target.value })} /></label>}
            {selectedAnnotation.type === "number" && <label>{t("number")}<input type="number" min={1} value={selectedAnnotation.number} onChange={(e) => updateAnnotation({ number: Number(e.target.value) || 1 })} /></label>}
            <label>{t("color")}<input type="color" value={selectedAnnotation.color} onChange={(e) => updateAnnotation({ color: e.target.value })} /></label>
            <div className="figma-field-row">
              <label>{t("lineWidth")}<input type="number" min={1} max={18} value={selectedAnnotation.line_width} onChange={(e) => updateAnnotation({ line_width: clamp(Number(e.target.value) || 1, 1, 18) })} /></label>
              <label>{t("fontSize")}<input type="number" min={8} max={96} value={selectedAnnotation.font_size} onChange={(e) => updateAnnotation({ font_size: clamp(Number(e.target.value) || 14, 8, 96) })} /></label>
            </div>
            <Button variant="danger" className="btn-sm" onClick={deleteAnnotation}><Trash2 size={15} />{t("deleteAnnotation")}</Button>
          </div>
        )}
      </form>
    );
  }

  function annotationContextMenu() {
    if (!annotationMenu || !selectedAnnotation) return null;
    return (
      <div
        className="figma-annotation-menu"
        style={{ left: annotationMenu.clientX, top: annotationMenu.clientY }}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <strong>{t("annotation")}</strong>
        <div className="figma-menu-colors">
          {CONTEXT_COLORS.map((color) => (
            <button
              key={color}
              className={selectedAnnotation.color.toLowerCase() === color.toLowerCase() ? "active" : ""}
              style={{ background: color }}
              onClick={() => updateAnnotation({ color })}
              aria-label={`${t("color")} ${color}`}
            />
          ))}
        </div>
        <div className="figma-menu-widths">
          {CONTEXT_WIDTHS.map((lineWidth) => (
            <button key={lineWidth} className={selectedAnnotation.line_width === lineWidth ? "active" : ""} onClick={() => updateAnnotation({ line_width: lineWidth })}>
              {lineWidth}px
            </button>
          ))}
        </div>
        {(selectedAnnotation.type === "text" || selectedAnnotation.type === "number") && (
          <div className="figma-menu-widths">
            {[14, 18, 24, 32, 44].map((fontSize) => (
              <button key={fontSize} className={selectedAnnotation.font_size === fontSize ? "active" : ""} onClick={() => updateAnnotation({ font_size: fontSize })}>
                {fontSize}
              </button>
            ))}
          </div>
        )}
        <button className="figma-menu-danger" onClick={deleteAnnotation}><Trash2 size={14} />{t("deleteAnnotation")}</button>
      </div>
    );
  }

  function modalView() {
    if (!modal) return null;
    return (
      <div className="figma-modal-layer" onMouseDown={() => setModal(null)}>
        <div className="figma-modal" onMouseDown={(e) => e.stopPropagation()}>
          <button className="figma-modal-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button>
          {modal === "newProject" && (
            <>
              <h2>{t("newProject")}</h2><p>{t("createProjectBody")}</p>
              <form className="figma-modal-form" onSubmit={(e) => e.preventDefault()}>
                <label>{t("name")}<input value={newProject.name} maxLength={TITLE_TEXT_LIMIT} onChange={(e) => setNewProject({ ...newProject, name: limitTitleText(e.target.value) })} autoFocus /><small>{newProject.name.length}/{TITLE_TEXT_LIMIT}</small></label>
                <label>{t("author")}<input value={newProject.author} maxLength={16} onChange={(e) => setNewProject({ ...newProject, author: e.target.value })} /><small>{newProject.author.length}/16</small></label>
                <label>{t("description")}<textarea value={newProject.description} onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} /></label>
                <Button variant="primary" onClick={createProject} disabled={busy}><Plus size={16} />{t("create")}</Button>
              </form>
            </>
          )}
          {modal === "export" && (
            <>
              <h2>{t("exportProject")}</h2><p>{t("exportBody")}</p>
              <div className="figma-export-grid">
                <ExportChoice icon={FileText} title={t("pdfDocument")} body={t("professionalDocument")} disabled={busy} onClick={() => exportCurrent("pdf")} />
                <ExportChoice icon={FileType2} title={t("wordDocument")} body={t("editableDocx")} disabled={busy} onClick={() => exportCurrent("docx")} />
                <ExportChoice icon={ImageIcon} title={t("imageSet")} body={t("composedImages")} disabled={busy} onClick={() => exportCurrent("images")} />
                <ExportChoice icon={Code} title={t("htmlPage")} body={t("standaloneHtml")} disabled={busy} onClick={() => exportCurrent("html")} />
              </div>
            </>
          )}
          {modal === "preflight" && (
            <>
              <h2>{t("preflight")}</h2><p>{t("preflightBody")}</p>
              {preflight.length === 0 ? <div className="figma-mini-empty">{t("noIssues")}</div> : (
                <div className="figma-preflight-list">
                  {preflight.map((issue) => (
                    <button className={`figma-preflight-item ${issue.severity}`} key={`${issue.code}-${issue.step_id}-${issue.step_index}`} onClick={() => { if (issue.step_id) { setSelectedStepId(issue.step_id); setModal(null); } }}>
                      <strong>{t(`severity_${issue.severity}`)}</strong>
                      <span>{issue.step_index >= 0 ? `${t("step")} ${issue.step_index + 1}: ` : ""}{issueMessage(issue)}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="figma-inline-actions"><Button onClick={() => runPreflight(false)}><CheckSquare size={16} />{t("runChecks")}</Button><Button variant="primary" onClick={() => exportCurrent("pdf")}><Download size={16} />{t("continuePdf")}</Button></div>
            </>
          )}
          {modal === "settings" && (
            <>
              <h2>{t("settings")}</h2><p>{status?.appName ?? "InstraDoc"} {status?.versionLabel ?? "Beta v.2"}</p>
              <form className="figma-modal-form" onSubmit={(e) => e.preventDefault()}>
                <label>{t("language")}<select value={(settingsDraft.language as string) ?? "ru"} onChange={(e) => setSettingsDraft({ ...settingsDraft, language: e.target.value as AppSettings["language"] })}><option value="ru">Русский</option><option value="en">English</option></select></label>
                <label>{t("theme")}<select value={(settingsDraft.theme_mode as string) ?? "dark"} onChange={(e) => setSettingsDraft({ ...settingsDraft, theme_mode: e.target.value as AppSettings["theme_mode"] })}><option value="dark">{t("dark")}</option><option value="light">{t("light")}</option></select></label>
                <label>{t("defaultAuthor")}<input value={(settingsDraft.default_author as string) ?? ""} maxLength={16} onChange={(e) => setSettingsDraft({ ...settingsDraft, default_author: e.target.value })} /><small>{String(settingsDraft.default_author ?? "").length}/16</small></label>
                <label>{t("preflightMode")}<select value={(settingsDraft.preflight_mode as string) ?? "warning"} onChange={(e) => setSettingsDraft({ ...settingsDraft, preflight_mode: e.target.value as AppSettings["preflight_mode"] })}><option value="warning">{t("warning")}</option><option value="strict">{t("strict")}</option></select></label>
                <label className="figma-check-row"><input type="checkbox" checked={Boolean(settingsDraft.autosave)} onChange={(e) => setSettingsDraft({ ...settingsDraft, autosave: e.target.checked })} />{t("autosave")}</label>
                <Button variant="primary" onClick={saveSettings}><Save size={16} />{t("saveSettings")}</Button>
              </form>
            </>
          )}
          {modal === "history" && (
            <>
              <h2>{t("history")}</h2><p>{t("historyBody")}</p>
              <Button variant="primary" onClick={createSnapshot} disabled={busy}><Save size={16} />{t("createSnapshot")}</Button>
              {historyItems.length === 0 ? <div className="figma-mini-empty">{t("noHistory")}</div> : <div className="figma-history-list">{historyItems.map((item) => <div className="figma-history-item" key={item.snapshot_id}><div><strong>{t(`snapshotReason_${item.reason}`) === `snapshotReason_${item.reason}` ? item.reason || item.snapshot_id : t(`snapshotReason_${item.reason}`)}</strong><span>{formatStamp(item.ts)}</span>{item.comment && <small>{item.comment}</small>}</div><Button className="btn-sm" onClick={() => restoreSnapshot(item.snapshot_id)}><RotateCcw size={15} />{t("restore")}</Button></div>)}</div>}
            </>
          )}
          {modal === "trash" && (
            <>
              <h2>{t("trash")}</h2><p>{t("trashBody")}</p>
              {trashItems.length === 0 ? <div className="figma-mini-empty">{t("noTrash")}</div> : (
                <>
                  <div className="figma-history-list">{trashItems.map((item) => <div className="figma-history-item" key={item.id}><div><strong>{item.step.title || t("untitledStep")}</strong><span>{formatStamp(item.deleted_at)}</span></div><div className="figma-inline-actions"><Button className="btn-sm" onClick={() => restoreTrash(item.id)}><RotateCcw size={15} />{t("restore")}</Button><Button variant="danger" className="btn-sm" onClick={() => deleteTrash(item.id)}><Trash2 size={15} />{t("deleteForever")}</Button></div></div>)}</div>
                  <Button variant="danger" onClick={clearTrash}><Trash2 size={16} />{t("clearTrash")}</Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
}

function ExportChoice({ icon: Icon, title, body, onClick, disabled }: { icon: LucideIcon; title: string; body: string; onClick: () => void; disabled?: boolean }) {
  return <button className="figma-export-choice" onClick={onClick} disabled={disabled}><span><Icon size={22} /></span><strong>{title}</strong><small>{body}</small></button>;
}

function createAnnotation(type: AnnotationType, x: number, y: number, number: number): Annotation {
  const base = { id: makeId(), type, x, y, x2: x + 180, y2: y + 90, text: type === "text" ? "Text" : "", color: type === "highlight" ? "#facc15" : "#ef4444", font_size: type === "number" ? 18 : 24, line_width: 4, number, opacity: type === "blur" ? 1 : 0.35, angle: 0 };
  if (type === "arrow") return { ...base, x2: x + 220, y2: y + 70 };
  if (type === "freehand") return { ...base, x2: x, y2: y, text: JSON.stringify([{ x, y }]) };
  if (type === "number") return { ...base, x2: x, y2: y };
  if (type === "text") return { ...base, x2: x + 240, y2: y + 46 };
  return base;
}

function nextNumberAnnotationValue(step: Step) {
  if (!step.annotations.length) return 1;
  const numbers = step.annotations
    .filter((annotation) => annotation.type === "number")
    .map((annotation) => Number(annotation.number))
    .filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

function normalizeStepPatch(patch: Partial<Step>): Partial<Step> {
  return {
    ...patch,
    ...(typeof patch.title === "string" ? { title: limitTitleText(patch.title) } : {}),
    ...(patch.crop_rect !== undefined ? { crop_rect: normalizeCropRect(patch.crop_rect) } : {})
  };
}

function limitTitleText(value: string) {
  return value.slice(0, TITLE_TEXT_LIMIT);
}

function normalizeCropRect(rect: Step["crop_rect"] | undefined): Step["crop_rect"] {
  if (!rect) return null;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const w = Number(rect.w);
  const h = Number(rect.h);
  if (![x, y, w, h].every(Number.isFinite) || w < 2 || h < 2) return null;
  return { x, y, w, h };
}

function cropRectFromAnnotation(annotation: Annotation, metrics: { width: number; height: number }): Step["crop_rect"] {
  const x = clamp(Math.min(annotation.x, annotation.x2), 0, metrics.width);
  const y = clamp(Math.min(annotation.y, annotation.y2), 0, metrics.height);
  const x2 = clamp(Math.max(annotation.x, annotation.x2), 0, metrics.width);
  const y2 = clamp(Math.max(annotation.y, annotation.y2), 0, metrics.height);
  const w = Math.max(1, x2 - x);
  const h = Math.max(1, y2 - y);
  return w >= 8 && h >= 8 ? { x, y, w, h } : null;
}

function visibleImageRect(step: Step, metrics: { width: number; height: number }, applyCrop = true) {
  const full = { x: 0, y: 0, w: Math.max(1, metrics.width), h: Math.max(1, metrics.height) };
  if (!applyCrop || !step.crop_rect) return full;
  const crop = normalizeCropRect(step.crop_rect);
  if (!crop) return full;
  const x = clamp(crop.x, 0, full.w - 1);
  const y = clamp(crop.y, 0, full.h - 1);
  const w = clamp(crop.w, 1, full.w - x);
  const h = clamp(crop.h, 1, full.h - y);
  return { x, y, w, h };
}

function shapeAnnotation(annotation: Annotation, startX: number, startY: number, endX: number, endY: number, mode: "draft" | "click" = "draft"): Annotation {
  if (annotation.type === "freehand") {
    return appendFreehandPoint({ ...annotation, text: JSON.stringify([{ x: startX, y: startY }]) }, endX, endY);
  }
  if (annotation.type === "number" || mode === "click") {
    return { ...annotation, x: startX, y: startY, x2: startX, y2: startY };
  }
  if (annotation.type === "text") {
    return { ...annotation, x: startX, y: startY, x2: endX, y2: endY, text: annotation.text || "Text" };
  }
  return { ...annotation, x: startX, y: startY, x2: endX, y2: endY };
}

function normalizeDrawnAnnotation(annotation: Annotation): Annotation {
  if (annotation.type === "freehand") return normalizeFreehand(annotation);
  const normalized = normalizeAnnotationBox(annotation);
  annotation = annotation.type === "arrow" || annotation.type === "number" ? annotation : normalized;
  const minBox = annotation.type === "text" ? { w: 150, h: 42 } : { w: 12, h: 12 };
  if (annotation.type === "arrow") {
    const tooSmall = Math.hypot(annotation.x2 - annotation.x, annotation.y2 - annotation.y) < 8;
    return tooSmall ? { ...annotation, x2: annotation.x + 160, y2: annotation.y + 44 } : annotation;
  }
  if (annotation.type === "number") return annotation;
  const w = Math.abs(annotation.x2 - annotation.x);
  const h = Math.abs(annotation.y2 - annotation.y);
  if (w >= minBox.w && h >= minBox.h) return annotation;
  return {
    ...annotation,
    x2: annotation.x2 >= annotation.x ? annotation.x + Math.max(w, minBox.w) : annotation.x - Math.max(w, minBox.w),
    y2: annotation.y2 >= annotation.y ? annotation.y + Math.max(h, minBox.h) : annotation.y - Math.max(h, minBox.h)
  };
}

function normalizeAnnotationBox(annotation: Annotation): Annotation {
  if (annotation.type === "arrow" || annotation.type === "number" || annotation.type === "freehand") return annotation;
  const x = Math.min(annotation.x, annotation.x2);
  const y = Math.min(annotation.y, annotation.y2);
  const x2 = Math.max(annotation.x, annotation.x2);
  const y2 = Math.max(annotation.y, annotation.y2);
  return { ...annotation, x, y, x2, y2 };
}

function appendFreehandPoint(annotation: Annotation, x: number, y: number): Annotation {
  const points = freehandPoints(annotation);
  const last = points[points.length - 1];
  if (!last || Math.hypot(x - last.x, y - last.y) >= 2) points.push({ x, y });
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    ...annotation,
    x: Math.min(...xs),
    y: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
    text: JSON.stringify(points)
  };
}

function normalizeFreehand(annotation: Annotation): Annotation {
  const points = freehandPoints(annotation);
  if (points.length < 2) {
    const fallback = [{ x: annotation.x, y: annotation.y }, { x: annotation.x + 80, y: annotation.y + 30 }];
    return { ...annotation, x2: annotation.x + 80, y2: annotation.y + 30, text: JSON.stringify(fallback) };
  }
  return appendFreehandPoint(annotation, points[points.length - 1].x, points[points.length - 1].y);
}

function freehandFromPoints(annotation: Annotation, points: Array<{ x: number; y: number }>): Annotation {
  const safePoints = points.map((point) => ({
    x: clamp(point.x, 0, Number.MAX_SAFE_INTEGER),
    y: clamp(point.y, 0, Number.MAX_SAFE_INTEGER)
  }));
  const xs = safePoints.map((point) => point.x);
  const ys = safePoints.map((point) => point.y);
  return {
    ...annotation,
    x: Math.min(...xs),
    y: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
    text: JSON.stringify(safePoints)
  };
}

function freehandPoints(annotation: Annotation): Array<{ x: number; y: number }> {
  try {
    const parsed = JSON.parse(annotation.text || "[]");
    if (Array.isArray(parsed)) {
      return parsed
        .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    }
  } catch {
    // Fall through to the legacy two-point shape.
  }
  return [{ x: annotation.x, y: annotation.y }, { x: annotation.x2, y: annotation.y2 }];
}

function arrowGeometry(x1: number, y1: number, x2: number, y2: number, lineWidth: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLength = Math.max(16, lineWidth * 5.5);
  const headWidth = Math.max(12, lineWidth * 4.2);
  const baseX = x2 - headLength * Math.cos(angle);
  const baseY = y2 - headLength * Math.sin(angle);
  const normalX = Math.cos(angle + Math.PI / 2);
  const normalY = Math.sin(angle + Math.PI / 2);
  const leftX = baseX + (headWidth / 2) * normalX;
  const leftY = baseY + (headWidth / 2) * normalY;
  const rightX = baseX - (headWidth / 2) * normalX;
  const rightY = baseY - (headWidth / 2) * normalY;
  return {
    lineEnd: { x: baseX, y: baseY },
    points: `${x2},${y2} ${leftX},${leftY} ${rightX},${rightY}`
  };
}

function transformAnnotation(annotation: Annotation, mode: DragMode, dx: number, dy: number, pointerX: number, pointerY: number): Annotation {
  if (annotation.type === "freehand") {
    return transformFreehandAnnotation(annotation, mode, dx, dy, pointerX, pointerY);
  }
  if (mode === "move") {
    return { ...annotation, x: annotation.x + dx, y: annotation.y + dy, x2: annotation.x2 + dx, y2: annotation.y2 + dy };
  }
  if (mode === "arrow-start") return { ...annotation, x: pointerX, y: pointerY };
  if (mode === "arrow-end") return { ...annotation, x2: pointerX, y2: pointerY };
  if (mode === "nw") return { ...annotation, x: pointerX, y: pointerY };
  if (mode === "ne") return { ...annotation, x2: pointerX, y: pointerY };
  if (mode === "sw") return { ...annotation, x: pointerX, y2: pointerY };
  return { ...annotation, x2: pointerX, y2: pointerY };
}

function transformFreehandAnnotation(annotation: Annotation, mode: DragMode, dx: number, dy: number, pointerX: number, pointerY: number): Annotation {
  const points = freehandPoints(annotation);
  if (points.length === 0) return annotation;
  if (mode === "move") {
    return freehandFromPoints(annotation, points.map((point) => ({ x: point.x + dx, y: point.y + dy })));
  }

  const box = {
    x: Math.min(annotation.x, annotation.x2),
    y: Math.min(annotation.y, annotation.y2),
    x2: Math.max(annotation.x, annotation.x2),
    y2: Math.max(annotation.y, annotation.y2)
  };
  const nextBox = { ...box };
  if (mode === "nw") {
    nextBox.x = pointerX;
    nextBox.y = pointerY;
  } else if (mode === "ne") {
    nextBox.x2 = pointerX;
    nextBox.y = pointerY;
  } else if (mode === "sw") {
    nextBox.x = pointerX;
    nextBox.y2 = pointerY;
  } else if (mode === "se") {
    nextBox.x2 = pointerX;
    nextBox.y2 = pointerY;
  }

  const sourceWidth = Math.max(1, box.x2 - box.x);
  const sourceHeight = Math.max(1, box.y2 - box.y);
  const targetX = Math.min(nextBox.x, nextBox.x2);
  const targetY = Math.min(nextBox.y, nextBox.y2);
  const targetWidth = Math.max(1, Math.abs(nextBox.x2 - nextBox.x));
  const targetHeight = Math.max(1, Math.abs(nextBox.y2 - nextBox.y));
  return freehandFromPoints(annotation, points.map((point) => ({
    x: targetX + ((point.x - box.x) / sourceWidth) * targetWidth,
    y: targetY + ((point.y - box.y) / sourceHeight) * targetHeight
  })));
}

function filterProjects(projects: ProjectSummary[], query: string) {
  const q = query.trim().toLowerCase();
  return q ? projects.filter((p) => [p.name, p.description, p.author, p.modified].join(" ").toLowerCase().includes(q)) : projects;
}

function filterSteps(steps: Step[], query: string) {
  const q = query.trim().toLowerCase();
  return q ? steps.filter((s) => [s.title, s.description, s.tags.join(" "), ...s.notes.map((n) => n.text)].join(" ").toLowerCase().includes(q)) : steps;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project;
}

// Snapshot/trash stamps are ISO strings; show them in the visitor's locale.
function formatStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable;
}

async function fileToBase64(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
  return dataUrl.split(",", 2)[1] ?? dataUrl;
}

function startBrowserDownload(url: string, filename?: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "";
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => link.remove(), 0);
}

function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  return `#${clean}${Math.round(clamp(alpha, 0, 1) * 255).toString(16).padStart(2, "0")}`;
}
