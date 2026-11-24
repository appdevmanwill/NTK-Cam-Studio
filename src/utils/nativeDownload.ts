import type { ResolvedTheme, ThemePreference } from '../types/studio';

export interface NTKDesktopBridge {
  isDesktop?: boolean;
  platform?: string;
  setTheme?: (preference: ThemePreference, resolved: ResolvedTheme) => void;
}

export interface NTKAndroidBridge {
  setTheme?: (resolved: ResolvedTheme) => void;
  beginSaveFile?: (filename: string, mimeType: string) => string;
  appendSaveFileChunk?: (transferId: string, base64Chunk: string) => boolean;
  finishSaveFile?: (transferId: string) => string;
  abortSaveFile?: (transferId: string) => void;
}

declare global {
  interface Window {
    ntkDesktop?: NTKDesktopBridge;
    NTKAndroidBridge?: NTKAndroidBridge;
  }
}

export interface ChunkRange {
  start: number;
  end: number;
}

const DEFAULT_CHUNK_BYTES = 384 * 1024;

/**
 * Splits a byte length into contiguous slice ranges for safe WebView bridge transfers.
 */
export function splitIntoChunkRanges(
  totalBytes: number,
  chunkSize: number = DEFAULT_CHUNK_BYTES
): ChunkRange[] {
  if (totalBytes <= 0 || chunkSize <= 0) {
    return [];
  }
  const ranges: ChunkRange[] = [];
  for (let start = 0; start < totalBytes; start += chunkSize) {
    ranges.push({
      start,
      end: Math.min(totalBytes, start + chunkSize),
    });
  }
  return ranges;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function triggerBrowserDownload(url: string, filename: string, revokeAfterMs: number | null): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  if (revokeAfterMs !== null) {
    window.setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
  }
}

/**
 * Saves a Blob to the user's device, streaming through the Android native MediaStore bridge when present
 * and falling back to standard `<a download>` on Web and Electron desktop.
 */
export async function saveBlobToDevice(
  blob: Blob,
  filename: string,
  bridge: NTKAndroidBridge | undefined =
    typeof window !== 'undefined' ? window.NTKAndroidBridge : undefined
): Promise<{ savedPath?: string }> {
  if (
    bridge?.beginSaveFile &&
    bridge?.appendSaveFileChunk &&
    bridge?.finishSaveFile
  ) {
    const transferId = bridge.beginSaveFile(filename, blob.type || 'application/octet-stream');
    if (!transferId) {
      throw new Error('Could not start native Android file save.');
    }

    try {
      const ranges = splitIntoChunkRanges(blob.size);
      for (const range of ranges) {
        const buffer = await blob.slice(range.start, range.end).arrayBuffer();
        const base64 = uint8ArrayToBase64(new Uint8Array(buffer));
        const ok = bridge.appendSaveFileChunk(transferId, base64);
        if (!ok) {
          throw new Error('Failed while writing file chunk to Android Downloads.');
        }
      }
      const savedPath = bridge.finishSaveFile(transferId);
      if (!savedPath) {
        throw new Error('Could not finalize saved file in Android Downloads.');
      }
      return { savedPath };
    } catch (err) {
      try {
        bridge.abortSaveFile?.(transferId);
      } catch {
        // Ignore cleanup failure
      }
      throw err;
    }
  }

  const url = URL.createObjectURL(blob);
  triggerBrowserDownload(url, filename, 4000);
  return {};
}

/**
 * Saves a data URL (such as a PNG stage snapshot) to the user's device across Web, Electron, and Android.
 */
export async function saveDataUrlToDevice(
  dataUrl: string,
  filename: string,
  bridge: NTKAndroidBridge | undefined =
    typeof window !== 'undefined' ? window.NTKAndroidBridge : undefined
): Promise<{ savedPath?: string }> {
  if (bridge?.beginSaveFile && bridge?.appendSaveFileChunk && bridge?.finishSaveFile) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return saveBlobToDevice(blob, filename, bridge);
  }

  triggerBrowserDownload(dataUrl, filename, null);
  return {};
}
