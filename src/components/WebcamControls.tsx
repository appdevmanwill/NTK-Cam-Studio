import React, { useRef } from 'react';
import {
  Camera,
  CameraOff,
  Circle,
  Eraser,
  FlipHorizontal2,
  Focus,
  ImagePlus,
  Mic,
  MicOff,
  RectangleHorizontal,
  RotateCcw,
  Sparkles,
  Square,
  Sun,
  X,
} from 'lucide-react';
import type {
  AspectRatio,
  VirtualBgMode,
  WebcamBorderStyle,
  WebcamConfig,
  WebcamCorner,
  WebcamEffects,
  WebcamShape,
} from '../types/studio';
import type { SegmentationEngineStatus } from '../utils/cameraSegmentation';
import { getCanvasDimensions, getCornerSnapPosition } from '../utils/compositorMath';
import {
  CAMERA_FILTER_PRESETS,
  DEFAULT_WEBCAM_EFFECTS,
  isWebcamEffectsDefault,
} from '../utils/studioEffects';

interface WebcamControlsProps {
  webcamConfig: WebcamConfig;
  aspectRatio: AspectRatio;
  cameraActive: boolean;
  micActive: boolean;
  audioLevel: number;
  segmentationStatus?: SegmentationEngineStatus;
  videoDevices: MediaDeviceInfo[];
  audioDevices: MediaDeviceInfo[];
  selectedVideoId: string;
  selectedAudioId: string;
  onChangeWebcam: (patch: Partial<WebcamConfig>) => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onSelectVideoDevice: (deviceId: string) => void;
  onSelectAudioDevice: (deviceId: string) => void;
}

const SHAPE_OPTIONS: Array<{
  id: WebcamShape;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'rounded', label: 'Rounded', icon: RectangleHorizontal },
  { id: 'square', label: 'Square', icon: Square },
];

const SIZE_PRESETS = [
  { label: 'Small', value: 0.2 },
  { label: 'Medium', value: 0.3 },
  { label: 'Large', value: 0.42 },
];

const BORDER_OPTIONS: Array<{ id: WebcamBorderStyle; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'subtle', label: 'Subtle' },
  { id: 'bright', label: 'White' },
  { id: 'accent', label: 'Blue' },
];

const CORNER_OPTIONS: Array<{ id: WebcamCorner; label: string }> = [
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-right', label: 'Bottom Right' },
];

const VIRTUAL_BG_OPTIONS: Array<{ id: VirtualBgMode; label: string; ariaLabel?: string }> = [
  { id: 'none', label: 'Original' },
  { id: 'blur-light', label: 'Soft Blur' },
  { id: 'blur-strong', label: 'Deep Blur' },
  { id: 'remove', label: 'Remove', ariaLabel: 'Remove background' },
  { id: 'studio-dark', label: 'Studio' },
  { id: 'modern-office', label: 'Office' },
  { id: 'bokeh', label: 'Bokeh' },
  { id: 'custom', label: 'Photo' },
];

