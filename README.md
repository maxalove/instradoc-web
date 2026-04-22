<div align="center">
  <img src="./public/android-chrome-512x512.png" alt="Логотип InstraDoc Web" width="112" height="112" />
  <h1>InstraDoc Web</h1>
  <p><strong>Браузерный редактор для создания аккуратных пошаговых инструкций.</strong></p>
  <p>React + TypeScript frontend с hosted-browser режимом для статического деплоя и опциональной Tauri-оболочкой для desktop-сценариев.</p>
</div>

## О проекте

`InstraDoc Web` — это web-часть проекта InstraDoc. Она отвечает за создание, редактирование, импорт и экспорт инструкций на основе скриншотов прямо в браузере.

Текущая кодовая база поддерживает два сценария запуска:

- `hosted-browser` — публичная статическая публикация без Python sidecar
- `tauri` — desktop-оболочка для локальной работы и будущих packaged-сценариев

Английская версия сохранена отдельно: [README_ENG.md](./README_ENG.md)

Web версия развернута уже по ссылке: https://instradoc.mxlv.pw/

## Что уже есть

- браузерный редактор инструкций;
- локальное хранение черновиков в hosted-режиме;
- клиентский экспорт в PDF, DOCX, HTML и ZIP с изображениями;
- общие дизайн-токены и UI-стили;
- typed API-слой для hosted и sidecar-режимов;
- готовая static-сборка для публикации через ISPManager, Apache, Netlify или Cloudflare Pages.

## Технологии

- React 18
- TypeScript 5
- Vite 5
- Tauri v2
- `jspdf`, `docx`, `fflate` для клиентского экспорта

## Структура проекта

```text
.
|-- public/          Статические файлы, копируемые в production build
|-- src/             React-приложение, API-клиенты, стили, i18n, компоненты
|-- src-tauri/       Tauri-оболочка для desktop-сценариев
|-- index.html       Точка входа Vite
|-- package.json     Скрипты и зависимости
|-- tsconfig.json    Настройки TypeScript
`-- vite.config.ts   Настройки Vite
```

## Быстрый старт

Установка зависимостей:

```powershell
npm install
```

Запуск локального dev-сервера:

```powershell
npm run dev
```

Запуск hosted-browser режима:

```powershell
npm run dev:hosted
```

Production build:

```powershell
npm run build
```

Hosted static build:

```powershell
npm run build:hosted
```

Локальный preview production-сборки:

```powershell
npm run preview
```

## Доступные скрипты

- `npm run dev` — обычный локальный Vite dev server
- `npm run dev:hosted` — dev server в hosted-browser режиме
- `npm run build` — type-check и сборка стандартного web bundle
- `npm run build:hosted` — type-check и сборка статической hosted-версии
- `npm run preview` — локальный просмотр production build
- `npm run tauri:dev` — запуск Tauri-оболочки в режиме разработки
- `npm run tauri:build` — сборка Tauri-оболочки

## Публичная web-публикация

Для публичного домена используйте именно hosted-browser сборку:

```powershell
npm install
npm run build:hosted
```

Публиковать нужно содержимое:

```text
dist/
```

В проект уже входят:

- `.htaccess` для Apache SPA fallback и заголовков;
- `_headers` для платформ с файловой конфигурацией заголовков;
- `site.webmanifest` и favicon/app icon пакет.

Подробная инструкция лежит в файле [HOSTED_WEB_DEPLOY.md](../HOSTED_WEB_DEPLOY.md).

## Tauri-часть

Папка `src-tauri/` уже включена в проект, но для публичной hosted-публикации Rust, Tauri packaging и Python sidecar не нужны.

Если нужно локально поработать с desktop shell:

```powershell
npm run tauri:dev
```

## Если публиковать web-исходники на GitHub отдельно

Если выносите web-часть в отдельный GitHub-репозиторий, имеет смысл включить:

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

И не включать:

- `node_modules/`
- `dist/`
- локальные release-архивы

## Статус

Это активная beta-ветка. Hosted public build уже пригоден для preview-публикации, а desktop shell и более глубокие backend-сценарии продолжают развиваться.
