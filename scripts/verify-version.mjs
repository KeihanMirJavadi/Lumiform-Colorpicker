import { readFileSync } from 'node:fs';

const tag = (process.argv[2] || '').replace(/^v/, '');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('plugin/manifest.json', 'utf8'));

if (!tag) {
  console.error('[release] Pass the tag, for example: node scripts/verify-version.mjs v1.3.2');
  process.exit(1);
}

if (pkg.version !== manifest.version || pkg.version !== tag) {
  console.error(
    `[release] Version mismatch: tag=${tag}, package.json=${pkg.version}, manifest.json=${manifest.version}`,
  );
  process.exit(1);
}

console.log(`[release] Version ${tag} matches package.json and plugin/manifest.json`);
