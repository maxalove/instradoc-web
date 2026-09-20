import type {
  AppSettings,
  AppStatus,
  ExportFormat,
  HistorySnapshot,
  PreflightIssue,
  Project,
  ProjectSummary,
  Step,
  TrashItem
} from "./types";

const DB_NAME = "instradoc-hosted-browser";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";
const SETTINGS_KEY = "instradoc-hosted-settings";
const HIDDEN_PROJECTS_KEY = "instradoc-hosted-hidden-projects";
const OBJECT_URLS = new Set<string>();

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_SIDE = 12000;
const MAX_STEPS = 100;
const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 300;
const TITLE_TEXT_LIMIT = 28;

const defaultSettings: AppSettings = {
  language: "ru",
  theme_mode: "dark",
  capture_hotkey: "F8",
  overlay_hotkey: "F1",
  save_hotkey: "Ctrl+S",
  export_pdf_hotkey: "Ctrl+E",
  home_hotkey: "Ctrl+H",
  default_projects_folder: "",
  default_export_folder: "",
  default_author: "",
  recent_projects: [],
  annotation_color: "#FF4444",
  annotation_width: 4,
  autosave: true,
  preflight_mode: "warning"
};

export const isHostedBrowserRuntime = import.meta.env.VITE_INSTRADOC_RUNTIME === "hosted-browser";

