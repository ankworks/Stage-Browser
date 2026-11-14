import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

/**
 * Launch Electron against the Vite dev server.
 *
 * `npm run dev` starts Vite first; this script just points the app at it. The
 * main process otherwise loads the production renderer from `dist/`.
 */
const require = createRequire(import.meta.url);
const electron = require('electron');

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, STAGE_DEV_SERVER: 'http://localhost:5173' },
});

child.on('exit', (code) => process.exit(code ?? 0));
