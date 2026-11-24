import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version || '1.0.0';

function runNodeScript(scriptRelPath, args = [], extraEnv = {}) {
  const fullPath = path.join(ROOT, scriptRelPath);
  const res = spawnSync(process.execPath, [fullPath, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): node ${scriptRelPath} ${args.join(' ')}`);
  }
}

function copyArtifact(srcName, destDir) {
  const srcPath = path.join(ROOT, 'release', 'windows', srcName);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Expected build artifact missing: ${srcPath}`);
  }
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, srcName);
  fs.copyFileSync(srcPath, destPath);
  const sizeMb = (fs.statSync(destPath).size / (1024 * 1024)).toFixed(2);
  console.log(`-> ${path.relative(ROOT, destPath)} (${sizeMb} MB)`);
}

function main() {
  console.log('1/4 Generating NTK Cam Studio app icons...');
  runNodeScript('scripts/generate-icons.mjs');

  console.log('2/4 Building Vite web bundle...');
  runNodeScript('node_modules/vite/bin/vite.js', ['build']);

  console.log('3/4 Packaging Windows Installer & Portable App via electron-builder...');
  runNodeScript(
    'node_modules/electron-builder/cli.js',
    ['--config', 'desktop/electron-builder.json', '--win'],
    { CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
  );

  console.log('4/4 Copying deliverables into DEPLOY_MANUAL/...');
  copyArtifact(
    `NTK-Cam-Studio-Setup-${VERSION}.exe`,
    path.join(ROOT, 'DEPLOY_MANUAL', 'Windows-Installer')
  );
  copyArtifact(
    `NTK-Cam-Studio-Portable-${VERSION}.exe`,
    path.join(ROOT, 'DEPLOY_MANUAL', 'Windows-Portable')
  );

  console.log('Windows build complete.');
}

main();