export const hostedApi = {
  status: async (): Promise<AppStatus> => ({
    appName: "InstraDoc",
    version: "2.0.0-beta.2",
    versionLabel: "Beta v.2",
    runtimeMode: "hosted",
    capabilities: {
      localSave: false,
      desktopCapture: false,
      browserCapture: true,
      guestProjects: true,
      authenticatedProjects: false
    },
    baseDir: "browser-local",
    projectsDir: "IndexedDB",
    exportDir: "browser-downloads",
    figmaHandoff: "pending"
  }),
  settings: async () => loadSettings(),
  saveSettings: async (settings: Partial<AppSettings>) => saveSettings(settings),
  projects: async () => {
    const projects = await listStoredProjects();
    const hidden = hiddenProjectIds();
    return projects
      .filter((project) => !hidden.has(project.id))
      .map(projectSummary)
      .sort((a, b) => b.modified.localeCompare(a.modified));
  },
  createProject: async (payload: { name: string; author?: string; description?: string }) => {
    const now = nowStamp();
    const project: Project = {
      id: makeId(),
      folder: "browser-local",
      schema_version: 2,
      name: limitTitleText(payload.name.trim()),
      description: (payload.description || "").trim(),
      author: (payload.author || "").trim(),
      version: "Beta v.2",
      created: now,
      modified: now,
      tags: [],
      steps: [],
      orientation: "portrait",
      watermark: "",
      last_pdf_path: "",
      lastPdfPath: "",
      history: { snapshots: [], trash: [] },
      wizard_profile: {},
      ai_settings: { enabled: false, provider: "browser" }
    };
    await putProject(project);
    return project;
  },
  project: async (projectId: string) => requireProject(projectId),
  updateProject: async (projectId: string, payload: Partial<Project>) => {
    const project = await requireProject(projectId);
    const updated = normalizeProject(touch({ ...project, ...payload, id: project.id, folder: "browser-local" }));
    await putProject(updated);
    return updated;
  },
  importSteps: async () => {
    throw new Error("Hosted Web imports images through the browser file picker.");
  },
  uploadSteps: async (projectId: string, files: Array<{ name: string; dataBase64: string }>) => {
    const project = await requireProject(projectId);
    if (project.steps.length + files.length > MAX_STEPS) {
      throw new Error(`Project can contain up to ${MAX_STEPS} steps.`);
    }
    const added: Step[] = [];
    for (const file of files) {
      const bytes = base64ToBytes(file.dataBase64);
      if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Image is larger than 15 MB.");
      const mime = detectImageMime(bytes);
      if (!mime) throw new Error("Unsupported or invalid image file.");
      const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`;
      await validateImageDimensions(dataUrl);
      const step: Step = {
        id: makeId(),
        image_path: dataUrl,
        title: "",
        description: "",
        notes: [],
        annotations: [],
        tags: [],
        order: project.steps.length + added.length,
        crop_rect: null
      };
      added.push(step);
    }
    const updated = touch({ ...project, steps: [...project.steps, ...added] });
    await putProject(updated);
    return { project: updated, steps: added };
  },
  captureStep: async () => {
    throw new Error("Hosted Web capture uses the browser screen picker.");
  },
  updateStep: async (projectId: string, stepId: string, payload: Partial<Step>) => {
    const project = await requireProject(projectId);
    const patch = normalizeStepPatch(payload);
    const updated = touch({
      ...project,
      steps: project.steps.map((step) => (step.id === stepId ? normalizeStep({ ...step, ...patch }) : step))
    });
    await putProject(updated);
    return updated;
  },
  deleteStep: async (projectId: string, stepId: string) => {
    const project = await requireProject(projectId);
    const step = project.steps.find((item) => item.id === stepId);
    if (!step) throw new Error("Step not found.");
    const trash = hostedTrash(project);
    const item: TrashItem = { id: makeId(), deleted_at: new Date().toISOString(), step };
    const updated = touch({
      ...project,
      steps: project.steps.filter((item) => item.id !== stepId).map((item, index) => ({ ...item, order: index })),
      history: { ...project.history, trash: [item, ...trash] }
    });
    await putProject(updated);
    return updated;
  },
  reorderSteps: async (projectId: string, stepIds: string[]) => {
    const project = await requireProject(projectId);
    const byId = new Map(project.steps.map((step) => [step.id, step]));
    const steps = stepIds.map((id, index) => ({ ...byId.get(id)!, order: index })).filter(Boolean);
    const updated = touch({ ...project, steps });
    await putProject(updated);
    return updated;
  },
  preflight: async (projectId: string) => {
    const project = await requireProject(projectId);
    const issues: PreflightIssue[] = [];
    if (!project.steps.length) {
      issues.push({ severity: "critical", code: "no_steps", message: "В проекте нет шагов.", step_id: "", step_index: -1 });
    }
    project.steps.forEach((step, index) => {
      if (!step.image_path) issues.push({ severity: "critical", code: "missing_image", message: "У шага нет изображения.", step_id: step.id, step_index: index });
      if (!step.title.trim()) issues.push({ severity: "warning", code: "empty_title", message: "У шага нет заголовка.", step_id: step.id, step_index: index });
      if (!step.description.trim()) issues.push({ severity: "warning", code: "empty_description", message: "У шага нет описания.", step_id: step.id, step_index: index });
    });
    return { issues, hasCritical: issues.some((issue) => issue.severity === "critical") };
  },
  exportProject: async (projectId: string, format: ExportFormat) => {
    const project = await requireProject(projectId);
    const blob = await exportProjectBlob(project, format);
    const url = objectUrl(blob);
    const name = downloadName(project, format);
    // A hosted export is a browser download, so the filename is the only durable
    // marker we have — it is what turns the project card badge into "PDF ready".
    if (format === "pdf") {
      await putProject({ ...project, last_pdf_path: name, lastPdfPath: name });
    }
    return { path: url, downloadName: name, format };
  },
  exportDownloadUrl: (projectId: string, path: string) => path,
  hideRecentProject: async (projectId: string) => {
    hideProjectId(projectId);
    const hidden = hiddenProjectIds();
    return (await listStoredProjects())
      .filter((project) => !hidden.has(project.id))
      .map(projectSummary)
      .sort((a, b) => b.modified.localeCompare(a.modified));
  },
  listHistory: async (projectId: string) => {
    const project = await requireProject(projectId);
    return { items: hostedHistory(project) };
  },
  createSnapshot: async (projectId: string, reason: string, comment = "") => {
    const project = await requireProject(projectId);
    const snapshot: HistorySnapshot & { project: Project } = {
      snapshot_id: makeId(),
      ts: new Date().toISOString(),
      reason,
      comment,
      project
    };
    const items = [snapshot, ...hostedHistory(project)].slice(0, 20);
    const updated = touch({ ...project, history: { ...project.history, snapshots: items } });
    await putProject(updated);
    return { snapshotId: snapshot.snapshot_id, items };
  },
  restoreSnapshot: async (projectId: string, snapshotId: string) => {
    const project = await requireProject(projectId);
    const snapshot = hostedHistory(project).find((item) => item.snapshot_id === snapshotId) as (HistorySnapshot & { project?: Project }) | undefined;
    if (!snapshot?.project) throw new Error("Snapshot not found.");
    const restored = touch({ ...snapshot.project, history: project.history });
    await putProject(restored);
    return { project: restored };
  },
  listTrash: async (projectId: string) => {
    const project = await requireProject(projectId);
    return { items: hostedTrash(project) };
  },
  restoreTrashItem: async (projectId: string, itemId: string) => {
    const project = await requireProject(projectId);
    const trash = hostedTrash(project);
    const item = trash.find((entry) => entry.id === itemId);
    if (!item?.step?.id) throw new Error("Trash item not found.");
    const exists = project.steps.some((step) => step.id === item.step.id);
    const steps = exists ? project.steps : [...project.steps, item.step as Step].map((step, index) => ({ ...step, order: index }));
    const items = trash.filter((entry) => entry.id !== itemId);
    const updated = touch({ ...project, steps, history: { ...project.history, trash: items } });
    await putProject(updated);
    return { step: item.step as Step, project: updated, items };
  },
  deleteTrashItem: async (projectId: string, itemId: string) => {
    const project = await requireProject(projectId);
    const items = hostedTrash(project).filter((entry) => entry.id !== itemId);
    const updated = touch({ ...project, history: { ...project.history, trash: items } });
    await putProject(updated);
    return { deleted: true, items };
  },
  clearTrash: async (projectId: string) => {
    const project = await requireProject(projectId);
    const updated = touch({ ...project, history: { ...project.history, trash: [] } });
    await putProject(updated);
    return { items: [] };
  },
  stepImageUrl: () => "",
  exportProjectArchive,
  importProjectArchive
};

export function hostedStepImageUrl(step: Step) {
  return step.image_path.startsWith("data:") ? step.image_path : "";
}

async function exportProjectBlob(project: Project, format: ExportFormat): Promise<Blob> {
  if (format === "html") return exportHtml(project);
  if (format === "images") return exportImagesZip(project);
  if (format === "pdf") return exportPdf(project);
  if (format === "docx") return exportDocx(project);
  throw new Error("Unsupported export format.");
}

async function exportProjectArchive(project: Project) {
  const { zipSync } = await import("fflate");
  const entries: Record<string, Uint8Array> = {};
  const portable = cloneProjectForArchive(project);
  for (const step of portable.steps) {
    const source = project.steps.find((item) => item.id === step.id);
    if (!source?.image_path.startsWith("data:")) continue;
    const ext = extensionFromDataUrl(source.image_path);
    const path = `images/${step.id}${ext}`;
    step.image_path = path;
    entries[path] = dataUrlToBytes(source.image_path);
  }
  entries["project.json"] = strToU8(JSON.stringify(portable, null, 2));
  entries["metadata.json"] = strToU8(JSON.stringify({ appVersion: "Beta v.2", createdAt: new Date().toISOString(), exportedByRuntime: "hosted-browser" }, null, 2));
  const blob = new Blob([arrayBufferCopy(zipSync(entries))], { type: "application/zip" });
  const url = objectUrl(blob);
  triggerDownload(url, `${safeName(project.name)}.idoc.zip`);
}

async function importProjectArchive(file: File) {
  const { unzipSync } = await import("fflate");
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error("Project archive is too large.");
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const entries = Object.keys(archive);
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error("Project archive contains too many files.");
  if (entries.some((name) => name.includes("..") || name.startsWith("/") || /^[a-z]:/i.test(name))) {
    throw new Error("Unsafe project archive paths.");
  }
  const projectBytes = archive["project.json"];
  if (!projectBytes) throw new Error("project.json is missing.");
  const project = JSON.parse(strFromU8(projectBytes)) as Project;
  if (!Array.isArray(project.steps) || Number(project.schema_version) > 2) throw new Error("Unsupported project schema.");
  const imported: Project = normalizeProject(touch({ ...project, id: project.id || makeId(), folder: "browser-local" }));
  imported.steps = imported.steps.map((step, index) => {
    const path = step.image_path.replace(/\\/g, "/");
    const bytes = archive[path];
    if (!bytes) return normalizeStep({ ...step, order: index, image_path: "" });
    const mime = detectImageMime(bytes);
    if (!mime) throw new Error(`Invalid image in archive: ${path}`);
    return normalizeStep({ ...step, order: index, image_path: `data:${mime};base64,${bytesToBase64(bytes)}` });
  });
  await putProject(imported);
  unhideProjectId(imported.id);
  return imported;
}

async function exportImagesZip(project: Project) {
  const { zipSync } = await import("fflate");
  const entries: Record<string, Uint8Array> = {};
  for (let index = 0; index < project.steps.length; index += 1) {
    const dataUrl = await renderStepDataUrl(project.steps[index]);
    entries[`step_${String(index + 1).padStart(3, "0")}.png`] = dataUrlToBytes(dataUrl);
  }
  return new Blob([arrayBufferCopy(zipSync(entries))], { type: "application/zip" });
}

async function exportHtml(project: Project) {
  const steps = await Promise.all(project.steps.map(async (step, index) => {
    const image = await renderStepDataUrl(step);
    return `<section><h2>${index + 1}. ${escapeHtml(step.title || `Шаг ${index + 1}`)}</h2><img src="${image}" alt=""><p>${escapeHtml(step.description || "")}</p></section>`;
  }));
  return new Blob([`<!doctype html><html lang="ru"><meta charset="utf-8"><title>${escapeHtml(project.name)}</title><style>body{font-family:Arial,sans-serif;max-width:960px;margin:32px auto;padding:0 16px}img{max-width:100%;border:1px solid #ddd}section{margin:0 0 32px}</style><h1>${escapeHtml(project.name)}</h1>${steps.join("")}</html>`], { type: "text/html;charset=utf-8" });
}

async function exportPdf(project: Project) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: project.orientation || "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  if (!project.steps.length) {
    const page = await renderPdfPageCanvas({
      pageWidth,
      pageHeight,
      title: project.name || "InstraDoc instruction",
      subtitle: "InstraDoc Beta v.2",
      description: project.description || "No steps yet.",
      imageDataUrl: ""
    });
    pdf.addImage(page, "PNG", 0, 0, pageWidth, pageHeight);
    return pdf.output("blob");
  }
  for (let index = 0; index < project.steps.length; index += 1) {
    if (index > 0) pdf.addPage();
    const step = project.steps[index];
    const dataUrl = await renderStepDataUrl(step);
    const page = await renderPdfPageCanvas({
      pageWidth,
      pageHeight,
      title: `${index + 1}. ${step.title || `Шаг ${index + 1}`}`,
      subtitle: project.name || "InstraDoc",
      description: step.description || "",
      imageDataUrl: dataUrl,
      footer: step.tags.length ? `Теги: ${step.tags.join(", ")}` : ""
    });
    pdf.addImage(page, "PNG", 0, 0, pageWidth, pageHeight);
  }
  return pdf.output("blob");
}

async function renderPdfPageCanvas(options: {
  pageWidth: number;
  pageHeight: number;
  title: string;
  subtitle: string;
  description: string;
  imageDataUrl: string;
  footer?: string;
}) {
  const density = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(options.pageWidth * density);
  canvas.height = Math.round(options.pageHeight * density);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas PDF export is unavailable.");

  const px = (value: number) => value * density;
  const margin = px(42);
  const maxWidth = canvas.width - margin * 2;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#111827";
  ctx.font = `700 ${px(18)}px Arial, sans-serif`;
  let cursorY = px(42);
  cursorY = drawWrappedCanvasText(ctx, options.title, margin, cursorY, maxWidth, px(24), 2);

  ctx.fillStyle = "#4b5563";
  ctx.font = `${px(10)}px Arial, sans-serif`;
  cursorY = drawWrappedCanvasText(ctx, options.subtitle, margin, cursorY + px(5), maxWidth, px(14), 1) + px(16);

  if (options.imageDataUrl) {
    const image = await loadImage(options.imageDataUrl);
    const maxImageHeight = Math.max(px(260), canvas.height - cursorY - px(options.description ? 150 : 84));
    const scale = Math.min(maxWidth / image.naturalWidth, maxImageHeight / image.naturalHeight, 1);
    const imageWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const imageHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const imageX = margin + Math.max(0, (maxWidth - imageWidth) / 2);
    ctx.drawImage(image, imageX, cursorY, imageWidth, imageHeight);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = px(1);
    ctx.strokeRect(imageX, cursorY, imageWidth, imageHeight);
    cursorY += imageHeight + px(22);
  }

  if (options.description) {
    ctx.fillStyle = "#1f2937";
    ctx.font = `${px(11)}px Arial, sans-serif`;
    cursorY = drawWrappedCanvasText(ctx, options.description, margin, cursorY, maxWidth, px(16), 8);
  }

  if (options.footer) {
    ctx.fillStyle = "#6b7280";
    ctx.font = `${px(9)}px Arial, sans-serif`;
    drawWrappedCanvasText(ctx, options.footer, margin, canvas.height - px(42), maxWidth, px(13), 2);
  }

  return canvas.toDataURL("image/png");
}

async function exportDocx(project: Project) {
  const { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } = await import("docx");
  const children = [
    new Paragraph({ text: project.name || "InstraDoc instruction", heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({ text: "InstraDoc Beta v.2", bold: true }),
        ...(project.author ? [new TextRun({ text: ` · ${project.author}` })] : [])
      ]
    }),
    ...(project.description ? [new Paragraph({ text: project.description })] : []),
    new Paragraph({ text: "" })
  ];

  for (let index = 0; index < project.steps.length; index += 1) {
    const step = project.steps[index];
    const dataUrl = await renderStepDataUrl(step);
    const image = await loadImage(dataUrl);
    const maxWidth = 620;
    const scale = Math.min(maxWidth / image.naturalWidth, 1);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    children.push(
      new Paragraph({
        text: `${index + 1}. ${step.title || `Шаг ${index + 1}`}`,
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: index > 0
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: "png",
            data: dataUrlToBytes(dataUrl),
            transformation: { width, height }
          })
        ]
      })
    );
    if (step.description) children.push(new Paragraph({ text: step.description }));
    if (step.notes.length) {
      children.push(new Paragraph({ children: [new TextRun({ text: "Заметки", bold: true })] }));
      for (const note of step.notes) {
        if (note.text) children.push(new Paragraph({ text: note.text, bullet: { level: 0 } }));
      }
    }
    if (step.tags.length) {
      children.push(new Paragraph({ children: [new TextRun({ text: `Теги: ${step.tags.join(", ")}`, italics: true })] }));
    }
  }

  const doc = new Document({
    creator: project.author || "InstraDoc",
    title: project.name || "InstraDoc instruction",
    description: "Generated by InstraDoc Beta v.2 hosted-browser",
    sections: [{ children }]
  });
  return Packer.toBlob(doc);
}

