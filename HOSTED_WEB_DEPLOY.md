# InstraDoc Beta v.2: Публикация Hosted Web

Русскоязычная основная инструкция по публичному деплою web-версии InstraDoc без авторизации.

Английская версия сохранена отдельно: [HOSTED_WEB_DEPLOY_ENG.md](./HOSTED_WEB_DEPLOY_ENG.md)

## Когда подходит этот вариант

Этот сценарий нужен для первой публичной web-публикации, когда:

- приложение раздаётся как статический сайт;
- Python sidecar на проде не используется;
- данные проекта живут в браузере пользователя;
- сервер нужен только для отдачи файлов сайта.

Если в будущем появятся аккаунты, серверное хранение проектов, очередь фоновых задач, база данных или API-лимиты, тогда уже стоит переходить к отдельному backend/VPS-сценарию.

## Базовый принцип

Для публичного домена используйте только hosted-browser сборку.

Это значит:

- без Python sidecar на проде;
- без серверного списка проектов;
- черновики сохраняются локально в браузере;
- переносимость обеспечивается через экспорт и импорт `.idoc.zip`;
- HTML / PDF / DOCX / ZIP экспорт выполняется на стороне клиента.

## Сборка

Из папки `web/`:

```powershell
npm ci
npm run build:hosted
```

Публиковать нужно только содержимое:

```text
web/dist/
```

Загружайте именно файлы из `dist`, а не папку `dist` целиком внутрь другой папки.

Не публикуйте:

```text
sidecar/
Projects/
Export/
config/
src/
node_modules/
.env*
```

## Куда можно публиковать

Подходящие варианты:

- ISPManager / Apache
- Cloudflare Pages
- Netlify
- любой статический хостинг, который умеет отдавать SPA на базе Vite

## Настройки для статического хостинга

Если хостинг сам выполняет сборку:

```text
Root directory: web
Build command: npm ci && npm run build:hosted
Publish directory: web/dist
```

Если сборка запускается уже из папки `web/`:

```text
Build command: npm ci && npm run build:hosted
Publish directory: dist
```

## Деплой через ISPManager / Apache

Рекомендуемый порядок:

1. Создайте поддомен, например `instradoc.example.com`.
2. Привяжите DNS `A`/`AAAA` запись к вашему серверу.
3. Выпустите Let's Encrypt сертификат в ISPManager.
4. Соберите hosted-версию локально:

```powershell
cd C:\Users\Lj29\OneDrive\Документы\Dev\Instrasko\web
npm ci
npm run build:hosted
```

5. Откройте document root поддомена в ISPManager.
6. Загрузите туда всё содержимое из:

```text
C:\Users\Lj29\OneDrive\Документы\Dev\Instrasko\web\dist\
```

Обязательные элементы:

```text
index.html
assets/
_headers
.htaccess
robots.txt
site.webmanifest
favicon.ico
favicon.svg
favicon-16x16.png
favicon-32x32.png
apple-touch-icon.png
android-chrome-192x192.png
android-chrome-512x512.png
```

Файл `_headers` можно оставлять в пакете, но на ISPManager/Apache обычно применяться будет именно `.htaccess`.

## Важные ограничения

Не публикуйте сайт в подпапку вроде:

```text
/instradoc/
```

Текущая сборка рассчитана на размещение в корне домена или поддомена. Для подпапки пришлось бы отдельно менять `base` в Vite и пересобирать проект.

## Заголовки и безопасность

В проекте уже есть:

```text
web/public/_headers
web/public/.htaccess
web/public/robots.txt
```

Во время сборки они попадают в `web/dist`.

Ожидаемые защитные заголовки:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy: same-origin`
- `X-Frame-Options: DENY`

Если `.htaccess` игнорируется, попросите хостинг включить `AllowOverride` и поддержку rewrite/headers для document root сайта.

## Минимальная проверка после публикации

После загрузки на хостинг проверьте:

1. Сайт открывается по HTTPS.
2. Неизвестные маршруты не отдают `404`, а возвращают SPA shell.
3. `index.html` обновляется, а `/assets/*` кэшируются надолго.
4. Создание проекта работает без логина.
5. Импорт изображений и вставка через `Ctrl+V` работают.
6. Экспорт в HTML / PDF / DOCX / ZIP работает.
7. Экспортированный `.idoc.zip` можно импортировать обратно.
8. На сервер не попадают локальные папки `Projects/`, `Export/`, `config/`.

## Ограничители для публичного beta-запуска

- максимальный размер изображения: 15 MB;
- максимальное измерение изображения: 12000 px по стороне;
- максимум шагов в проекте: 100;
- максимум размера `.idoc.zip`: 250 MB.

## Что делать дальше

Перед большим публичным запуском желательно отдельно проверить:

- визуальное качество PDF на больших скриншотах;
- открытие DOCX в Microsoft Word, LibreOffice и Google Docs;
- поведение тяжёлых импортов и экспортов;
- lazy loading и производительность на больших проектах.

## Ссылки

- ISPManager domain setup: [ispmanager.com/docs/ispmanager/add-a-www-domain](https://www.ispmanager.com/docs/ispmanager/add-a-www-domain)
- ISPManager Let's Encrypt: [ispmanager.com/docs/ispmanager/let-s-encrypt-certificates](https://www.ispmanager.com/docs/ispmanager/let-s-encrypt-certificates)
- ISPManager Apache docs: [ispmanager.com/docs/ispmanager/apache-in-ispmanager](https://www.ispmanager.com/docs/ispmanager/apache-in-ispmanager)
- Apache `.htaccess` guide: [httpd.apache.org/docs/2.4/howto/htaccess.html](https://httpd.apache.org/docs/2.4/howto/htaccess.html)
