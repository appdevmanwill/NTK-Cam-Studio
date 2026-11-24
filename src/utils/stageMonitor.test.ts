import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMicSignal,
  computeWaveformBars,
  formatAudioDb,
  parseScreenShareInfo,
} from './stageMonitor';

test('parseScreenShareInfo handles inactive state cleanly', () => {
  const info = parseScreenShareInfo(null);
  assert.equal(info.active, false);
  assert.equal(info.surfaceLabel, 'Not Sharing');
  assert.equal(info.resolutionLabel, null);
});

test('parseScreenShareInfo humanizes raw Chromium screen/window/tab track labels', () => {
  const monitor = parseScreenShareInfo({
    label: 'screen:0:0',
    displaySurface: 'monitor',
    width: 1920,
    height: 1080,
    hasSystemAudio: true,
  });
  assert.equal(monitor.active, true);
  assert.equal(monitor.surfaceKind, 'monitor');
  assert.equal(monitor.surfaceLabel, 'Entire Screen');
  assert.equal(monitor.sourceName, 'Display 1');
  assert.equal(monitor.resolutionLabel, '1920×1080');
  assert.equal(monitor.hasSystemAudio, true);

  const win = parseScreenShareInfo({
    label: 'window:84920:0',
    displaySurface: 'window',
    width: 1440,
    height: 900,
  });
  assert.equal(win.surfaceKind, 'window');
  assert.equal(win.surfaceLabel, 'Window');
  assert.equal(win.sourceName, 'Application Window');

  const tab = parseScreenShareInfo({
    label: 'web-contents-media-stream://14:2',
    displaySurface: 'browser',
  });
  assert.equal(tab.surfaceKind, 'browser');
  assert.equal(tab.surfaceLabel, 'Browser Tab');
  assert.equal(tab.sourceName, 'Browser Tab');
});

test('parseScreenShareInfo preserves readable window titles and strips redundant prefixes', () => {
  const namedWindow = parseScreenShareInfo({
    label: 'window: Figma — Q4 Product Deck',
    displaySurface: 'window',
    width: 1280,
    height: 720,
  });
  assert.equal(namedWindow.sourceName, 'Figma — Q4 Product Deck');
  assert.equal(namedWindow.surfaceLabel, 'Window');
  assert.equal(namedWindow.resolutionLabel, '1280×720');
});

test('computeWaveformBars maps silent buffer to zero bars and active sine wave to bounded bars', () => {
  const silent = new Uint8Array(128).fill(128);
  const silentResult = computeWaveformBars(silent, 16);
  assert.equal(silentResult.bars.length, 16);
  assert.equal(silentResult.rms, 0);
  assert.equal(silentResult.peak, 0);
  assert.ok(silentResult.bars.every((v) => v === 0));

  const tone = new Uint8Array(128);
  for (let i = 0; i < tone.length; i++) {
    tone[i] = Math.round(128 + Math.sin((i / tone.length) * Math.PI * 8) * 60);
  }
  const activeResult = computeWaveformBars(tone, 16);
  assert.equal(activeResult.bars.length, 16);
  assert.ok(activeResult.rms > 0.25);
  assert.ok(activeResult.peak > 0.4);
  assert.ok(activeResult.bars.every((v) => v >= 0 && v <= 1));
  assert.ok(activeResult.bars.some((v) => v > 0.4));

  // Verify smooth decay when signal drops to silence
  const decayed = computeWaveformBars(silent, 16, activeResult.bars);
  assert.ok(decayed.bars.some((v, idx) => v < activeResult.bars[idx] && v > 0));
});

test('classifyMicSignal and formatAudioDb report accurate status across levels', () => {
  assert.equal(classifyMicSignal(0.5, 0.9, false), 'off');
  assert.equal(classifyMicSignal(0.002, 0.005, true), 'quiet');
  assert.equal(classifyMicSignal(0.12, 0.25, true), 'capturing');
  assert.equal(classifyMicSignal(0.45, 0.72, true), 'hot');
  assert.equal(classifyMicSignal(0.5, 0.96, true), 'clipping');

  assert.equal(formatAudioDb(0), '-∞ dB');
  assert.equal(formatAudioDb(1), '0 dB');
  assert.equal(formatAudioDb(0.1), '-20 dB');
});
