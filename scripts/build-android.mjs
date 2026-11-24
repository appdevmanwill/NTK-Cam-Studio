import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ANDROID_DIR = path.join(ROOT, 'android');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version || '1.0.0';

function findValidJavaHome() {
  const candidates = [];
  if (process.env.JAVA_HOME) candidates.push(process.env.JAVA_HOME);

  const msJdkDir = 'C:\\Program Files\\Microsoft';
  if (fs.existsSync(msJdkDir)) {
    const jdks = fs
      .readdirSync(msJdkDir)
      .filter((name) => name.toLowerCase().startsWith('jdk-21'))
      .sort()
      .reverse();
    for (const j of jdks) {
      candidates.push(path.join(msJdkDir, j));
    }
  }

  candidates.push('C:\\Program Files\\Android\\Android Studio\\jbr');

  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'bin', 'java.exe'))) {
      return dir;
    }
  }
  throw new Error('Could not locate a valid JDK 21 installation.');
}

function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'platforms'))) {
      return dir;
    }
  }
  throw new Error('Could not locate Android SDK.');
}

function findLatestBuildTools(sdkDir) {
  const btDir = path.join(sdkDir, 'build-tools');
  const versions = fs.readdirSync(btDir).sort();
  if (versions.length === 0) {
    throw new Error(`No Android build-tools found under ${btDir}`);
  }
  return path.join(btDir, versions[versions.length - 1]);
}

function runNode(scriptRelPath, args = [], extraEnv = {}) {
  const res = spawnSync(process.execPath, [path.join(ROOT, scriptRelPath), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Node command failed (${res.status}): ${scriptRelPath} ${args.join(' ')}`);
  }
}

function runExe(exePath, args, cwd, extraEnv) {
  const res = spawnSync(exePath, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${exePath} ${args.join(' ')}`);
  }
}

function runBatch(batPath, args, cwd, extraEnv) {
  const res = spawnSync('cmd.exe', ['/c', batPath, ...args], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Batch command failed (${res.status}): ${batPath} ${args.join(' ')}`);
  }
}

function ensureReleaseKeystore(javaHome) {
  const signingDir = path.join(ROOT, 'WORKING', 'android-signing');
  fs.mkdirSync(signingDir, { recursive: true });
  const keystorePath = path.join(signingDir, 'ntk-cam-studio-release.jks');
  const keyAlias = 'ntkcamstudio';
  const storePass = 'ntk-cam-studio-local-2026';

  if (!fs.existsSync(keystorePath)) {
    const keytoolExe = path.join(javaHome, 'bin', 'keytool.exe');
    runExe(
      keytoolExe,
      [
        '-genkeypair',
        '-v',
        '-keystore',
        keystorePath,
        '-alias',
        keyAlias,
        '-keyalg',
        'RSA',
        '-keysize',
        '2048',
        '-validity',
        '10000',
        '-storepass',
        storePass,
        '-keypass',
        storePass,
        '-dname',
        'CN=NTK Cam Studio, O=NTK, L=Studio, C=US',
      ],
      ROOT,
      { JAVA_HOME: javaHome }
    );
  }

  return { keystorePath, keyAlias, storePass };
}

function findBuiltApk() {
  const releaseDir = path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release');
  const candidates = [
    path.join(releaseDir, 'app-release-unsigned.apk'),
    path.join(releaseDir, 'app-release.apk'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(`No release APK found in ${releaseDir}`);
  }
  return found;
}

function main() {
  if (!fs.existsSync(ANDROID_DIR)) {
    throw new Error('android/ folder not found. Initialize Capacitor Android first.');
  }

  const javaHome = findValidJavaHome();
  const sdkDir = findAndroidSdk();
  const buildToolsDir = findLatestBuildTools(sdkDir);
  const childEnv = {
    JAVA_HOME: javaHome,
    ANDROID_HOME: sdkDir,
    ANDROID_SDK_ROOT: sdkDir,
  };

  console.log(`Using JAVA_HOME=${javaHome}`);
  console.log(`Using ANDROID_HOME=${sdkDir}`);
  console.log(`Using build-tools=${buildToolsDir}`);

  const escapedSdk = sdkDir.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
  fs.writeFileSync(path.join(ANDROID_DIR, 'local.properties'), `sdk.dir=${escapedSdk}\n`, 'utf8');

  console.log('1/5 Refreshing app icons (including Android mipmaps)...');
  runNode('scripts/generate-icons.mjs', [], childEnv);

  console.log('2/5 Building Vite web bundle...');
  runNode('node_modules/vite/bin/vite.js', ['build'], childEnv);

  console.log('3/5 Syncing web assets into Capacitor Android...');
  runNode('node_modules/@capacitor/cli/bin/capacitor', ['sync', 'android'], childEnv);

  console.log('4/5 Building Android release APK with Gradle...');
  runBatch(path.join(ANDROID_DIR, 'gradlew.bat'), ['assembleRelease'], ANDROID_DIR, childEnv);

  console.log('5/5 Aligning & signing APK into DEPLOY_MANUAL/Android-APK/...');
  const { keystorePath, keyAlias, storePass } = ensureReleaseKeystore(javaHome);
  const builtApk = findBuiltApk();

  const stagingDir = path.join(ROOT, 'WORKING', 'android-signing');
  fs.mkdirSync(stagingDir, { recursive: true });
  const alignedApk = path.join(stagingDir, `NTK-Cam-Studio-${VERSION}-aligned.apk`);

  const zipalignExe = path.join(buildToolsDir, 'zipalign.exe');
  runExe(zipalignExe, ['-f', '-p', '4', builtApk, alignedApk], ROOT, childEnv);

  const outDir = path.join(ROOT, 'DEPLOY_MANUAL', 'Android-APK');
  fs.mkdirSync(outDir, { recursive: true });
  const finalApk = path.join(outDir, `NTK-Cam-Studio-${VERSION}.apk`);

  const apksignerBat = path.join(buildToolsDir, 'apksigner.bat');
  runBatch(
    apksignerBat,
    [
      'sign',
      '--ks',
      keystorePath,
      '--ks-key-alias',
      keyAlias,
      '--ks-pass',
      `pass:${storePass}`,
      '--key-pass',
      `pass:${storePass}`,
      '--out',
      finalApk,
      alignedApk,
    ],
    ROOT,
    childEnv
  );

  const idsigPath = `${finalApk}.idsig`;
  if (fs.existsSync(idsigPath)) {
    fs.rmSync(idsigPath, { force: true });
  }

  runBatch(apksignerBat, ['verify', '--verbose', finalApk], ROOT, childEnv);

  const sizeMb = (fs.statSync(finalApk).size / (1024 * 1024)).toFixed(2);
  console.log(`-> ${path.relative(ROOT, finalApk)} (${sizeMb} MB)`);
  console.log('Android APK build complete.');
}

main();
