import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['apps', 'services', 'packages'];
const workspaces = roots.flatMap((root) =>
  readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name, 'package.json'))
    .filter(existsSync),
);

for (const file of ['package.json', ...workspaces]) {
  JSON.parse(readFileSync(file, 'utf8'));
}

const lock = readFileSync('pnpm-lock.yaml', 'utf8');
if (!lock.includes('lockfileVersion:')) {
  throw new Error('pnpm-lock.yaml is missing a lockfile version');
}

console.log(`Workspace manifests valid (${workspaces.length} workspaces).`);
