import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAutoCenteredCoverCrop,
  createInitialAutoCenterState,
  detectSubjectAnchorFromRgba,
  isSkinToneRgb,
  NEUTRAL_PORTRAIT_ANCHOR,
  stepAutoCenterState,
} from './faceAutoCenter';

function createBlankFrame(width: number, height: number, r: number, g: number, b: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

function paintRect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  rw: number,
  rh: number,
  r: number,
  g: number,
  b: number
) {
  for (let y = y0; y < Math.min(height, y0 + rh); y++) {
    for (let x = x0; x < Math.min(width, x0 + rw); x++) {
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
}

test('isSkinToneRgb accepts diverse human skin tones and rejects blue/gray backdrops', () => {
  // Light, medium, and deep warm skin tones
  assert.equal(isSkinToneRgb(226, 184, 155), true);
  assert.equal(isSkinToneRgb(186, 134, 102), true);
  assert.equal(isSkinToneRgb(118, 76, 54), true);

  // Neutral gray, blue background, green screen, pure black/white
  assert.equal(isSkinToneRgb(120, 120, 120), false);
  assert.equal(isSkinToneRgb(30, 80, 190), false);
  assert.equal(isSkinToneRgb(20, 190, 60), false);
  assert.equal(isSkinToneRgb(10, 10, 10), false);
  assert.equal(isSkinToneRgb(255, 255, 255), false);
});

test('detectSubjectAnchorFromRgba locates off-center face patch accurately', () => {
  const w = 80;
  const h = 45;
  const frame = createBlankFrame(w, h, 28, 36, 52); // dark slate room
  // Paint a face patch on the right side (x: 56..68, y: 10..24 => center ~0.775, 0.378)
  paintRect(frame, w, h, 56, 10, 12, 14, 195, 140, 110);

  const result = detectSubjectAnchorFromRgba(frame, w, h);
  assert.ok(result.confidence >= 0.25, `Expected confident detection, got ${result.confidence}`);
  assert.ok(result.cx > 0.7 && result.cx < 0.85, `Expected cx near 0.775, got ${result.cx}`);
  assert.ok(result.cy > 0.3 && result.cy < 0.46, `Expected cy near 0.38, got ${result.cy}`);
});

test('stepAutoCenterState smoothly glides toward subject and resets when empty', () => {
  let state = createInitialAutoCenterState();
  const det = { cx: 0.78, cy: 0.36, confidence: 0.85, coverage: 0.1 };

  // Step forward 1 second in 100ms increments
  for (let i = 1; i <= 10; i++) {
    state = stepAutoCenterState(state, det, i * 100, 0.1);
  }
  assert.ok(state.x > 0.72, `Expected smoothed X to move toward 0.78, got ${state.x}`);
  assert.ok(state.y < 0.4, `Expected smoothed Y to move toward 0.36, got ${state.y}`);

  // After >1.6s with no detection, glides back toward neutral center
  for (let i = 1; i <= 25; i++) {
    state = stepAutoCenterState(state, null, 2800 + i * 100, 0.1);
  }
  assert.ok(
    Math.abs(state.x - NEUTRAL_PORTRAIT_ANCHOR.x) < 0.06,
    `Expected X to return near neutral 0.5, got ${state.x}`
  );
});

test('computeAutoCenteredCoverCrop pans crop to follow subject without exceeding source bounds', () => {
  // 16:9 webcam (1280x720) inside a circular/square frame (300x300)
  const rightCrop = computeAutoCenteredCoverCrop(1280, 720, 300, 300, 0.82, 0.38, 1.18);
  const leftCrop = computeAutoCenteredCoverCrop(1280, 720, 300, 300, 0.18, 0.38, 1.18);

  // Right-side subject yields a crop further right than left-side subject
  assert.ok(rightCrop.x > leftCrop.x + 250, `Expected strong horizontal pan: right=${rightCrop.x}, left=${leftCrop.x}`);

  // Bounds strictly inside source video
  assert.ok(rightCrop.x >= 0 && rightCrop.x + rightCrop.width <= 1280.01);
  assert.ok(rightCrop.y >= 0 && rightCrop.y + rightCrop.height <= 720.01);
  assert.ok(leftCrop.x >= 0 && leftCrop.x + leftCrop.width <= 1280.01);
  assert.ok(leftCrop.y >= 0 && leftCrop.y + leftCrop.height <= 720.01);

  // Preserves target aspect ratio (1:1)
  assert.ok(Math.abs(rightCrop.width / rightCrop.height - 1) < 0.001);

  // Also pans cleanly on 16:9 rectangular target (1280x720 -> 1280x720) thanks to zoomBoost
  const rectRight = computeAutoCenteredCoverCrop(1280, 720, 1280, 720, 0.85, 0.65, 1.18);
  const rectLeft = computeAutoCenteredCoverCrop(1280, 720, 1280, 720, 0.15, 0.25, 1.18);
  assert.ok(rectRight.x > rectLeft.x + 50);
  assert.ok(rectRight.y > rectLeft.y + 30);
});