export const WebcamControls: React.FC<WebcamControlsProps> = ({
  webcamConfig,
  aspectRatio,
  cameraActive,
  micActive,
  audioLevel,
  segmentationStatus = 'idle',
  videoDevices,
  audioDevices,
  selectedVideoId,
  selectedAudioId,
  onChangeWebcam,
  onToggleCamera,
  onToggleMic,
  onSelectVideoDevice,
  onSelectAudioDevice,
}) => {
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSnapCorner = (corner: WebcamCorner) => {
    const { width, height } = getCanvasDimensions(aspectRatio);
    const pos = getCornerSnapPosition(
      corner,
      width,
      height,
      webcamConfig.scale,
      webcamConfig.shape,
      32
    );
    onChangeWebcam({ x: pos.x, y: pos.y });
  };

  const updateEffects = (patch: Partial<WebcamEffects>) => {
    const nextEffects: WebcamEffects = { ...webcamConfig.effects, ...patch };
    onChangeWebcam({
      effects: nextEffects,
      backgroundBlur: nextEffects.virtualBg !== 'none',
    });
  };

  const handleUploadCustomBg = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateEffects({ virtualBg: 'custom', customBgUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const scalePercent = Math.round(((webcamConfig.scale - 0.14) / (0.48 - 0.14)) * 100);
  const fx = webcamConfig.effects;
  const fxIsDefault = isWebcamEffectsDefault(fx);

  return (
    <div className="space-y-4">
      {/* Camera & Microphone Devices */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide">
            Camera & Microphone
          </h3>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={webcamConfig.enabled}
              onChange={(e) => onChangeWebcam({ enabled: e.target.checked })}
              className="accent-blue-600 dark:accent-blue-500 rounded cursor-pointer"
            />
            Show overlay
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onToggleCamera}
            className={`flex items-center justify-center gap-2 h-10 px-3 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
              cameraActive
                ? 'bg-blue-50 border-blue-400 text-blue-700 hover:bg-blue-100/70 dark:bg-blue-500/15 dark:border-blue-500/50 dark:text-blue-200 dark:hover:bg-blue-500/20'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200/70 dark:bg-[#1A1D24] dark:border-[#272B35] dark:text-slate-300 dark:hover:bg-[#222630]'
            }`}
          >
            {cameraActive ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
            {cameraActive ? 'Camera On' : 'Enable Cam'}
          </button>

          <button
            type="button"
            onClick={onToggleMic}
            className={`flex items-center justify-center gap-2 h-10 px-3 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
              micActive
                ? 'bg-emerald-50 border-emerald-400 text-emerald-700 hover:bg-emerald-100/70 dark:bg-emerald-500/15 dark:border-emerald-500/50 dark:text-emerald-200 dark:hover:bg-emerald-500/20'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200/70 dark:bg-[#1A1D24] dark:border-[#272B35] dark:text-slate-300 dark:hover:bg-[#222630]'
            }`}
          >
            {micActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            {micActive ? 'Mic On' : 'Enable Mic'}
          </button>
        </div>

        {/* Device Selectors */}
        <div className="space-y-2.5 pt-1">
          <div className="space-y-1">
            <label
              htmlFor="camera-device-select"
              className="block text-[11px] text-slate-600 dark:text-slate-400"
            >
              Camera input
            </label>
            <select
              id="camera-device-select"
              value={selectedVideoId}
              onChange={(e) => onSelectVideoDevice(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg bg-white dark:bg-[#1A1D24] border border-slate-300 dark:border-[#272B35] text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {videoDevices.length === 0 ? (
                <option value="">Default System Camera</option>
              ) : (
                videoDevices.map((device, i) => (
                  <option key={device.deviceId || i} value={device.deviceId}>
                    {device.label || `Camera ${i + 1}`}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="mic-device-select"
                className="block text-[11px] text-slate-600 dark:text-slate-400"
              >
                Microphone input
              </label>
              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                {micActive ? `${Math.round(audioLevel * 100)}%` : 'Muted'}
              </span>
            </div>
            <select
              id="mic-device-select"
              value={selectedAudioId}
              onChange={(e) => onSelectAudioDevice(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg bg-white dark:bg-[#1A1D24] border border-slate-300 dark:border-[#272B35] text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {audioDevices.length === 0 ? (
                <option value="">Default System Microphone</option>
              ) : (
                audioDevices.map((device, i) => (
                  <option key={device.deviceId || i} value={device.deviceId}>
                    {device.label || `Microphone ${i + 1}`}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </section>

      <div className="h-px bg-slate-200 dark:bg-[#222630]" />

      {/* Camera Background Blur, Removal & Virtual Backgrounds */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide inline-flex items-center gap-1.5">
            <Eraser className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Camera Background
          </h3>
          {fx.virtualBg !== 'none' && cameraActive && (
            <span className="text-[10px] font-medium text-blue-600 dark:text-blue-300 whitespace-nowrap">
              {segmentationStatus === 'loading'
                ? 'Loading AI matte…'
                : segmentationStatus === 'ready'
                  ? 'AI person cutout'
                  : 'Soft portrait matte'}
            </span>
          )}
        </div>

        <input
          ref={bgFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            handleUploadCustomBg(e.target.files?.[0]);
            e.target.value = '';
          }}
          className="hidden"
          aria-label="Upload custom virtual camera background"
        />

        <div
          role="group"
          aria-label="Camera background mode"
          className="grid grid-cols-4 gap-1.5"
        >
          {VIRTUAL_BG_OPTIONS.map((opt) => {
            const active = fx.virtualBg === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-label={opt.ariaLabel ?? opt.label}
                aria-pressed={active}
                onClick={() => {
                  if (opt.id === 'custom' && !fx.customBgUrl) {
                    bgFileInputRef.current?.click();
                  } else {
                    updateEffects({ virtualBg: opt.id });
                  }
                }}
                className={`min-h-[38px] px-1 rounded-lg border text-[11px] font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 border-blue-500 text-blue-800 dark:bg-blue-600/20 dark:border-blue-500/70 dark:text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-950 hover:border-slate-300 dark:bg-[#171A22] dark:border-[#272B35] dark:text-slate-300 dark:hover:text-white dark:hover:border-[#373D4C]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Custom Background Image Upload / Preview Bar */}
        {(fx.virtualBg === 'custom' || fx.customBgUrl) && (
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-[#161922] border border-slate-200 dark:border-[#272B35]">
            <div className="flex items-center gap-2 min-w-0">
              {fx.customBgUrl ? (
                <img
                  src={fx.customBgUrl}
                  alt="Custom camera background"
                  className="w-10 h-7 rounded object-cover border border-slate-300 dark:border-white/15 shrink-0"
                />
              ) : (
                <div className="w-10 h-7 rounded bg-slate-200 dark:bg-[#222733] flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                  <ImagePlus className="w-3.5 h-3.5" />
                </div>
              )}
              <span className="text-[11px] text-slate-700 dark:text-slate-300 truncate">
                {fx.customBgUrl ? 'Custom photo' : 'Choose a photo'}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => bgFileInputRef.current?.click()}
                className="h-7 px-2 rounded bg-white hover:bg-slate-100 dark:bg-[#232836] dark:hover:bg-[#2C3344] border border-slate-300 dark:border-transparent text-[11px] font-medium text-slate-800 dark:text-white"
              >
                {fx.customBgUrl ? 'Change' : 'Upload'}
              </button>
              {fx.customBgUrl && (
                <button
                  type="button"
                  onClick={() =>
                    updateEffects({
                      customBgUrl: null,
                      virtualBg: fx.virtualBg === 'custom' ? 'none' : fx.virtualBg,
                    })
                  }
                  aria-label="Remove custom background photo"
                  className="w-7 h-7 rounded text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-500/10 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="h-px bg-slate-200 dark:bg-[#222630]" />

      {/* Bubble Shape */}
      <section className="space-y-2.5">
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide">
          Overlay Shape
        </h3>
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-[#1A1D24] border border-slate-200 dark:border-[#272B35]">
          {SHAPE_OPTIONS.map(({ id, label, icon: Icon }) => {
            const active = webcamConfig.shape === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChangeWebcam({ shape: id })}
                aria-pressed={active}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white dark:bg-[#282D3A] text-slate-900 dark:text-white shadow-xs dark:shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Auto-Center Face Tracking Toggle */}
        <button
          type="button"
          data-testid="webcam-autocenter-toggle"
          aria-pressed={webcamConfig.autoCenter}
          onClick={() => onChangeWebcam({ autoCenter: !webcamConfig.autoCenter })}
          className={`w-full flex items-center justify-between gap-2.5 p-2.5 rounded-lg border text-left transition-colors ${
            webcamConfig.autoCenter
              ? 'bg-blue-50 border-blue-500 text-blue-900 dark:bg-blue-600/15 dark:border-blue-500/60 dark:text-blue-100'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-[#171A22] dark:border-[#272B35] dark:text-slate-300 dark:hover:border-[#373D4C]'
          }`}
        >
          <div className="flex items-start gap-2 min-w-0">
            <Focus
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                webcamConfig.autoCenter
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold leading-tight">Auto-Center Face</div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                Keeps you centered inside circular or rectangular frames
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
              webcamConfig.autoCenter
                ? 'bg-blue-600 text-white'
                : 'bg-slate-200 text-slate-600 dark:bg-[#252A36] dark:text-slate-400'
            }`}
          >
            {webcamConfig.autoCenter ? 'On' : 'Off'}
          </span>
        </button>
      </section>

      {/* Size & Quick Presets */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="webcam-scale-slider"
            className="text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Overlay Size
          </label>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {scalePercent}%
          </span>
        </div>

        <input
          id="webcam-scale-slider"
          type="range"
          min={0.16}
          max={0.48}
          step={0.01}
          value={webcamConfig.scale}
          onChange={(e) => onChangeWebcam({ scale: parseFloat(e.target.value) })}
          className="w-full studio-slider"
        />

        <div className="grid grid-cols-3 gap-1.5">
          {SIZE_PRESETS.map((preset) => {
            const isNear = Math.abs(webcamConfig.scale - preset.value) < 0.025;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onChangeWebcam({ scale: preset.value })}
                className={`h-8 rounded-md text-xs font-medium border transition-colors ${
                  isNear
                    ? 'bg-blue-50 border-blue-500 text-blue-800 dark:bg-[#252A36] dark:border-blue-500/60 dark:text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 dark:bg-[#161920] dark:border-[#272B35] dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Snap-to-Corner Positioning */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide">
            Snap Position
          </h3>
          <span className="text-[11px] text-slate-500">Or drag on stage</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {CORNER_OPTIONS.map((corner) => (
            <button
              key={corner.id}
              type="button"
              onClick={() => handleSnapCorner(corner.id)}
              className="h-9 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-[#1A1D24] dark:hover:bg-[#232733] border border-slate-200 dark:border-[#272B35] text-xs font-medium text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white transition-colors text-left"
            >
              {corner.label}
            </button>
          ))}
        </div>
      </section>

      <div className="h-px bg-slate-200 dark:bg-[#222630]" />

      {/* Studio Camera FX */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Camera Studio FX
          </h3>
          <button
            type="button"
            disabled={fxIsDefault}
            onClick={() => updateEffects(DEFAULT_WEBCAM_EFFECTS)}
            className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 disabled:opacity-35 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset FX
          </button>
        </div>

        {/* Mirror & Low-Light Boost */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChangeWebcam({ mirror: !webcamConfig.mirror })}
            aria-pressed={webcamConfig.mirror}
            className={`flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
              webcamConfig.mirror
                ? 'bg-blue-50 border-blue-500 text-blue-800 dark:bg-[#252A36] dark:border-blue-500/60 dark:text-white'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 dark:bg-[#1A1D24] dark:border-[#272B35] dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <FlipHorizontal2 className="w-3.5 h-3.5" />
            Mirror
          </button>

          <button
            type="button"
            onClick={() => {
              const isOn = fx.lowLightBoost || (fx.lowLightLevel ?? 0) > 0;
              updateEffects({
                lowLightBoost: !isOn,
                lowLightLevel: isOn ? 0 : 60,
              });
            }}
            aria-pressed={fx.lowLightBoost || (fx.lowLightLevel ?? 0) > 0}
            className={`flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
              fx.lowLightBoost || (fx.lowLightLevel ?? 0) > 0
                ? 'bg-amber-50 border-amber-400 text-amber-800 dark:bg-amber-500/15 dark:border-amber-500/50 dark:text-amber-100'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 dark:bg-[#1A1D24] dark:border-[#272B35] dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            Low-Light
          </button>
        </div>

        {/* Adjustable Studio Low-Light Boost Slider (brighter lift up to +100%) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label
              htmlFor="cam-lowlight-slider"
              className="text-[11px] text-slate-600 dark:text-slate-400"
            >
              Low-light brightness boost
            </label>
            <span
              data-testid="lowlight-level-value"
              className="text-[11px] font-mono tabular-nums text-amber-700 dark:text-amber-200"
            >
              {(fx.lowLightLevel ?? 0) > 0 ? `+${fx.lowLightLevel}%` : 'Off'}
            </span>
          </div>
          <input
            id="cam-lowlight-slider"
            type="range"
            min={0}
            max={100}
            step={5}
            value={fx.lowLightLevel ?? 0}
            onChange={(e) => {
              const lvl = parseInt(e.target.value, 10);
              updateEffects({ lowLightLevel: lvl, lowLightBoost: lvl > 0 });
            }}
            className="w-full studio-slider"
          />
        </div>

        {/* Color Filter LUTs */}
        <div className="space-y-1.5">
          <span className="block text-[11px] text-slate-600 dark:text-slate-400">
            Color filter preset
          </span>
          <div
            role="group"
            aria-label="Camera color filter preset"
            className="grid grid-cols-3 gap-1"
          >
            {CAMERA_FILTER_PRESETS.map((preset) => {
              const active = fx.filterPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateEffects({ filterPreset: preset.id })}
                  className={`h-8 px-2 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap truncate ${
                    active
                      ? 'bg-blue-50 border-blue-500 text-blue-800 dark:bg-[#252A36] dark:border-blue-500/60 dark:text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 dark:bg-[#161920] dark:border-[#272B35] dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Skin Smoothing & Exposure Sliders */}
        <div className="space-y-2.5 pt-0.5">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="cam-touchup-slider"
                className="text-[11px] text-slate-600 dark:text-slate-400"
              >
                Touch-up smoothness
              </label>
              <span className="text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {fx.skinSmooth}%
              </span>
            </div>
            <input
              id="cam-touchup-slider"
              type="range"
              min={0}
              max={100}
              step={5}
              value={fx.skinSmooth}
              onChange={(e) => updateEffects({ skinSmooth: parseInt(e.target.value, 10) })}
              className="w-full studio-slider"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="cam-brightness-slider"
                className="text-[11px] text-slate-600 dark:text-slate-400"
              >
                Exposure
              </label>
              <span className="text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {fx.brightness}%
              </span>
            </div>
            <input
              id="cam-brightness-slider"
              type="range"
              min={70}
              max={180}
              step={1}
              value={fx.brightness}
              onChange={(e) => updateEffects({ brightness: parseInt(e.target.value, 10) })}
              className="w-full studio-slider"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="cam-contrast-slider"
                className="text-[11px] text-slate-600 dark:text-slate-400"
              >
                Contrast
              </label>
              <span className="text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {fx.contrast}%
              </span>
            </div>
            <input
              id="cam-contrast-slider"
              type="range"
              min={70}
              max={140}
              step={1}
              value={fx.contrast}
              onChange={(e) => updateEffects({ contrast: parseInt(e.target.value, 10) })}
              className="w-full studio-slider"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="cam-saturation-slider"
                className="text-[11px] text-slate-600 dark:text-slate-400"
              >
                Color vibrancy
              </label>
              <span className="text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {fx.saturation}%
              </span>
            </div>
            <input
              id="cam-saturation-slider"
              type="range"
              min={50}
              max={160}
              step={1}
              value={fx.saturation}
              onChange={(e) => updateEffects({ saturation: parseInt(e.target.value, 10) })}
              className="w-full studio-slider"
            />
          </div>
        </div>

        {/* Border style */}
        <div className="space-y-1.5 pt-1">
          <span className="block text-[11px] text-slate-600 dark:text-slate-400">Border ring</span>
          <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#1A1D24] border border-slate-200 dark:border-[#272B35]">
            {BORDER_OPTIONS.map((opt) => {
              const active = webcamConfig.borderStyle === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeWebcam({ borderStyle: opt.id })}
                  className={`py-1.5 rounded text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-white dark:bg-[#282D3A] text-slate-900 dark:text-white shadow-xs dark:shadow-none'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-center justify-between py-1 cursor-pointer">
          <span className="text-xs text-slate-700 dark:text-slate-300">Drop shadow</span>
          <input
            type="checkbox"
            checked={webcamConfig.shadow}
            onChange={(e) => onChangeWebcam({ shadow: e.target.checked })}
            className="accent-blue-600 dark:accent-blue-500 w-4 h-4 cursor-pointer"
          />
        </label>
      </section>
    </div>
  );
};
