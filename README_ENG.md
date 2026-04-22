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

## Highlights

- Browser-first instruction editor with import/export flows
- Local draft persistence for the hosted public build
- PDF, DOCX, HTML, and images ZIP export in the frontend
- Shared design tokens and modern glass-style UI system
- Typed API layer for hosted and sidecar-backed runtimes
- Ready-to-publish static build for ISPManager, Apache, Netlify, or Cloudflare Pages

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

Detailed release notes and ISPManager guidance live in [`HOSTED_WEB_DEPLOY_ENG.md`](../HOSTED_WEB_DEPLOY_ENG.md).

## Tauri Notes

The `src-tauri/` folder is included for desktop shell work, but the public hosted release does not require Rust, Tauri packaging, or a Python sidecar.

If you want to work on the shell locally:

```powershell
npm run tauri:dev
```

## Publishing This Source on GitHub

If you plan to publish only the web source code as a separate repository, include:

- `public/`
- `src/`
- `src-tauri/`
- `index.html`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vite.config.ts`
- `.env.hosted-browser`
- `README.md`

Do not publish:

- `node_modules/`
- `dist/`
- local release archives

## Status

This is an active beta codebase. The hosted public build is already suitable for preview deployment, while the desktop shell and deeper backend-backed workflows are still evolving.
