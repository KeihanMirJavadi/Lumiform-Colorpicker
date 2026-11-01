import { ZipArchive } from 'archiver';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Packages the temporary Stage 4 theme probe as a standalone `.ccx`.
 *
 * The probe is a diagnostic plugin, not a product build: it shares no files
 * with `plugin/` and its output is named separately so it can never be
 * mistaken for a Lumiform release.
 */

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const probeDir = path.join(root, 'tools', 'theme-probe');
const manifest = JSON.parse(await readFile(path.join(probeDir, 'manifest.json'), 'utf8'));

const releaseDir = path.join(root, 'release');
await mkdir(releaseDir, { recursive: true });

const outPath = path.join(releaseDir, `Lumiform-ThemeProbe-${manifest.version}.ccx`);

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
    cwd: probeDir,
    dot: false,
    ignore: ['**/.DS_Store', '**/Thumbs.db'],
  });
  archive.finalize();
});

console.log(`[probe] Packaged ${path.relative(root, outPath)}`);
console.log('[probe] Load it with UXP Developer Tool, or install the .ccx.');