async function renderStepDataUrl(step: Step) {
  const image = await loadImage(step.image_path);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas export is unavailable.");
  ctx.drawImage(image, 0, 0);
  for (const ann of step.annotations) renderAnnotation(ctx, ann, image);
  const crop = normalizeCropRect(step.crop_rect, image.naturalWidth, image.naturalHeight);
  if (crop) {
    const cropped = document.createElement("canvas");
    cropped.width = Math.max(1, Math.round(crop.w));
    cropped.height = Math.max(1, Math.round(crop.h));
    const croppedCtx = cropped.getContext("2d");
    if (!croppedCtx) throw new Error("Canvas crop export is unavailable.");
    croppedCtx.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    return cropped.toDataURL("image/png");
  }
  return canvas.toDataURL("image/png");
}

function renderAnnotation(ctx: CanvasRenderingContext2D, ann: Step["annotations"][number], image: HTMLImageElement) {
  ctx.save();
  ctx.strokeStyle = ann.color;
  ctx.fillStyle = ann.color;
  ctx.lineWidth = ann.line_width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const x = Math.min(ann.x, ann.x2);
  const y = Math.min(ann.y, ann.y2);
  const w = Math.abs(ann.x2 - ann.x);
  const h = Math.abs(ann.y2 - ann.y);
  if (ann.type === "rect") ctx.strokeRect(x, y, w, h);
  if (ann.type === "circle") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (ann.type === "highlight") {
    ctx.globalAlpha = 0.26;
    ctx.fillRect(x, y, w, h);
  }
  if (ann.type === "blur" && w > 2 && h > 2) {
    ctx.filter = "blur(12px)";
    ctx.drawImage(image, x, y, w, h, x, y, w, h);
    ctx.filter = "none";
  }
  if (ann.type === "arrow") drawCanvasArrow(ctx, ann.x, ann.y, ann.x2, ann.y2, ann.line_width);
  if (ann.type === "freehand") {
    const points = freehandPoints(ann.text);
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.stroke();
  }
  if (ann.type === "text") {
    ctx.font = `700 ${ann.font_size}px Arial`;
    ctx.fillText(ann.text || "Text", ann.x, ann.y);
  }
  if (ann.type === "number") {
    const r = Math.max(18, ann.font_size);
    ctx.beginPath();
    ctx.arc(ann.x, ann.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${ann.font_size}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(ann.number), ann.x, ann.y);
  }
  ctx.restore();
}

function drawCanvasArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, lineWidth: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLength = Math.max(16, lineWidth * 5.5);
  const headWidth = Math.max(12, lineWidth * 4.2);
  const baseX = x2 - headLength * Math.cos(angle);
  const baseY = y2 - headLength * Math.sin(angle);
  const normalX = Math.cos(angle + Math.PI / 2);
  const normalY = Math.sin(angle + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(baseX, baseY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(baseX + (headWidth / 2) * normalX, baseY + (headWidth / 2) * normalY);
  ctx.lineTo(baseX - (headWidth / 2) * normalX, baseY - (headWidth / 2) * normalY);
  ctx.closePath();
  ctx.fill();
}

function freehandPoints(text: string) {
  try {
    const parsed = JSON.parse(text || "[]");
    return Array.isArray(parsed) ? parsed.map((point) => ({ x: Number(point.x), y: Number(point.y) })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) : [];
  } catch {
    return [];
  }
}

function drawWrappedCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 10
) {
  const paragraphs = text.split(/\r?\n/);
  let lineCount = 0;
  let cursorY = y;
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    if (!words.length) {
      cursorY += lineHeight;
      lineCount += 1;
      continue;
    }
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
        continue;
      }
      ctx.fillText(line, x, cursorY);
      cursorY += lineHeight;
      lineCount += 1;
      if (lineCount >= maxLines) return cursorY;
      line = word;
    }
    if (line && lineCount < maxLines) {
      ctx.fillText(line, x, cursorY);
      cursorY += lineHeight;
      lineCount += 1;
    }
    if (lineCount >= maxLines) return cursorY;
  }
  return cursorY;
}

