// Run the TypeScript tests under test/ with the built-in node:test runner.
//
// CI is on Node 20, which cannot execute TypeScript directly, and this repo has no test framework
// — so bundle each test file with esbuild first, then hand the output to `node --test`.
//
// Output format is CJS on purpose: `yaml` ships CommonJS, and an ESM bundle of it emits a
// "Dynamic require of \"process\" is not supported" shim that throws at import time.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testDir = join(root, 'test');
const outDir = join(root, '.test-build');

let entries = [];
try {
  entries = readdirSync(testDir).filter((f) => f.endsWith('.test.ts'));
} catch {
  console.log('no test/ directory — nothing to run');
  process.exit(0);
}
if (!entries.length) {
  console.log('no *.test.ts files — nothing to run');
  process.exit(0);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: entries.map((f) => join(testDir, f)),
  outdir: outDir,
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: 'inline',
  logLevel: 'error',
});

const built = readdirSync(outDir).filter((f) => f.endsWith('.cjs')).map((f) => join(outDir, f));
const res = spawnSync(process.execPath, ['--test', ...built], { stdio: 'inherit', cwd: root });
process.exit(res.status ?? 1);
