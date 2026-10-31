import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const webDir = path.join(root, 'plugin', 'web');
const htmlPath = path.join(webDir, 'index.html');

let html = await readFile(htmlPath, 'utf8');

function assetPath(reference) {
  const clean = reference.replace(/^\.\//, '').replace(/^\//, '');
  return path.join(webDir, clean);
}

async function inlineStylesheets(source) {
  const tags = source.match(/<link\b[^>]*>/gi) ?? [];

  for (const tag of tags) {
    if (!/rel=["']stylesheet["']/i.test(tag)) {
      source = source.replace(tag, '');
      continue;
    }

    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) {
      source = source.replace(tag, '');
      continue;
    }

    const css = await readFile(assetPath(href), 'utf8');
    assertNoExternalAssets(css, href);
    source = source.replace(tag, () => `<style>\n${css}\n</style>`);
  }

  return source;
}

async function inlineScripts(source) {
  const tags = source.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? [];

  for (const tag of tags) {
    const src = tag.match(/src=["']([^"']+)["']/i)?.[1];
    if (!src) continue;

    const js = await readFile(assetPath(src), 'utf8');
    const safe = js
      .replace(/<\/script/gi, () => '<\\/script')
      .replace(/^[ \t]*\/\/[#@]\s*sourceMappingURL=.*$/gm, '');

    const isModule = /type=["']module["']/i.test(tag);
    const replacement = `<script${isModule ? ' type="module"' : ''}>\n${safe}\n</script>`;
    source = source.replace(tag, () => replacement);
  }

  return source;
}

function assertNoExternalAssets(css, name) {
  if (/url\(\s*["']?\.?\/(?:assets|\.\/)/i.test(css)) {
    throw new Error(`Stylesheet ${name} still references a separate asset; raise assetsInlineLimit.`);
  }
}

html = await inlineStylesheets(html);
html = await inlineScripts(html);

// Any remaining local asset reference would fail under the plugin:/ origin.
if (/(?:src|href)=["']\.?\/?(?:assets|src)\//i.test(html)) {
  throw new Error('The inlined plugin page still references external local files.');
}

await writeFile(htmlPath, html, 'utf8');
await rm(path.join(webDir, 'assets'), { recursive: true, force: true });

console.log(`[plugin] Inlined ${(html.length / 1024).toFixed(0)} KB into plugin/web/index.html`);
