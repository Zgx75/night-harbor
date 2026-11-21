// Syntax-checks every JavaScript file in the project, so new files never need to be listed by hand.
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FOLDERS = ['src', 'public', 'scripts', 'test'];

function* javascriptFiles(directory) {
  for (const name of readdirSync(directory)) {
    const file = path.join(directory, name);
    if (statSync(file).isDirectory()) yield* javascriptFiles(file);
    else if (/\.(m?js)$/.test(name)) yield file;
  }
}

let failed = 0, total = 0;
for (const folder of FOLDERS) {
  for (const file of javascriptFiles(path.join(ROOT, folder))) {
    total++;
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) { failed++; console.error(`✗ ${path.relative(ROOT, file)}\n${result.stderr}`); }
  }
}
console.log(failed ? `${failed} of ${total} files have syntax errors.` : `All ${total} files passed the syntax check.`);
process.exit(failed ? 1 : 0);
