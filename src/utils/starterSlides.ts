import type { BackdropPreset, SlideItem } from '../types/studio';

export const BACKDROP_PRESETS: BackdropPreset[] = [
  {
    id: 'obsidian-studio',
    name: 'Obsidian Studio',
    category: 'studio',
    previewCss: 'radial-gradient(circle at 22% 18%, #262c3a 0%, #101218 58%, #090a0d 100%)',
    colors: ['#161922', '#090a0d'],
    radialSpot: { x: 0.22, y: 0.18, color: 'rgba(59, 130, 246, 0.16)' },
  },
  {
    id: 'slate-depth',
    name: 'Slate Horizon',
    category: 'gradient',
    previewCss: 'linear-gradient(135deg, #1e293b 0%, #0f172a 55%, #090d16 100%)',
    colors: ['#1e293b', '#0f172a', '#090d16'],
    angle: 135,
  },
  {
    id: 'nordic-mist',
    name: 'Nordic Mist',
    category: 'gradient',
    previewCss: 'linear-gradient(135deg, #2b3544 0%, #1b2430 50%, #121821 100%)',
    colors: ['#2b3544', '#1b2430', '#121821'],
    angle: 135,
  },
  {
    id: 'amber-dusk',
    name: 'Warm Graphite',
    category: 'studio',
    previewCss: 'radial-gradient(circle at 78% 24%, #3d2c24 0%, #171416 62%, #0c0b0d 100%)',
    colors: ['#1b1615', '#0c0b0d'],
    radialSpot: { x: 0.78, y: 0.24, color: 'rgba(217, 119, 6, 0.18)' },
  },
  {
    id: 'emerald-pine',
    name: 'Forest Slate',
    category: 'studio',
    previewCss: 'radial-gradient(circle at 20% 80%, #16332c 0%, #0f1918 56%, #0a0f0f 100%)',
    colors: ['#101c1a', '#0a0f0f'],
    radialSpot: { x: 0.2, y: 0.8, color: 'rgba(16, 185, 129, 0.16)' },
  },
  {
    id: 'coastal-blue',
    name: 'Cobalt Dusk',
    category: 'gradient',
    previewCss: 'linear-gradient(135deg, #172554 0%, #1e1b4b 55%, #0f172a 100%)',
    colors: ['#172554', '#1e1b4b', '#0f172a'],
    angle: 135,
  },
  {
    id: 'matte-charcoal',
    name: 'Matte Charcoal',
    category: 'solid',
    previewCss: '#14161b',
    colors: ['#14161b'],
  },
  {
    id: 'paper-stone',
    name: 'Gallery Stone',
    category: 'solid',
    previewCss: '#e4e7ec',
    colors: ['#e4e7ec'],
  },
];

export const DEFAULT_TELEPROMPTER_SCRIPT = `Welcome everyone — today we're walking through the Q4 product architecture and launch milestones.

First, let's look at why we rebuilt our real-time media pipeline from the ground up. Latency dropped by 62% while keeping CPU overhead low across desktop browsers.

On slide two, notice how the three core layers stay completely decoupled: capture sources, real-time compositing, and client-side encoding.

Moving to slide three, our beta cohort recorded over 14,000 sessions with a 99.4% completion rate and zero server-side processing costs.

To wrap up on the final slide, here are our three next steps before general availability next month. Thank you for watching — let's dive into questions.`;

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * Generates crisp, self-contained starter presentation slides rendered locally on canvas
 * so the studio stage works immediately without external image dependencies.
 */
