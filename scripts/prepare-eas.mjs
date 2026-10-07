// EAS installs mobile dependencies; the separate web project also needs its lockfile.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.env.npm_execpath) throw new Error('Run this preparation through npm');
execFileSync(process.execPath, [process.env.npm_execpath, 'ci', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [fileURLToPath(new URL('./bundle-mobile.mjs', import.meta.url))], { cwd: root, stdio: 'inherit' });
