/**
 * Creates directory-index copies for static Workbench pages so local previews
 * and non-Firebase hosts can serve /workbench/page without /page.html.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const workbenchDir = path.join(root, 'dist', 'workbench');
const skipFiles = new Set(['index.html', 'nav-component.html']);

if (!fs.existsSync(workbenchDir)) {
  console.warn('  ! dist/workbench not found; skipping extensionless static copies');
  process.exit(0);
}

let count = 0;

function makeExtensionlessHtmlPortable(html) {
  return html
    .replaceAll('src="load-nav.js"', 'src="/workbench/load-nav.js"')
    .replaceAll("src='load-nav.js'", "src='/workbench/load-nav.js'")
    .replaceAll('href="nl-brand.css"', 'href="/workbench/nl-brand.css"')
    .replaceAll("href='nl-brand.css'", "href='/workbench/nl-brand.css'")
    .replaceAll('src="public/', 'src="/workbench/public/')
    .replaceAll("src='public/", "src='/workbench/public/")
    .replaceAll('href="public/', 'href="/workbench/public/')
    .replaceAll("href='public/", "href='/workbench/public/");
}

for (const dirent of fs.readdirSync(workbenchDir, { withFileTypes: true })) {
  if (!dirent.isFile() || !dirent.name.endsWith('.html') || skipFiles.has(dirent.name)) continue;

  const baseName = dirent.name.replace(/\.html$/, '');
  const source = path.join(workbenchDir, dirent.name);
  const targetDir = path.join(workbenchDir, baseName);
  const target = path.join(targetDir, 'index.html');

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(target, makeExtensionlessHtmlPortable(fs.readFileSync(source, 'utf-8')));
  count += 1;
}

console.log(`  ✓ Generated ${count} extensionless Workbench page copies`);
