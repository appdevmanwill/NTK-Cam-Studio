import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampTrimRange,
  computeContainRect,
  computeCoverSourceCrop,
  computeSideBySideLayout,
  computeStageViewportFit,
  computeTransitionState,
  computeWebcamBubbleRect,
  estimateExportSizeMb,
  formatTimecode,
  getCanvasDimensions,
  getCornerSnapPosition,
  getRecommendedVideoBitrate,
  hitTestWebcamBubble,
  selectBestVideoMimeType,
} from './compositorMath';
import { computePersonMaskAlpha } from './cameraSegmentation';
import { computeGifDimensions, encodeWavBuffer } from './videoExporter';

test('getCanvasDimensions returns even HD/4K/SD dimensions for all aspect ratios and presets', () => {
  // Default is crisp 1080p Full HD
  assert.deepEqual(getCanvasDimensions('16:9'), { width: 1920, height: 1080 });
  assert.deepEqual(getCanvasDimensions('9:16'), { width: 1080, height: 1920 });
  assert.deepEqual(getCanvasDimensions('1:1'), { width: 1080, height: 1080 });

  // Explicit resolution presets (all even dimensions for H.264/MP4 compatibility)
  assert.deepEqual(getCanvasDimensions('16:9', '2160p'), { width: 3840, height: 2160 });
  assert.deepEqual(getCanvasDimensions('16:9', '1440p'), { width: 2560, height: 1440 });
  assert.deepEqual(getCanvasDimensions('16:9', '720p'), { width: 1280, height: 720 });
  assert.deepEqual(getCanvasDimensions('16:9', '480p'), { width: 854, height: 480 });
  assert.deepEqual(getCanvasDimensions('16:9', '360p'), { width: 640, height: 360 });
  assert.deepEqual(getCanvasDimensions('9:16', '720p'), { width: 720, height: 1280 });
  assert.deepEqual(getCanvasDimensions('1:1', '720p'), { width: 720, height: 720 });
});

test('computeContainRect fits wide content inside taller bounds centered vertically', () => {
  const rect = computeContainRect(1920, 1080, { x: 40, y: 40, width: 800, height: 800 });
  assert.equal(rect.width, 800);
  assert.equal(Math.round(rect.height), 450);
  assert.equal(rect.x, 40);
  assert.equal(Math.round(rect.y), 215);
});

test('computeCoverSourceCrop crops horizontally when source is wider than target square', () => {
  const crop = computeCoverSourceCrop(1280, 720, 300, 300);
  assert.equal(crop.width, 720);
  assert.equal(crop.height, 720);
  assert.equal(crop.x, 280);
  assert.equal(crop.y, 0);
});

test('computeWebcamBubbleRect clamps extreme normalized positions inside canvas margins', () => {
  const rect = computeWebcamBubbleRect(1280, 720, 0.3, 1.5, -0.5, 'circle', 24);
  assert.ok(rect.x >= 24);
  assert.ok(rect.y >= 24);
  assert.ok(rect.x + rect.width <= 1280 - 24);
  assert.ok(rect.y + rect.height <= 720 - 24);
});

test('getCornerSnapPosition places bubbles accurately in each of the four corners', () => {
  const tl = getCornerSnapPosition('top-left', 1280, 720, 0.28, 'circle', 32);
  const br = getCornerSnapPosition('bottom-right', 1280, 720, 0.28, 'circle', 32);
  assert.ok(tl.x < 0.25 && tl.y < 0.3);
  assert.ok(br.x > 0.75 && br.y > 0.7);
});

test('hitTestWebcamBubble distinguishes circle corners from square corners', () => {
  const rect = { x: 100, y: 100, width: 200, height: 200 };
  // Center is inside both
  assert.equal(hitTestWebcamBubble(200, 200, rect, 'circle'), true);
  assert.equal(hitTestWebcamBubble(200, 200, rect, 'square'), true);
  // Top-left corner (105, 105) is inside square but outside circle
  assert.equal(hitTestWebcamBubble(105, 105, rect, 'circle'), false);
  assert.equal(hitTestWebcamBubble(105, 105, rect, 'square'), true);
});

