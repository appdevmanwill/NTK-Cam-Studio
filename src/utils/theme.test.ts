import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THEME_PREFERENCE,
  getNextThemePreference,
  getThemeDisplayLabel,
  getThemeMetaColor,
  parseStudioPrefs,
  parseThemePreference,
  resolveTheme,
} from './theme';

test('parseThemePreference defaults to system (PC/mobile) for missing or invalid values', () => {
  assert.equal(DEFAULT_THEME_PREFERENCE, 'system');
  assert.equal(parseThemePreference(null), 'system');
  assert.equal(parseThemePreference(undefined), 'system');
  assert.equal(parseThemePreference('sepia'), 'system');
  assert.equal(parseThemePreference('light'), 'light');
  assert.equal(parseThemePreference('dark'), 'dark');
  assert.equal(parseThemePreference('system'), 'system');
});

test('resolveTheme follows OS preference in system mode and honors manual overrides', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('theme cycling, display labels, and mobile theme-color hex values behave consistently', () => {
  assert.equal(getNextThemePreference('system'), 'light');
  assert.equal(getNextThemePreference('light'), 'dark');
  assert.equal(getNextThemePreference('dark'), 'system');

  assert.equal(getThemeDisplayLabel('system', 'dark'), 'Auto (Dark)');
  assert.equal(getThemeDisplayLabel('system', 'light'), 'Auto (Light)');
  assert.equal(getThemeDisplayLabel('light', 'light'), 'Light');
  assert.equal(getThemeDisplayLabel('dark', 'dark'), 'Dark');

  assert.equal(getThemeMetaColor('dark'), '#0B0C0F');
  assert.equal(getThemeMetaColor('light'), '#FFFFFF');
});

test('parseStudioPrefs sanitizes corrupt JSON and clamps numeric ranges safely', () => {
  assert.deepEqual(parseStudioPrefs(null), {});
  assert.deepEqual(parseStudioPrefs('{bad json'), {});

  const parsed = parseStudioPrefs(
    JSON.stringify({
      lowerThirdName: 'Ada Lovelace',
      lowerThirdStyle: 'glass',
      watermarkText: 'NTK',
      watermarkOpacity: 5,
      watermarkSize: 0.1,
      teleprompterFontSize: 99,
      teleprompterScrollSpeed: 2,
    })
  );

  assert.equal(parsed.lowerThirdName, 'Ada Lovelace');
  assert.equal(parsed.lowerThirdStyle, 'glass');
  assert.equal(parsed.watermarkText, 'NTK');
  assert.equal(parsed.watermarkOpacity, 1);
  assert.equal(parsed.watermarkSize, 0.6);
  assert.equal(parsed.teleprompterFontSize, 40);
  assert.equal(parsed.teleprompterScrollSpeed, 10);
});
