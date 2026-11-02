import { ZipArchive } from 'archiver';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const pluginDir = path.join(root, 'plugin');
const manifestPath = path.join(pluginDir, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const webIndexPath = path.join(pluginDir, 'web', 'index.html');
const webIndex = await stat(webIndexPath).catch(() => null);
if (!webIndex || webIndex.size < 1000) {
  console.error('[plugin] plugin/web/index.html is missing. Run `npm run plugin:build` first.');
  process.exit(1);
}

const releaseDir = path.join(root, 'release');
await mkdir(releaseDir, { recursive: true });

const outPath = path.join(
  releaseDir,
  `Lumiform-Colorpicker-${manifest.version}.ccx`,
);

await new Promise((resolve, reject) => {
  const output = createWriteStream(outPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  output.on('close', resolve);
  output.on('error', reject);
  archive.on('error', reject);
  archive.on('warning', (error) => {
    if (error.code !== 'ENOENT') reject(error);
  });

  archive.pipe(output);
  archive.glob('**/*', {
    cwd: pluginDir,
    dot: false,
    ignore: ['**/.DS_Store', '**/Thumbs.db'],
  });
  archive.finalize();
});

console.log(`[plugin] Packaged ${path.relative(root, outPath)}`);
console.log('[plugin] Install by double-clicking the .ccx, or copy the plugin folder into Photoshop\'s Plug-ins directory.');
