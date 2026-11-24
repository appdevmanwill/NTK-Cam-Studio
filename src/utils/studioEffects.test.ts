import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSlideFilterString,
  buildWebcamFilterString,
  clampTeleprompterRect,
  computeAnnotationOpacity,
  computeLowerThirdRect,
  computeReactionFrame,
  computeWatermarkRect,
  DEFAULT_STAGE_DESIGN,
  DEFAULT_WEBCAM_EFFECTS,
  hitTestLowerThird,
  hitTestTextOverlay,
  hitTestWatermark,
  isSlideAdjustmentDefault,
  pruneExpiredAnnotations,
  pruneExpiredReactions,
} from './studioEffects';
import type { AnnotationStroke, LiveReaction, StageTextOverlay } from '../types/studio';

test('buildSlideFilterString returns none for neutral defaults and formats adjusted channels', () => {
  assert.equal(buildSlideFilterString(), 'none');
  assert.equal(
    buildSlideFilterString({ brightness: 100, contrast: 100, saturation: 100 }),
    'none'
  );
  assert.equal(isSlideAdjustmentDefault({ brightness: 100, contrast: 100, saturation: 100 }), true);

  const adjusted = buildSlideFilterString({ brightness: 120, contrast: 110, saturation: 145 });
  assert.equal(adjusted, 'brightness(120%) contrast(110%) saturate(145%)');
  assert.equal(isSlideAdjustmentDefault({ brightness: 120, contrast: 100, saturation: 100 }), false);

  // Clamps out-of-range values safely
  const clamped = buildSlideFilterString({ brightness: 300, contrast: 10, saturation: -25 });
  assert.equal(clamped, 'brightness(150%) contrast(50%) saturate(0%)');
});

test('buildWebcamFilterString combines YouCam presets, sliders, and adjustable brighter low-light lift', () => {
  assert.equal(buildWebcamFilterString(DEFAULT_WEBCAM_EFFECTS), 'none');

  const boosted = buildWebcamFilterString({
    ...DEFAULT_WEBCAM_EFFECTS,
    lowLightBoost: true,
    filterPreset: 'cinema',
  });
  assert.ok(boosted.includes('brightness(116%)'));
  assert.ok(boosted.includes('contrast(106%)'));
  assert.ok(boosted.includes('sepia(8%)'));

  const maxLowLight = buildWebcamFilterString({
    ...DEFAULT_WEBCAM_EFFECTS,
    lowLightBoost: true,
    lowLightLevel: 100,
  });
  assert.ok(maxLowLight.includes('brightness(200%)'));
  assert.ok(maxLowLight.includes('contrast(114%)'));

  const noir = buildWebcamFilterString({
    ...DEFAULT_WEBCAM_EFFECTS,
    filterPreset: 'bw',
    saturation: 90,
  });
  assert.ok(noir.includes('saturate(90%)'));
  assert.ok(noir.includes('grayscale(100%)'));
});

test('computeAnnotationOpacity keeps persistent ink opaque and fades auto-fade ink smoothly', () => {
  const persistent: AnnotationStroke = {
    id: 's1',
    tool: 'pen',
    color: '#ef4444',
    width: 4,
    points: [{ x: 0.1, y: 0.1 }],
    createdAt: 1000,
    autoFade: false,
  };
  assert.equal(computeAnnotationOpacity(persistent, 50000), 1);

  const fading: AnnotationStroke = { ...persistent, id: 's2', autoFade: true };
  assert.equal(computeAnnotationOpacity(fading, 3000, 3000, 1000), 1);
  assert.equal(computeAnnotationOpacity(fading, 4500, 3000, 1000), 0.5);
  assert.equal(computeAnnotationOpacity(fading, 5200, 3000, 1000), 0);

  const kept = pruneExpiredAnnotations([persistent, fading], 5200, 3000, 1000);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, 's1');
});

test('computeReactionFrame rises upward, pops in, fades out, and expires cleanly', () => {
  const reaction: LiveReaction = {
    id: 'r1',
    emoji: '🔥',
    x: 0.5,
    createdAt: 1000,
    durationMs: 2000,
    driftX: 18,
  };

  const early = computeReactionFrame(reaction, 1200, 1280, 720);
  const late = computeReactionFrame(reaction, 2700, 1280, 720);
  const expired = computeReactionFrame(reaction, 3200, 1280, 720);

  assert.equal(early.active, true);
  assert.equal(late.active, true);
  assert.ok(late.y < early.y, 'Reaction should rise toward top of canvas');
  assert.ok(late.opacity < early.opacity, 'Reaction should fade out near end of lifetime');
  assert.equal(expired.active, false);

  assert.equal(pruneExpiredReactions([reaction], 3200).length, 0);
  assert.equal(pruneExpiredReactions([reaction], 1500).length, 1);
});

test('hitTestTextOverlay hits center of Canva text callout and misses far corners', () => {
  const overlay: StageTextOverlay = {
    id: 't1',
    text: 'Live Demo',
    style: 'callout',
    x: 0.5,
    y: 0.25,
    textColor: '#ffffff',
    bgColor: '#2563eb',
    fontSize: 28,
  };

  assert.equal(hitTestTextOverlay(640, 180, overlay, 1280, 720), true);
  assert.equal(hitTestTextOverlay(40, 40, overlay, 1280, 720), false);
});

test('draggable lower-third and watermark rect & hit-testing clamp cleanly on canvas', () => {
  const lt = { ...DEFAULT_STAGE_DESIGN.lowerThird, enabled: true, x: 0.5, y: 0.35 };
  const ltRect = computeLowerThirdRect(lt, 1280, 720);
  assert.equal(
    hitTestLowerThird(ltRect.x + ltRect.width / 2, ltRect.y + ltRect.height / 2, lt, 1280, 720),
    true
  );
  assert.equal(hitTestLowerThird(10, 10, lt, 1280, 720), false);

  const wm = { ...DEFAULT_STAGE_DESIGN.watermark, enabled: true, x: 0.3, y: 0.7 };
  const wmRect = computeWatermarkRect(wm, 1280, 720);
  assert.equal(
    hitTestWatermark(wmRect.x + wmRect.width / 2, wmRect.y + wmRect.height / 2, wm, 1280, 720),
    true
  );
  assert.equal(hitTestWatermark(1200, 40, wm, 1280, 720), false);
});

test('clampTeleprompterRect keeps resized window within stage bounds', () => {
  const shrunk = clampTeleprompterRect({
    x: -50,
    y: 900,
    width: 120,
    height: 60,
    containerWidth: 800,
    containerHeight: 500,
  });
  assert.equal(shrunk.width, 230);
  assert.equal(shrunk.height, 116);
  assert.equal(shrunk.x, 8);
  assert.equal(shrunk.y, 500 - 8 - 116);
});
