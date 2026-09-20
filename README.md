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

Живая версия: **https://instradoc.mxlv.pw/**

## Что уже есть

- браузерный редактор инструкций: импорт и вставка скриншотов, снимок экрана через браузер;
- аннотации — стрелка, рамка, круг, текст, номер, маркер, блюр, карандаш, обрезка;
- зум и панорамирование холста, undo/redo, drag-and-drop порядка шагов;
- локальное хранение проектов в IndexedDB в hosted-режиме;
- история снимков и корзина шагов;
- preflight-проверки перед экспортом;
- клиентский экспорт в PDF, DOCX, HTML и ZIP с изображениями;
- перенос проекта между устройствами через `.idoc.zip`;
- светлая и темная темы на общих дизайн-токенах, русский и английский интерфейс;
- typed API-слой для hosted и sidecar-режимов;
- готовая static-сборка для публикации через ISPManager, Apache, Netlify или Cloudflare Pages.

## Горячие клавиши

| Клавиши | Действие |
| --- | --- |
| `Ctrl+S` | сохранить проект |
| `Ctrl+Z` / `Ctrl+Shift+Z`, `Ctrl+Y` | отменить / повторить |
| `Delete`, `Backspace` | удалить выбранную аннотацию |
| `Ctrl+V` | вставить изображение из буфера как новый шаг |
| `Space` + перетаскивание, колесо мыши | панорамирование и зум холста |
| `Alt+↑` / `Alt+↓` | переместить шаг в списке |

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

Подробная инструкция лежит в файле [HOSTED_WEB_DEPLOY.md](./HOSTED_WEB_DEPLOY.md).

## Режимы запуска

Режим выбирается переменной `VITE_INSTRADOC_RUNTIME`:

- `.env.hosted-browser` содержит `VITE_INSTRADOC_RUNTIME=hosted-browser` и подключается
  скриптами `dev:hosted` и `build:hosted`. Проекты хранятся в IndexedDB браузера,
  экспорт выполняется на стороне клиента.
- Без этой переменной (`npm run dev` / `npm run build`) приложение обращается к
  локальному sidecar на `http://127.0.0.1:8765`. Адрес переопределяется через
  `VITE_INSTRADOC_API`.

Файл `.env.hosted-browser` намеренно закоммичен: без него публичная сборка пытается
достучаться до localhost и не работает.

## Tauri-часть

Папка `src-tauri/` включена в репозиторий, но `npm run tauri:build` в этом отдельном
репозитории не отработает: `tauri.conf.json` перечисляет в `bundle.resources` Python
sidecar (`../../sidecar`, `../../sidecar_main.py`, `../../requirements.txt`), которые
живут в основном монорепозитории InstraDoc. Для публичной hosted-публикации Rust, Tauri
и Python не нужны.

Запуск desktop-оболочки в разработке:

```powershell
npm run tauri:dev
```

## Статус

Активная beta. Hosted-сборка пригодна для публикации: работают редактор, аннотации,
экспорт, темы и локализация. Desktop-оболочка и backend-сценарии продолжают развиваться.

## Лицензия

Лицензия пока не выбрана. Без неё действуют права по умолчанию — использование,
изменение и распространение кода third-party лицами не разрешены. Если репозиторий
задуман как open source, добавьте файл `LICENSE` (например MIT).