test('computeSideBySideLayout splits horizontally on 16:9 and vertically on 9:16', () => {
  const landscape = computeSideBySideLayout(1280, 720, 36);
  assert.ok(landscape.cameraBounds.x > landscape.contentBounds.x + landscape.contentBounds.width);
  assert.equal(landscape.contentBounds.y, landscape.cameraBounds.y);

  const portrait = computeSideBySideLayout(720, 1280, 36);
  assert.ok(portrait.cameraBounds.y > portrait.contentBounds.y + portrait.contentBounds.height);
  assert.equal(portrait.contentBounds.x, portrait.cameraBounds.x);
});

test('formatTimecode formats whole seconds and tenths properly', () => {
  assert.equal(formatTimecode(0), '00:00');
  assert.equal(formatTimecode(65), '01:05');
  assert.equal(formatTimecode(12.46, true), '00:12.4');
  assert.equal(formatTimecode(-4), '00:00');
});

test('clampTrimRange enforces bounds and minimum clip duration', () => {
  assert.deepEqual(clampTrimRange(-2, 15, 10, 0.5), { start: 0, end: 10 });
  assert.deepEqual(clampTrimRange(4.8, 4.9, 10, 0.5), { start: 4.8, end: 5.3 });
  assert.deepEqual(clampTrimRange(9.9, 10, 10, 0.5), { start: 9.5, end: 10 });
});

test('selectBestVideoMimeType picks highest-priority supported codec', () => {
  const vp9 = selectBestVideoMimeType((m) => m.includes('vp9'));
  assert.equal(vp9.extension, 'webm');
  assert.ok(vp9.mimeType.includes('vp9'));

  const mp4Only = selectBestVideoMimeType((m) => m === 'video/mp4');
  assert.deepEqual(mp4Only, { mimeType: 'video/mp4', extension: 'mp4' });
});

test('computeTransitionState produces smooth crossfade, fade-through-black, and inactive endpoints', () => {
  // None immediately finishes
  assert.equal(computeTransitionState(100, 360, 'none').active, false);

  // Crossfade halfway is ~0.5 prevAlpha and 0 blackAlpha
  const crossMid = computeTransitionState(180, 360, 'crossfade');
  assert.equal(crossMid.active, true);
  assert.equal(crossMid.prevAlpha, 0.5);
  assert.equal(crossMid.blackAlpha, 0);

  // Fade-through-black first quarter shows prev base dimming toward black
  const blackQ1 = computeTransitionState(90, 360, 'fade-black');
  assert.equal(blackQ1.active, true);
  assert.equal(blackQ1.showPrevBase, true);
  assert.equal(blackQ1.blackAlpha, 0.5);

  // Fade-through-black third quarter reveals new scene out of black
  const blackQ3 = computeTransitionState(270, 360, 'fade-black');
  assert.equal(blackQ3.active, true);
  assert.equal(blackQ3.showPrevBase, false);
  assert.equal(blackQ3.blackAlpha, 0.5);

  // Completed transition becomes inactive
  assert.equal(computeTransitionState(360, 360, 'fade-black').active, false);
});

test('computeStageViewportFit strictly enforces 16:9, 9:16, and 1:1 without horizontal stretching', () => {
  // Wide short laptop container (2.125:1) must NOT stretch 16:9 canvas wider than 16:9
  const laptop16x9 = computeStageViewportFit(1020, 480, '16:9');
  assert.equal(laptop16x9.height, 480);
  assert.equal(laptop16x9.width, 853);
  assert.ok(Math.abs(laptop16x9.width / laptop16x9.height - 16 / 9) < 0.01);

  // Mobile portrait container fits 16:9 cleanly at full width
  const phone16x9 = computeStageViewportFit(378, 600, '16:9');
  assert.equal(phone16x9.width, 378);
  assert.equal(phone16x9.height, 212);

  // Mobile portrait container fits 9:16 cleanly without exceeding height
  const phone9x16 = computeStageViewportFit(378, 560, '9:16');
  assert.equal(phone9x16.height, 560);
  assert.equal(phone9x16.width, 315);
});

