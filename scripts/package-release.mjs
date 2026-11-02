import { ZipArchive } from 'archiver';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const pluginDir = path.join(root, 'plugin');
const packagingDir = path.join(root, 'packaging');
const releaseDir = path.join(root, 'release');
const manifest = JSON.parse(await readFile(path.join(pluginDir, 'manifest.json'), 'utf8'));
const version = manifest.version;

const webIndex = await stat(path.join(pluginDir, 'web', 'index.html')).catch(() => null);
if (!webIndex || webIndex.size < 1000) {
  console.error('[release] plugin/web/index.html is missing. Run `npm run plugin:build` first.');
  process.exit(1);
}

await mkdir(releaseDir, { recursive: true });

const ccxName = `Lumiform-Colorpicker-${version}.ccx`;
const zipName = `Lumiform-Colorpicker-${version}.zip`;
const ccxPath = path.join(releaseDir, ccxName);
const zipPath = path.join(releaseDir, zipName);

const ccx = await stat(ccxPath).catch(() => null);
if (!ccx) {
  console.error(`[release] ${ccxName} is missing. Run \`npm run plugin\` first.`);
  process.exit(1);
}

const folder = `Lumiform-Colorpicker-${version}`;

await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  output.on('close', resolve);
  output.on('error', reject);
  archive.on('error', reject);
  archive.on('warning', (error) => {
    if (error.code !== 'ENOENT') reject(error);
  });

  archive.pipe(output);
  archive.append(createReadStream(path.join(packagingDir, 'README.txt')), { name: `${folder}/README.txt` });
  archive.append(createReadStream(path.join(packagingDir, 'windows', 'Install Windows.cmd')), {
    name: `${folder}/Install Windows.cmd`,
  });
  archive.append(createReadStream(path.join(packagingDir, 'windows', 'Install-Lumiform.ps1')), {
    name: `${folder}/Install-Lumiform.ps1`,
  });
  archive.append(createReadStream(path.join(packagingDir, 'macos', 'Install macOS.command')), {
    name: `${folder}/Install macOS.command`,
    mode: 0o755,
  });
  archive.directory(pluginDir, `${folder}/Lumiform Colorpicker`);
  archive.finalize();
});

// Stable aliases so the README can always point at the latest download.
await copyFile(ccxPath, path.join(releaseDir, 'Lumiform-Colorpicker.ccx'));
await copyFile(zipPath, path.join(releaseDir, 'Lumiform-Colorpicker.zip'));

const hash = async (file) => {
  const h = createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(file)
      .on('data', (chunk) => h.update(chunk))
      .on('end', resolve)
      .on('error', reject);
  });
  return h.digest('hex');
};

const sums = [
  `${await hash(ccxPath)}  ${ccxName}`,
  `${await hash(zipPath)}  ${zipName}`,
  `${await hash(path.join(releaseDir, 'Lumiform-Colorpicker.ccx'))}  Lumiform-Colorpicker.ccx`,
  `${await hash(path.join(releaseDir, 'Lumiform-Colorpicker.zip'))}  Lumiform-Colorpicker.zip`,
];
await writeFile(path.join(releaseDir, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);

console.log(`[release] Packaged release/${zipName}`);
console.log('[release] Stable aliases: release/Lumiform-Colorpicker.ccx and release/Lumiform-Colorpicker.zip');
console.log('[release] Wrote release/SHA256SUMS.txt');
