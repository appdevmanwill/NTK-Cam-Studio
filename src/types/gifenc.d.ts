declare module 'gifenc' {
  export type GifPalette = number[][];

  export interface GifFrameOptions {
    palette?: GifPalette | null;
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    colorDepth?: number;
    dispose?: number;
    first?: boolean;
  }

  export interface GifEncoderInstance {
    reset: () => void;
    finish: () => void;
    bytes: () => Uint8Array;
    bytesView: () => Uint8Array;
    writeHeader: () => void;
    writeFrame: (
      index: Uint8Array,
      width: number,
      height: number,
      opts?: GifFrameOptions
    ) => void;
  }

  export function GIFEncoder(opt?: {
    initialCapacity?: number;
    auto?: boolean;
  }): GifEncoderInstance;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: { format?: 'rgb565' | 'rgb444' | 'rgba4444'; oneBitAlpha?: boolean }
  ): GifPalette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
    format?: 'rgb565' | 'rgb444' | 'rgba4444'
  ): Uint8Array;

  const _default: {
    GIFEncoder?: typeof GIFEncoder;
    quantize?: typeof quantize;
    applyPalette?: typeof applyPalette;
  };
  export default _default;
}