export function createStarterSlides(): SlideItem[] {
  if (typeof document === 'undefined') {
    return [];
  }

  const width = 1600;
  const height = 900;

  const renderSlide = (
    id: string,
    title: string,
    painter: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  ): SlideItem => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      painter(ctx, width, height);
    }
    return {
      id,
      title,
      dataUrl: canvas.toDataURL('image/png'),
      width,
      height,
      sourceType: 'starter',
    };
  };

  return [
    renderSlide('starter-1', '01. Q4 Product Launch', (ctx, w, h) => {
      // Clean dark editorial cover slide
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#14171f');
      bg.addColorStop(1, '#0d0f14');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Subtle architectural grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      for (let x = 160; x < w; x += 160) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 150; y < h; y += 150) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Subtle accent glow top-right
      const spot = ctx.createRadialGradient(w * 0.8, h * 0.2, 20, w * 0.8, h * 0.2, 460);
      spot.addColorStop(0, 'rgba(59, 130, 246, 0.22)');
      spot.addColorStop(1, 'rgba(59, 130, 246, 0)');
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, w, h);

      // Kicker
      ctx.fillStyle = '#93c5fd';
      ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Q4 KEYNOTE BRIEFING  ·  PRODUCT ENGINEERING', 110, 170);

      // Main headline
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 84px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Next-Generation', 110, 310);
      ctx.fillText('Media Workflows', 110, 410);

      // Subtitle
      ctx.fillStyle = '#94a3b8';
      ctx.font = '400 32px "DM Sans", sans-serif';
      ctx.fillText(
        'Zero-latency browser compositing, adaptive framing, and instant local export.',
        110,
        495
      );

      // Bottom hairline + metadata
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(110, 740);
      ctx.lineTo(w - 110, 740);
      ctx.stroke();

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '500 24px "DM Sans", sans-serif';
      ctx.fillText('Presented by Product Engineering', 110, 795);
      ctx.fillStyle = '#64748b';
      ctx.font = '500 22px "JetBrains Mono", monospace';
      ctx.fillText('01 / 04', w - 210, 795);
    }),

    renderSlide('starter-2', '02. System Architecture', (ctx, w, h) => {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#475569';
      ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('02. ARCHITECTURE', 100, 110);

      ctx.fillStyle = '#0f172a';
      ctx.font = '700 56px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Three-Stage Real-Time Pipeline', 100, 185);

      const cards = [
        {
          step: 'Stage 01',
          title: 'Multi-Source Capture',
          desc: 'Synchronizes 1080p screen capture, PDF slide decks, and live camera feeds.',
          accent: '#2563eb',
        },
        {
          step: 'Stage 02',
          title: 'Canvas Compositor',
          desc: '60fps frame blending with dynamic aspect ratios, masks, and backdrop themes.',
          accent: '#0f766e',
        },
        {
          step: 'Stage 03',
          title: 'Local Media Encoder',
          desc: 'Hardware-accelerated WebM/MP4 encoding with non-destructive trim preview.',
          accent: '#c2410c',
        },
      ];

      cards.forEach((card, i) => {
        const cardW = 430;
        const cardH = 440;
        const x = 100 + i * (cardW + 55);
        const y = 270;

        drawRoundedRectPath(ctx, x, y, cardW, cardH, 22);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Top color bar
        drawRoundedRectPath(ctx, x + 36, y + 40, 52, 8, 4);
        ctx.fillStyle = card.accent;
        ctx.fill();

        ctx.fillStyle = '#64748b';
        ctx.font = '600 20px "JetBrains Mono", monospace';
        ctx.fillText(card.step, x + 36, y + 96);

        ctx.fillStyle = '#0f172a';
        ctx.font = '700 32px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(card.title, x + 36, y + 152);

        // Wrapped body copy
        ctx.fillStyle = '#475569';
        ctx.font = '400 24px "DM Sans", sans-serif';
        const words = card.desc.split(' ');
        let line = '';
        let ly = y + 215;
        for (const word of words) {
          const testLine = line ? `${line} ${word}` : word;
          if (ctx.measureText(testLine).width > cardW - 72) {
            ctx.fillText(line, x + 36, ly);
            line = word;
            ly += 38;
          } else {
            line = testLine;
          }
        }
        if (line) ctx.fillText(line, x + 36, ly);
      });

      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 22px "JetBrains Mono", monospace';
      ctx.fillText('02 / 04', w - 200, 820);
    }),

    renderSlide('starter-3', '03. Beta Performance', (ctx, w, h) => {
      ctx.fillStyle = '#111319';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('03. MEASURED OUTCOMES', 100, 115);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 54px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Q3 Beta Cohort Benchmarks', 100, 188);

      const metrics = [
        { value: '-62%', label: 'Frame Compositing Latency', detail: 'Down from 28ms to 10.6ms median' },
        { value: '14.2k', label: 'Recorded Sessions', detail: 'Across Chrome, Edge, and Safari' },
        { value: '99.4%', label: 'Export Completion', detail: 'Zero cloud transcode failures' },
      ];

      metrics.forEach((m, i) => {
        const colW = 435;
        const x = 100 + i * (colW + 48);
        const y = 270;

        drawRoundedRectPath(ctx, x, y, colW, 250, 18);
        ctx.fillStyle = '#181b24';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#60a5fa';
        ctx.font = '700 72px "JetBrains Mono", monospace';
        ctx.fillText(m.value, x + 36, y + 115);

        ctx.fillStyle = '#f1f5f9';
        ctx.font = '600 26px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(m.label, x + 36, y + 170);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 21px "DM Sans", sans-serif';
        ctx.fillText(m.detail, x + 36, y + 210);
      });

      // Simple clean bar chart strip along bottom
      const bars = [
        { label: 'Jul', pct: 0.42 },
        { label: 'Aug', pct: 0.64 },
        { label: 'Sep', pct: 0.81 },
        { label: 'Oct', pct: 0.96 },
      ];
      const chartY = 590;
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Weekly Active Studio Creators', 100, chartY + 24);

      bars.forEach((b, i) => {
        const bx = 100 + i * 355;
        const barW = 310;
        drawRoundedRectPath(ctx, bx, chartY + 58, barW, 28, 8);
        ctx.fillStyle = '#1e2430';
        ctx.fill();

        drawRoundedRectPath(ctx, bx, chartY + 58, Math.round(barW * b.pct), 28, 8);
        ctx.fillStyle = i === 3 ? '#3b82f6' : '#475569';
        ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 20px "JetBrains Mono", monospace';
        ctx.fillText(`${b.label}  ·  ${Math.round(b.pct * 100)}%`, bx, chartY + 122);
      });

      ctx.fillStyle = '#64748b';
      ctx.font = '500 22px "JetBrains Mono", monospace';
      ctx.fillText('03 / 04', w - 200, 825);
    }),

    renderSlide('starter-4', '04. Next Steps & Roadmap', (ctx, w, h) => {
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#f1f5f9');
      bg.addColorStop(1, '#e2e8f0');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#334155';
      ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('04. LAUNCH ROADMAP', 110, 125);

      ctx.fillStyle = '#0f172a';
      ctx.font = '700 62px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Path to General Availability', 110, 210);

      const items = [
        ['01', 'Finalize Multi-Track Audio Mixing', 'Combine microphone narration with desktop presentation audio cleanly.'],
        ['02', 'Ship Instant Trim & Aspect Export', 'One-click vertical 9:16 and square 1:1 exports for social distribution.'],
        ['03', 'Roll Out Team Slide Templates', 'Shared brand backdrops and presenter script presets for distributed teams.'],
      ];

      items.forEach(([num, heading, body], i) => {
        const y = 300 + i * 155;
        ctx.fillStyle = '#2563eb';
        ctx.font = '700 32px "JetBrains Mono", monospace';
        ctx.fillText(num, 110, y + 36);

        ctx.fillStyle = '#0f172a';
        ctx.font = '700 32px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(heading, 195, y + 36);

        ctx.fillStyle = '#475569';
        ctx.font = '400 25px "DM Sans", sans-serif';
        ctx.fillText(body, 195, y + 80);

        if (i < items.length - 1) {
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.1)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(110, y + 118);
          ctx.lineTo(w - 110, y + 118);
          ctx.stroke();
        }
      });

      ctx.fillStyle = '#64748b';
      ctx.font = '500 22px "JetBrains Mono", monospace';
      ctx.fillText('04 / 04', w - 200, 825);
    }),
  ];
}