test('computePersonMaskAlpha feathers smoothly between background and foreground confidence', () => {
  assert.equal(computePersonMaskAlpha(0.1), 0);
  assert.equal(computePersonMaskAlpha(0.95), 255);
  const mid = computePersonMaskAlpha(0.5);
  assert.ok(mid > 110 && mid < 145);
});

test('selectBestVideoMimeType respects preferred MP4, WebM, and MKV formats', () => {
  const mp4Pref = selectBestVideoMimeType(
    (m) => m.includes('avc1') || m.includes('vp9'),
    'mp4'
  );
  assert.equal(mp4Pref.extension, 'mp4');
  assert.ok(mp4Pref.mimeType.startsWith('video/mp4'));

  const mkvPref = selectBestVideoMimeType(
    (m) => m.includes('x-matroska') || m.includes('vp9'),
    'mkv'
  );
  assert.equal(mkvPref.extension, 'mkv');
  assert.ok(mkvPref.mimeType.startsWith('video/x-matroska'));

  // Falls back gracefully to WebM when MP4 is unsupported
  const mp4Fallback = selectBestVideoMimeType((m) => m.includes('webm'), 'mp4');
  assert.equal(mp4Fallback.extension, 'webm');

  // Video-only streams (hasAudio=false) must omit audio codecs like opus/mp4a
  const webmSilent = selectBestVideoMimeType(() => true, 'webm', false);
  assert.equal(webmSilent.extension, 'webm');
  assert.equal(webmSilent.mimeType.includes('opus'), false);

  const mp4Silent = selectBestVideoMimeType(() => true, 'mp4', false);
  assert.equal(mp4Silent.extension, 'mp4');
  assert.equal(mp4Silent.mimeType.includes('mp4a'), false);

  const mkvSilent = selectBestVideoMimeType(() => true, 'mkv', false);
  assert.equal(mkvSilent.extension, 'mkv');
  assert.equal(mkvSilent.mimeType.includes('opus'), false);
});

test('bitrate and export file size estimates scale monotonically with resolution', () => {
  assert.ok(getRecommendedVideoBitrate('2160p') > getRecommendedVideoBitrate('1080p'));
  assert.ok(getRecommendedVideoBitrate('1080p') > getRecommendedVideoBitrate('720p'));
  assert.ok(getRecommendedVideoBitrate('720p') > getRecommendedVideoBitrate('480p'));
  assert.ok(getRecommendedVideoBitrate('480p') > getRecommendedVideoBitrate('360p'));

  const mb1080 = estimateExportSizeMb(60, 'mp4', '1080p');
  const mb720 = estimateExportSizeMb(60, 'mp4', '720p');
  const mbWebm = estimateExportSizeMb(60, 'webm', '1080p');
  const mbWav = estimateExportSizeMb(60, 'wav', '1080p');
  assert.ok(mb1080 > mb720);
  assert.ok(mb1080 > mbWebm);
  assert.ok(mbWav > 5 && mbWav < 20);
});

test('computeGifDimensions caps GIF resolution smoothly while preserving aspect ratio', () => {
  const gif4k = computeGifDimensions('16:9', '2160p');
  assert.equal(gif4k.width, 960);
  assert.equal(gif4k.height, 540);

  const gif360 = computeGifDimensions('16:9', '360p');
  assert.deepEqual(gif360, { width: 640, height: 360 });
});

test('encodeWavBuffer writes valid RIFF/WAVE PCM16 header and samples', () => {
  const left = new Float32Array([0, 0.5, -0.5, 1]);
  const right = new Float32Array([0, -0.5, 0.5, -1]);
  const buf = encodeWavBuffer([left, right], 48000);
  assert.equal(buf.byteLength, 44 + 4 * 2 * 2);

  const view = new DataView(buf);
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  assert.equal(riff, 'RIFF');
  assert.equal(wave, 'WAVE');
  assert.equal(view.getUint16(22, true), 2); // 2 channels
  assert.equal(view.getUint32(24, true), 48000); // 48kHz
  assert.equal(view.getUint16(34, true), 16); // 16-bit PCM
});


