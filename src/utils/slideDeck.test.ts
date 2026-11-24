import test from 'node:test';
import assert from 'node:assert/strict';
import type { SlideItem } from '../types/studio';
import {
  addSlidesToDeck,
  deleteSlideFromDeck,
  moveSlideInDeck,
  type SlideDeckState,
} from './slideDeck';

function makeSlide(id: string, sourceType: SlideItem['sourceType'] = 'image'): SlideItem {
  return {
    id,
    title: id,
    dataUrl: `data:image/png;base64,${id}`,
    width: 1920,
    height: 1080,
    sourceType,
  };
}

test('addSlidesToDeck replaces starter-only slides on deck import and appends template slides', () => {
  const starterState: SlideDeckState = {
    slides: [makeSlide('starter-1', 'starter'), makeSlide('starter-2', 'starter')],
    activeIndex: 1,
  };

  const imported = [makeSlide('pdf-1', 'pdf'), makeSlide('pdf-2', 'pdf')];
  const afterImport = addSlidesToDeck(starterState, imported);
  assert.deepEqual(
    afterImport.slides.map((s) => s.id),
    ['pdf-1', 'pdf-2']
  );
  assert.equal(afterImport.activeIndex, 0);

  const tpl = [makeSlide('tpl-1', 'template')];
  const afterTplOnStarter = addSlidesToDeck(starterState, tpl);
  assert.deepEqual(
    afterTplOnStarter.slides.map((s) => s.id),
    ['starter-1', 'starter-2', 'tpl-1']
  );
  assert.equal(afterTplOnStarter.activeIndex, 2);
});

test('deleteSlideFromDeck adjusts activeIndex accurately for before, active, and last slide', () => {
  const initial: SlideDeckState = {
    slides: [makeSlide('a'), makeSlide('b'), makeSlide('c')],
    activeIndex: 1,
  };

  // Deleting slide before active shifts activeIndex down by 1
  const delBefore = deleteSlideFromDeck(initial, 0);
  assert.deepEqual(
    delBefore.slides.map((s) => s.id),
    ['b', 'c']
  );
  assert.equal(delBefore.activeIndex, 0);

  // Deleting final slide while active clamps to new last index
  const atEnd: SlideDeckState = {
    slides: [makeSlide('a'), makeSlide('b')],
    activeIndex: 1,
  };
  const delEnd = deleteSlideFromDeck(atEnd, 1);
  assert.deepEqual(
    delEnd.slides.map((s) => s.id),
    ['a']
  );
  assert.equal(delEnd.activeIndex, 0);

  // Deleting last remaining slide leaves empty array and index 0
  const delLast = deleteSlideFromDeck(delEnd, 0);
  assert.equal(delLast.slides.length, 0);
  assert.equal(delLast.activeIndex, 0);
});

test('moveSlideInDeck tracks activeIndex across adjacent and non-adjacent reorders', () => {
  const initial: SlideDeckState = {
    slides: [makeSlide('a'), makeSlide('b'), makeSlide('c'), makeSlide('d')],
    activeIndex: 2, // 'c'
  };

  // Move 'a' (0) -> 3: [b, c, d, a], active 'c' moves from 2 -> 1
  const m1 = moveSlideInDeck(initial, 0, 3);
  assert.deepEqual(
    m1.slides.map((s) => s.id),
    ['b', 'c', 'd', 'a']
  );
  assert.equal(m1.slides[m1.activeIndex]?.id, 'c');
  assert.equal(m1.activeIndex, 1);

  // Move active 'c' (1) -> 3: [b, d, a, c], active stays on 'c' at index 3
  const m2 = moveSlideInDeck(m1, 1, 3);
  assert.deepEqual(
    m2.slides.map((s) => s.id),
    ['b', 'd', 'a', 'c']
  );
  assert.equal(m2.slides[m2.activeIndex]?.id, 'c');
  assert.equal(m2.activeIndex, 3);

  // Move 'b' (0) -> 3 on m2: active is at index 3 -> 'c' moves to 2
  const m3 = moveSlideInDeck({ ...m2, activeIndex: 2 }, 3, 0);
  assert.deepEqual(
    m3.slides.map((s) => s.id),
    ['c', 'b', 'd', 'a']
  );
  assert.equal(m3.slides[m3.activeIndex]?.id, 'a');
  assert.equal(m3.activeIndex, 3);
});
