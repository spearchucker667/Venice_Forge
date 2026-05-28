import { test } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

test('packaged electron app launches successfully', async () => {
  const root = path.join(__dirname, '..', '..');
  const releaseDir = path.join(root, 'release');
  
  let exePath: string | undefined;
  
  if (os.platform() === 'win32') {
    if (!fs.existsSync(releaseDir)) throw new Error('release/ directory not found');
    const files = fs.readdirSync(releaseDir);
    const portable = files.find(f => f.endsWith('-Portable.exe'));
    if (portable) exePath = path.join(releaseDir, portable);
  } else if (os.platform() === 'darwin') {
    const archs = os.arch() === 'arm64' ? ['mac-arm64', 'mac'] : ['mac', 'mac-arm64'];
    for (const archDirName of archs) {
      const archDir = path.join(releaseDir, archDirName);
      if (fs.existsSync(archDir)) {
        const files = fs.readdirSync(archDir);
        const app = files.find(f => f.endsWith('.app'));
        if (app) {
          exePath = path.join(archDir, app, 'Contents', 'MacOS', 'Venice Forge');
          break;
        }
      }
    }
  }

  if (!exePath || !fs.existsSync(exePath)) {
    throw new Error('Packaged app not found. Did you run `npm run dist`?');
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn(exePath!, [], {
      stdio: 'pipe',
      env: { ...process.env, VENICE_FORGE_SMOKE_TEST: 'true' }
    });

    let stdout = '';
    let hasExited = false;
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('exit', (code) => {
      hasExited = true;
      if (code !== 0 && code !== null) {
        reject(new Error(`App exited with code ${code}. Output: ${stdout}`));
      } else {
        resolve();
      }
    });

    // If it survives for 5 seconds without crashing, consider it a successful boot
    setTimeout(() => {
      if (!hasExited) {
        child.kill('SIGTERM');
        resolve();
      }
    }, 5000);
  });
}, 10000);
