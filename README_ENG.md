<div align="center">
  <img src="./public/android-chrome-512x512.png" alt="InstraDoc Web logo" width="112" height="112" />
  <h1>InstraDoc Web</h1>
  <p><strong>Browser-first editor for building clean step-by-step visual instructions.</strong></p>
  <p>React + TypeScript frontend with a hosted-browser mode for static deployment and an optional Tauri shell for desktop packaging.</p>
  <p>
    <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18" />
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5" />
    <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" alt="Vite 5" />
    <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2" />
  </p>
</div>

## Overview

InstraDoc Web is the web workspace of the InstraDoc project. It focuses on creating, editing, importing, and exporting screenshot-based instructions directly in the browser.

The current codebase is designed for two runtime paths:

- `hosted-browser`: static hosting on a public domain with no Python sidecar
- `tauri`: optional desktop shell for local workflows and future packaged builds

Live version: **https://instradoc.mxlv.pw/**

## Highlights

- Browser-first instruction editor: import, paste or capture screenshots
- Annotations — arrow, rectangle, circle, text, number, highlight, blur, pencil, crop
- Canvas zoom and pan, undo/redo, drag-and-drop step reordering
- Projects persisted locally in IndexedDB in the hosted build
- Snapshot history and a step trash bin
- Preflight checks before export
- PDF, DOCX, HTML, and images ZIP export in the frontend
- Move a project between devices as a `.idoc.zip` archive
- Light and dark themes from shared design tokens, Russian and English UI
- Typed API layer for hosted and sidecar-backed runtimes
- Ready-to-publish static build for ISPManager, Apache, Netlify, or Cloudflare Pages

## Keyboard Shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl+S` | Save the project |
| `Ctrl+Z` / `Ctrl+Shift+Z`, `Ctrl+Y` | Undo / redo |
| `Delete`, `Backspace` | Delete the selected annotation |
| `Ctrl+V` | Paste an image from the clipboard as a new step |
| `Space` + drag, mouse wheel | Pan and zoom the canvas |
| `Alt+↑` / `Alt+↓` | Move the step within the list |

## Tech Stack

- React 18
- TypeScript 5
- Vite 5
- Tauri v2
- `jspdf`, `docx`, `fflate` for client-side export tooling

## Project Structure

```text
.
|-- public/          Static assets copied into the production build
|-- src/             React app, API clients, i18n, styles, components
|-- src-tauri/       Optional Tauri shell scaffold
|-- index.html       Vite entry
|-- package.json     Scripts and dependencies
|-- tsconfig.json    TypeScript config
`-- vite.config.ts   Vite config
```

## Quick Start

Install dependencies:

```powershell
npm install
```

Run the standard dev server:

```powershell
npm run dev
```

Run the hosted-browser variant:

```powershell
npm run dev:hosted
```

Create a production build:

```powershell
npm run build
```

Create the hosted static build:

```powershell
npm run build:hosted
```

Preview the build locally:

```powershell
npm run preview
```

## Available Scripts

- `npm run dev` - local Vite dev server
- `npm run dev:hosted` - local dev server in hosted-browser mode
- `npm run build` - type-check and build the default web bundle
- `npm run build:hosted` - type-check and build the static hosted bundle
- `npm run preview` - preview the production build locally
- `npm run tauri:dev` - run the Tauri shell in development
- `npm run tauri:build` - build the Tauri shell

## Hosted Deployment

For public web hosting, use only the hosted-browser build:

```powershell
npm install
npm run build:hosted
```

Publish the contents of:

```text
dist/
```

Recommended targets:

- ISPManager / Apache
- Cloudflare Pages
- Netlify
- Any static host that can serve a Vite SPA

The repository also includes:

- `.htaccess` for Apache SPA fallback and headers
- `_headers` for platforms that support file-based header config
- `site.webmanifest` and app icons for installable behavior

Detailed release notes and ISPManager guidance live in [`HOSTED_WEB_DEPLOY_ENG.md`](./HOSTED_WEB_DEPLOY_ENG.md).

## Runtime Modes

The runtime is selected by `VITE_INSTRADOC_RUNTIME`:

- `.env.hosted-browser` sets `VITE_INSTRADOC_RUNTIME=hosted-browser` and is picked up by the
  `dev:hosted` and `build:hosted` scripts. Projects live in the browser's IndexedDB and all
  export work happens client-side.
- Without that variable (`npm run dev` / `npm run build`) the app talks to a local sidecar at
  `http://127.0.0.1:8765`. Override the address with `VITE_INSTRADOC_API`.

`.env.hosted-browser` is committed on purpose: without it a public build tries to reach
localhost and does not work.

## Tauri Notes

The `src-tauri/` folder ships with the repository, but `npm run tauri:build` will not
succeed from this standalone repo: `tauri.conf.json` lists the Python sidecar
(`../../sidecar`, `../../sidecar_main.py`, `../../requirements.txt`) under
`bundle.resources`, and those live in the main InstraDoc monorepo. The public hosted
release needs neither Rust, Tauri, nor Python.

Run the desktop shell in development with:

```powershell
npm run tauri:dev
```

## Status

Active beta. The hosted build is ready to publish: editor, annotations, export, themes
and localisation all work. The desktop shell and backend-backed workflows are still evolving.

## License

No license has been chosen yet. Without one, default copyright applies and third parties
may not use, modify or redistribute the code. If this repository is meant to be open
source, add a `LICENSE` file (MIT, for example).