function cloneProjectForArchive(project: Project): Project {
  return JSON.parse(JSON.stringify(project));
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = src;
  });
}

async function validateImageDimensions(dataUrl: string) {
  const image = await loadImage(dataUrl);
  if (image.naturalWidth > MAX_IMAGE_SIDE || image.naturalHeight > MAX_IMAGE_SIDE) {
    throw new Error(`Image dimensions must be ${MAX_IMAGE_SIDE}px or less.`);
  }
}

function detectImageMime(bytes: Uint8Array) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) return "image/webp";
  // No magic-byte match: the file is not one of the formats we can render, whatever
  // its extension claims. Returning "" makes the caller reject it.
  return "";
}

function extensionFromDataUrl(dataUrl: string) {
  if (dataUrl.startsWith("data:image/jpeg")) return ".jpg";
  if (dataUrl.startsWith("data:image/webp")) return ".webp";
  if (dataUrl.startsWith("data:image/bmp")) return ".bmp";
  return ".png";
}

function dataUrlToBytes(dataUrl: string) {
  return base64ToBytes(dataUrl.split(",", 2)[1] || dataUrl);
}

function base64ToBytes(value: string) {
  const binary = atob(value.split(",", 2).pop() || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function arrayBufferCopy(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

function strToU8(value: string) {
  return new TextEncoder().encode(value);
}

function strFromU8(value: Uint8Array) {
  return new TextDecoder().decode(value);
}

function downloadName(project: Project, format: ExportFormat) {
  if (format === "images") return `${safeName(project.name)}_images.zip`;
  return `${safeName(project.name)}.${format}`;
}

function objectUrl(blob: Blob) {
  const url = URL.createObjectURL(blob);
  OBJECT_URLS.add(url);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    OBJECT_URLS.delete(url);
  }, 30 * 60 * 1000);
  return url;
}

function triggerDownload(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function loadSettings(): Promise<AppSettings> {
  const stored = localStorage.getItem(SETTINGS_KEY);
  return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
}

async function saveSettings(settings: Partial<AppSettings>) {
  const next = { ...(await loadSettings()), ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

async function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(PROJECT_STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(PROJECT_STORE, mode);
    const request = run(transaction.objectStore(PROJECT_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function putProject(project: Project) {
  await tx("readwrite", (store) => store.put(normalizeProject(project)));
}

async function requireProject(projectId: string) {
  const project = await tx<Project | undefined>("readonly", (store) => store.get(projectId));
  if (!project) throw new Error("Project not found.");
  return project;
}

async function listStoredProjects() {
  return tx<Project[]>("readonly", (store) => store.getAll());
}

function hostedHistory(project: Project): HistorySnapshot[] {
  return Array.isArray(project.history?.snapshots) ? project.history.snapshots as HistorySnapshot[] : [];
}

function hostedTrash(project: Project): TrashItem[] {
  return Array.isArray(project.history?.trash) ? project.history.trash as TrashItem[] : [];
}

function projectSummary(project: Project): ProjectSummary {
  const lastPdfPath = project.last_pdf_path || project.lastPdfPath || "";
  return {
    id: project.id,
    folder: project.folder,
    name: project.name,
    description: project.description,
    author: project.author,
    version: project.version,
    modified: project.modified,
    created: project.created,
    stepCount: project.steps.length,
    lastPdfPath,
    status: lastPdfPath ? "exported" : "draft"
  };
}

function hiddenProjectIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HIDDEN_PROJECTS_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function hideProjectId(projectId: string) {
  const hidden = hiddenProjectIds();
  hidden.add(projectId);
  localStorage.setItem(HIDDEN_PROJECTS_KEY, JSON.stringify([...hidden]));
}

function unhideProjectId(projectId: string) {
  const hidden = hiddenProjectIds();
  if (!hidden.delete(projectId)) return;
  localStorage.setItem(HIDDEN_PROJECTS_KEY, JSON.stringify([...hidden]));
}

function touch<T extends Project>(project: T): T {
  return { ...project, modified: nowStamp() };
}

function normalizeProject<T extends Project>(project: T): T {
  return {
    ...project,
    name: limitTitleText(project.name || ""),
    description: project.description || "",
    steps: Array.isArray(project.steps) ? project.steps.map(normalizeStep) : []
  };
}

function normalizeStep(step: Step): Step {
  return {
    ...step,
    title: limitTitleText(step.title || ""),
    description: step.description || "",
    crop_rect: normalizeCropRect(step.crop_rect)
  };
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

function normalizeCropRect(rect: Step["crop_rect"] | undefined | null, maxWidth = Number.MAX_SAFE_INTEGER, maxHeight = Number.MAX_SAFE_INTEGER): Step["crop_rect"] {
  if (!rect) return null;
  const x = Math.max(0, Number(rect.x));
  const y = Math.max(0, Number(rect.y));
  const w = Number(rect.w);
  const h = Number(rect.h);
  if (![x, y, w, h].every(Number.isFinite) || w < 2 || h < 2) return null;
  return {
    x: Math.min(x, Math.max(0, maxWidth - 1)),
    y: Math.min(y, Math.max(0, maxHeight - 1)),
    w: Math.min(w, Math.max(1, maxWidth - x)),
    h: Math.min(h, Math.max(1, maxHeight - y))
  };
}

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function safeName(name: string) {
  return (name || "instruction").replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "") || "instruction";
}

function makeId() {
  return crypto.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}
