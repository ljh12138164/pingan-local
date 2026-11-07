import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('..', import.meta.url));
const api = spawn('cargo', ['run', '--manifest-path', 'src-tauri/Cargo.toml', '--bin', 'pingan-service'], { cwd, stdio: 'inherit' });
const ui = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { cwd, stdio: 'inherit' });
let closing = false;
function close(code = 0) { if (closing) return; closing = true; api.kill(); ui.kill(); process.exitCode = code; }
api.on('exit', code => close(code ?? 1));
ui.on('exit', code => close(code ?? 1));
process.on('SIGINT', () => close());
process.on('SIGTERM', () => close());
