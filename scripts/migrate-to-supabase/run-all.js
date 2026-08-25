import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const steps = ['01-reference-data.js', '02-programs.js', '03-students.js', '04-files.js'];

for (const step of steps) {
  console.log(`\n=== ${step} ===`);
  execFileSync('node', [join(__dirname, step)], { stdio: 'inherit' });
}
