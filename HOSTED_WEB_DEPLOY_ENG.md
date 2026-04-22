# InstraDoc Beta v.2 Hosted Web Deploy

This runbook is for the first public no-auth hosted web release.

## Deployment Decision

The first public release does not require a separate VPS if ISPManager can serve a static website on a subdomain and applies Apache `.htaccess` rules.

Use a VPS later only when the product needs server-side features such as authentication, database-backed project storage, user workspaces, backend export queues, or API rate limiting.

This release is intended for a subdomain root, for example:

```text
https://instradoc.example.com/
```

Do not publish this build into a subfolder such as `/instradoc/` without changing the Vite `base` setting and rebuilding.

## Runtime

Use only the `hosted-browser` build for a public domain.

- No Python sidecar on the public domain.
- No `/api/projects` server listing for guests.
- Project drafts live in browser IndexedDB.
- Durable editing is provided by downloading and importing `.idoc.zip`.
- Export is browser-first: HTML, images ZIP, PDF, and DOCX download from the browser.
- Server fallback remains a future option only for unusually heavy exports.

## Build

From `web/`:

```powershell
npm ci
npm run build:hosted
```

Publish only:

```text
web/dist/
```

Upload the contents of `web/dist/`, not the `dist` folder itself.

Do not publish:

```text
sidecar/
Projects/
Export/
config/
src/
node_modules/
.env*
```

## Static Hosting

Recommended first targets:

- Cloudflare Pages
- Netlify
- Any static hosting/CDN that can serve `web/dist`

Build settings:

```text
Root directory: web
Build command: npm ci && npm run build:hosted
Publish directory: web/dist
```

If the hosting provider runs the build from inside `web/`, use:

```text
Build command: npm ci && npm run build:hosted
Publish directory: dist
```

## ISPManager / Apache

Recommended path for ISPManager:

1. Create a subdomain, for example `instradoc.example.com`.
2. Point the DNS `A`/`AAAA` record for the subdomain to the hosting server.
3. In ISPManager, open the site or subdomain and issue a free Let's Encrypt SSL certificate.
4. Build the hosted release locally:

```powershell
cd C:\Users\Lj29\OneDrive\Документы\Dev\Instrasko\web
npm ci
npm run build:hosted
```

5. In ISPManager File Manager, open the document root for the subdomain.
6. Upload every item from:

```text
C:\Users\Lj29\OneDrive\Документы\Dev\Instrasko\web\dist\
```

Required uploaded items:

```text
index.html
assets/
_headers
.htaccess
robots.txt
```

`_headers` can stay in the folder, but ISPManager/Apache usually ignores it. Apache should apply `.htaccess` instead.

Do not upload repository sources, local runtime data, or development dependencies:

```text
sidecar/
Projects/
Export/
config/
src/
node_modules/
.env*
```

After upload:

1. Open the HTTPS subdomain.
2. Refresh the page from inside the editor and confirm there is no `404`.
3. Check DevTools Network headers for `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and `X-Frame-Options`.
4. Confirm `/assets/*` responses are cached long-term and `index.html` is not cached permanently.

If `.htaccess` is ignored, ask the hosting provider to enable Apache `AllowOverride`/rewrite/headers for the subdomain document root, or move the same rewrite and header rules into the site configuration.

Use a separate VPS instead of shared ISPManager hosting only when one of these becomes required:

- persistent user accounts and sessions;
- PostgreSQL or another server database;
- server-side project storage;
- backend export workers for heavy PDF/DOCX jobs;
- server API rate limits and job queues;
- logs/monitoring for backend services.

## Security Headers

The repository includes:

```text
web/public/_headers
web/public/.htaccess
web/public/robots.txt
```

Vite copies this file into `web/dist/_headers`. Cloudflare Pages and Netlify can apply it automatically.

Vite also copies `.htaccess` into `web/dist/.htaccess`. ISPManager/Apache can use it for SPA fallback, directory listing protection, security headers, and cache policy.

Vite also copies `robots.txt` into `web/dist/robots.txt`. Update the sitemap URL inside the file to the real production domain before publishing if the final domain is not `instradoc.example.com`.

If the provider does not support `_headers`, configure equivalent headers manually:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy: same-origin`
- `X-Frame-Options: DENY`

## Required Smoke Test

Run this from a clean browser profile on the production domain:

1. Open the home page.
2. Create a project without login.
3. Import an image and paste an image with `Ctrl+V`.
4. Add annotations: rectangle, arrow, text, blur, pencil.
5. Use `Ctrl+Z` and `Ctrl+Y`.
6. Reload the page and confirm the draft remains in IndexedDB.
7. Export HTML, images ZIP, PDF, and DOCX.
8. Download `.idoc.zip`.
9. Clear browser storage.
10. Import `.idoc.zip` and confirm the project opens with images and annotations.

Also check:

1. The site opens only through HTTPS.
2. Unknown routes return the app shell instead of a directory listing or `404`.
3. No project files, images, `Projects/`, `Export/`, or `config/` data are uploaded to the server.

## Public Launch Guardrails

- Keep max image size at 15 MB.
- Keep max image dimension at 12000 px per side.
- Keep max steps per project at 100.
- Keep max `.idoc.zip` import size at 250 MB.
- Do not add server project storage until auth/workspace isolation exists.
- Do not log project JSON or image content in future server fallback endpoints.
- Add rate limits before enabling any server export fallback.

## Known Follow-Up

The current browser PDF/DOCX export is suitable for MVP testing. Before a larger public launch, add:

- visual PDF QA across large screenshots;
- DOCX open checks in Microsoft Word, LibreOffice, and Google Docs;
- lazy loading smoke checks for PDF, DOCX, and ZIP paths;
- optional server fallback queue for heavy DOCX/PDF only after rate limits and TTL cleanup exist.

## References

- ISPManager website setup: https://www.ispmanager.com/docs/ispmanager/add-a-www-domain
- ISPManager Let's Encrypt certificates: https://www.ispmanager.com/docs/ispmanager/let-s-encrypt-certificates
- ISPManager Apache notes: https://www.ispmanager.com/docs/ispmanager/apache-in-ispmanager
- Apache `.htaccess` guide: https://httpd.apache.org/docs/2.4/howto/htaccess.html
