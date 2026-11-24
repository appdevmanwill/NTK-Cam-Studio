import type { SlideAdjustments, SlideItem } from '../types/studio';
import { DEFAULT_SLIDE_ADJUSTMENTS } from './studioEffects';

export interface SlideDeckState {
  slides: SlideItem[];
  activeIndex: number;
}

/**
 * Adds imported or template slides to the deck, replacing initial starter slides
 * on first deck import while appending single template slides cleanly.
 */
export function addSlidesToDeck(
  state: SlideDeckState,
  newSlides: SlideItem[]
): SlideDeckState {
  if (newSlides.length === 0) return state;
  const onlyStarterSlides =
    state.slides.length > 0 && state.slides.every((s) => s.sourceType === 'starter');
  const isTemplateAdd = newSlides.length === 1 && newSlides[0].sourceType === 'template';
  if (onlyStarterSlides && !isTemplateAdd) {
    return { slides: newSlides, activeIndex: 0 };
  }
  return {
    slides: [...state.slides, ...newSlides],
    activeIndex: state.slides.length,
  };
}

/**
 * Deletes a slide at `index` and keeps `activeIndex` pointing to a valid slide.
 */
export function deleteSlideFromDeck(
  state: SlideDeckState,
  index: number
): SlideDeckState {
  if (index < 0 || index >= state.slides.length) return state;
  const nextSlides = state.slides.filter((_, i) => i !== index);
  let nextActive = state.activeIndex;
  if (nextSlides.length === 0) {
    nextActive = 0;
  } else if (state.activeIndex >= nextSlides.length) {
    nextActive = nextSlides.length - 1;
  } else if (state.activeIndex > index) {
    nextActive = state.activeIndex - 1;
  }
  return { slides: nextSlides, activeIndex: nextActive };
}

/**
 * Moves a slide from `fromIndex` to `toIndex` while keeping `activeIndex` tracking
 * the previously active slide across both adjacent and non-adjacent moves.
 */
export function moveSlideInDeck(
  state: SlideDeckState,
  fromIndex: number,
  toIndex: number
): SlideDeckState {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= state.slides.length ||
    toIndex < 0 ||
    toIndex >= state.slides.length
  ) {
    return state;
  }
  const copy = [...state.slides];
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, item);

  let nextActive = state.activeIndex;
  if (state.activeIndex === fromIndex) {
    nextActive = toIndex;
  } else if (fromIndex < state.activeIndex && toIndex >= state.activeIndex) {
    nextActive = state.activeIndex - 1;
  } else if (fromIndex > state.activeIndex && toIndex <= state.activeIndex) {
    nextActive = state.activeIndex + 1;
  }

  return { slides: copy, activeIndex: nextActive };
}

export function updateSlideAdjustmentsInDeck(
  state: SlideDeckState,
  index: number,
  patch: Partial<SlideAdjustments>
): SlideDeckState {
  if (index < 0 || index >= state.slides.length) return state;
  return {
    ...state,
    slides: state.slides.map((slide, i) =>
      i === index
        ? {
            ...slide,
            adjustments: {
              ...DEFAULT_SLIDE_ADJUSTMENTS,
              ...slide.adjustments,
              ...patch,
            },
          }
        : slide
    ),
  };
}

export function applyAdjustmentsToAllSlides(
  state: SlideDeckState,
  adjustments: SlideAdjustments
): SlideDeckState {
  return {
    ...state,
    slides: state.slides.map((slide) => ({
      ...slide,
      adjustments: { ...adjustments },
    })),
  };
}
