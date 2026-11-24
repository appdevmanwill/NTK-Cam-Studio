# NTK Cam Studio

Browser, Windows Desktop, and Android studio for video presentations, screen recording, webcam compositing, teleprompter reading, and rule-based timeline editing.

## Folder Map (So Nothing Gets Confused)

| Folder | What is inside |
| :--- | :--- |
| `DEPLOY_MANUAL/` | **Ready-to-use final apps**: Windows Installer (`.exe`), Windows Portable (`.exe`), and Android APK (`.apk`). |
| `src/` | Core React + TypeScript application source code (UI, compositor, audio/video tools, unit tests). |
| `public/` | Static web icons (`favicon.ico`, `icon-192.png`, `icon-512.png`) served at runtime. |
| `desktop/` | Windows Electron shell (`main.cjs`, `preload.cjs`) and `electron-builder.json` packaging config. |
| `android/` | Native Android Capacitor + Gradle project (permissions, WebView camera/mic grant, Downloads bridge). |
| `build-assets/` | Master app icons (`icon.svg`, `icon.png`, `icon.ico`). |
| `scripts/` | Build automation (`generate-icons.mjs`, `build-windows.mjs`, `build-android.mjs`). |
| `FILES/` | Raw reference assets or external client inputs. |
| `WORKING/` | Temporary build/signing caches (such as the local Android release keystore). |
| `ARCHIVE/` | Archived legacy template files kept for reference. |

## Quick Commands

| Task | Command |
| :--- | :--- |
| Start local dev server | `npm run dev` |
| Type-check source code | `npm run lint` |
| Run unit tests | `npm test` |
| Build web bundle (`dist/`) | `npm run build` |
| Build Windows Installer + Portable | `npm run build:win` |
| Build Android APK | `npm run build:android` |
| Build Windows + Android together | `npm run build:all` |

## Where to Find Your Packaged Apps

After building, grab your files directly from `DEPLOY_MANUAL/`:

- **Windows Installer**: `DEPLOY_MANUAL/Windows-Installer/NTK-Cam-Studio-Setup-1.0.0.exe`
- **Windows Portable**: `DEPLOY_MANUAL/Windows-Portable/NTK-Cam-Studio-Portable-1.0.0.exe`
- **Android APK**: `DEPLOY_MANUAL/Android-APK/NTK-Cam-Studio-1.0.0.apk`
