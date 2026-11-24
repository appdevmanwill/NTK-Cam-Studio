import JSZip from 'jszip';
import type { SlideItem } from '../types/studio';
import {
  collectText,
  findDescendant,
  findDescendants,
  getChild,
  getChildren,
  isDarkCssColor,
  parseXml,
  resolveColorContainer,
  type XmlNode,
} from './pptxXml';

export interface PptxGradientStop {
  pos: number; // 0..1
  color: string;
}

export type PptxFill =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; angleDeg: number; stops: PptxGradientStop[]; radial?: boolean }
  | { kind: 'image'; mimeType: string; base64: string }
  | { kind: 'none' };

export interface PptxTextRun {
  text: string;
  fontSizePt: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  isBreak?: boolean;
}

export interface PptxParagraph {
  runs: PptxTextRun[];
  align: 'left' | 'center' | 'right';
  bulletChar?: string;
  level: number;
  spaceBeforePt: number;
  spaceAfterPt: number;
}

export interface PptxTransform {
  x: number; // normalized 0..1
  y: number;
  w: number;
  h: number;
  rotDeg?: number;
  flipH?: boolean;
  flipV?: boolean;
}

export interface PptxShapeElement {
  kind: 'shape';
  transform: PptxTransform;
  geom: string;
  cornerRadiusFactor?: number;
  fill?: PptxFill;
  strokeColor?: string;
  strokeWidthPt?: number;
  isConnector?: boolean;
  verticalAnchor: 'top' | 'middle' | 'bottom';
  insetsPt: { l: number; t: number; r: number; b: number };
  paragraphs: PptxParagraph[];
}

export interface PptxImageElement {
  kind: 'image';
  transform: PptxTransform;
  mediaPath: string;
  mimeType: string;
  base64: string;
  crop?: { l: number; t: number; r: number; b: number }; // 0..1 fractions
  geom?: string;
  strokeColor?: string;
  strokeWidthPt?: number;
}

export interface PptxTableCell {
  text: string;
  paragraphs: PptxParagraph[];
  fill?: PptxFill;
  borderColor?: string;
  verticalAnchor: 'top' | 'middle' | 'bottom';
}

export interface PptxTableElement {
  kind: 'table';
  transform: PptxTransform;
  colFractions: number[];
  rowFractions: number[];
  rows: PptxTableCell[][];
}

export type PptxElement = PptxShapeElement | PptxImageElement | PptxTableElement;

export interface ParsedPptxSlide {
  index: number;
  title: string;
  background: PptxFill;
  backgroundColor: string; // representative solid fallback color
  elements: PptxElement[];
  notes: string;
}

export interface ParsedPptxDeck {
  slideWidthEmu: number;
  slideHeightEmu: number;
  slides: ParsedPptxSlide[];
}

const DEFAULT_SLIDE_W_EMU = 12192000;
const DEFAULT_SLIDE_H_EMU = 6858000;

const DEFAULT_SCHEME_COLORS: Record<string, string> = {
  dk1: '#000000',
  lt1: '#FFFFFF',
  dk2: '#1F2937',
  lt2: '#E5E7EB',
  accent1: '#2563EB',
  accent2: '#EA580C',
  accent3: '#64748B',
  accent4: '#D97706',
  accent5: '#0284C7',
  accent6: '#16A34A',
  hlink: '#2563EB',
  folHlink: '#7C3AED',
};

const DEFAULT_COLOR_MAP: Record<string, string> = {
  bg1: 'lt1',
  tx1: 'dk1',
  bg2: 'lt2',
  tx2: 'dk2',
  accent1: 'accent1',
  accent2: 'accent2',
  accent3: 'accent3',
  accent4: 'accent4',
  accent5: 'accent5',
  accent6: 'accent6',
  hlink: 'hlink',
  folHlink: 'folHlink',
};

interface ThemeData {
  colors: Record<string, string>;
  majorFont: string;
  minorFont: string;
  fillStyleNodes: XmlNode[];
  bgFillStyleNodes: XmlNode[];
  lineStyleNodes: XmlNode[];
}

interface PlaceholderStyleDefaults {
  transform?: PptxTransform;
  geom?: string;
  fontSizePt?: number;
  bold?: boolean;
  color?: string;
  align?: 'left' | 'center' | 'right';
  verticalAnchor?: 'top' | 'middle' | 'bottom';
  fontFamily?: string;
}

interface TextStyleLevel {
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: 'left' | 'center' | 'right';
  bulletChar?: string;
  fontFamily?: string;
}

interface MasterTextStyles {
  title: Record<number, TextStyleLevel>;
  body: Record<number, TextStyleLevel>;
  other: Record<number, TextStyleLevel>;
}

interface RawTransformEmu {
  x: number;
  y: number;
  cx: number;
  cy: number;
  rotDeg: number;
  flipH: boolean;
  flipV: boolean;
}

interface GroupTransformContext {
  // Maps child EMU coordinates into slide EMU coordinates
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

const IDENTITY_GROUP: GroupTransformContext = {
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
};

function resolveRelativeZipPath(baseDir: string, target: string): string {
  const cleanTarget = target.replace(/\\/g, '/');
  if (cleanTarget.startsWith('/')) {
    return cleanTarget.slice(1);
  }
  const parts = (baseDir ? `${baseDir}/${cleanTarget}` : cleanTarget).split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

function dirOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function fileNameOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

function guessMimeType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'image/png';
}

function parseRelsMap(relsXml: string | null): Map<string, { target: string; type: string }> {
  const map = new Map<string, { target: string; type: string }>();
  if (!relsXml) return map;
  const doc = parseXml(relsXml);
  const rels = findDescendants(doc, 'Relationship');
  for (const rel of rels) {
    const id = rel.attrs.Id;
    const target = rel.attrs.Target;
    const type = rel.attrs.Type ?? '';
    if (id && target) {
      map.set(id, { target, type });
    }
  }
  return map;
}

async function readRelsFor(
  zip: JSZip,
  partPath: string
): Promise<Map<string, { target: string; type: string }>> {
  const relsPath = `${dirOf(partPath)}/_rels/${fileNameOf(partPath)}.rels`;
  const xml = await zip.file(relsPath)?.async('string');
  return parseRelsMap(xml ?? null);
}

function parseThemeXml(themeXml: string | null): ThemeData {
  const colors: Record<string, string> = { ...DEFAULT_SCHEME_COLORS };
  let majorFont = 'Plus Jakarta Sans';
  let minorFont = 'DM Sans';
  let fillStyleNodes: XmlNode[] = [];
  let bgFillStyleNodes: XmlNode[] = [];
  let lineStyleNodes: XmlNode[] = [];

  if (!themeXml) {
    return { colors, majorFont, minorFont, fillStyleNodes, bgFillStyleNodes, lineStyleNodes };
  }

  const doc = parseXml(themeXml);
  const clrScheme = findDescendant(doc, 'clrScheme');
  if (clrScheme) {
    for (const child of clrScheme.children) {
      const srgb = getChild(child, 'srgbClr');
      const sys = getChild(child, 'sysClr');
      const hex = srgb?.attrs.val ?? sys?.attrs.lastClr;
      if (hex) {
        colors[child.localName] = `#${hex}`;
      }
    }
  }

  const fontScheme = findDescendant(doc, 'fontScheme');
  if (fontScheme) {
    const majorLatin = getChild(getChild(fontScheme, 'majorFont'), 'latin')?.attrs.typeface;
    const minorLatin = getChild(getChild(fontScheme, 'minorFont'), 'latin')?.attrs.typeface;
    if (majorLatin && !majorLatin.startsWith('+')) majorFont = majorLatin;
    if (minorLatin && !minorLatin.startsWith('+')) minorFont = minorLatin;
  }

  const fmtScheme = findDescendant(doc, 'fmtScheme');
  if (fmtScheme) {
    fillStyleNodes = getChild(fmtScheme, 'fillStyleLst')?.children ?? [];
    bgFillStyleNodes = getChild(fmtScheme, 'bgFillStyleLst')?.children ?? [];
    lineStyleNodes = getChild(fmtScheme, 'lnStyleLst')?.children ?? [];
  }

  return { colors, majorFont, minorFont, fillStyleNodes, bgFillStyleNodes, lineStyleNodes };
}

function parseColorMap(node: XmlNode | undefined, base: Record<string, string>): Record<string, string> {
  if (!node) return { ...base };
  const merged = { ...base };
  for (const key of Object.keys(DEFAULT_COLOR_MAP)) {
    if (node.attrs[key]) {
      merged[key] = node.attrs[key];
    }
  }
  return merged;
}

function resolveFontName(raw: string | undefined, theme: ThemeData, fallback: string): string {
  if (!raw) return fallback;
  if (raw.startsWith('+mj')) return `"${theme.majorFont}", "Plus Jakarta Sans", sans-serif`;
  if (raw.startsWith('+mn')) return `"${theme.minorFont}", "DM Sans", sans-serif`;
  return `"${raw}", "DM Sans", sans-serif`;
}

async function resolveFillNode(
  fillContainer: XmlNode | undefined,
  zip: JSZip,
  partDir: string,
  rels: Map<string, { target: string; type: string }>,
  theme: ThemeData,
  colorMap: Record<string, string>,
  phClrOverride?: string
): Promise<PptxFill | undefined> {
  if (!fillContainer) return undefined;

  // Handle when caller passed the fill node itself (e.g. from theme fillStyleLst)
  const directKind = fillContainer.localName;
  const noFill = directKind === 'noFill' ? fillContainer : getChild(fillContainer, 'noFill');
  if (noFill) return { kind: 'none' };

  const solidFill =
    directKind === 'solidFill' ? fillContainer : getChild(fillContainer, 'solidFill');
  if (solidFill) {
    const color = resolveColorContainer(solidFill, theme.colors, colorMap, phClrOverride);
    if (color) return { kind: 'solid', color };
  }

  const gradFill = directKind === 'gradFill' ? fillContainer : getChild(fillContainer, 'gradFill');
  if (gradFill) {
    const gsLst = getChild(gradFill, 'gsLst');
    const stops: PptxGradientStop[] = [];
    for (const gs of getChildren(gsLst, 'gs')) {
      const pos = Math.max(0, Math.min(1, Number(gs.attrs.pos ?? 0) / 100000));
      const color = resolveColorContainer(gs, theme.colors, colorMap, phClrOverride);
      if (color) stops.push({ pos, color });
    }
    stops.sort((a, b) => a.pos - b.pos);
    const lin = getChild(gradFill, 'lin');
    const path = getChild(gradFill, 'path');
    // OOXML lin angle is in 60,000ths of a degree clockwise from left->right (0deg)
    const angleDeg = lin?.attrs.ang ? Number(lin.attrs.ang) / 60000 : 90;
    if (stops.length >= 2) {
      return { kind: 'gradient', angleDeg, stops, radial: Boolean(path) };
    }
    if (stops.length === 1) {
      return { kind: 'solid', color: stops[0].color };
    }
  }

  const blipFill = directKind === 'blipFill' ? fillContainer : getChild(fillContainer, 'blipFill');
  if (blipFill) {
    const blip = getChild(blipFill, 'blip');
    const embedId = blip?.attrs['r:embed'] ?? blip?.attrs.embed;
    if (embedId) {
      const rel = rels.get(embedId);
      if (rel) {
        const mediaPath = resolveRelativeZipPath(partDir, rel.target);
        const file = zip.file(mediaPath);
        if (file) {
          const base64 = await file.async('base64');
          return { kind: 'image', mimeType: guessMimeType(mediaPath), base64 };
        }
      }
    }
  }

  return undefined;
}

async function resolveBackgroundFromPart(
  cSld: XmlNode | undefined,
  zip: JSZip,
  partDir: string,
  rels: Map<string, { target: string; type: string }>,
  theme: ThemeData,
  colorMap: Record<string, string>
): Promise<PptxFill | undefined> {
  const bg = getChild(cSld, 'bg');
  if (!bg) return undefined;

  const bgPr = getChild(bg, 'bgPr');
  if (bgPr) {
    const resolved = await resolveFillNode(bgPr, zip, partDir, rels, theme, colorMap);
    if (resolved && resolved.kind !== 'none') return resolved;
  }

  const bgRef = getChild(bg, 'bgRef');
  if (bgRef) {
    const idx = Number(bgRef.attrs.idx ?? 0);
    const phClr = resolveColorContainer(bgRef, theme.colors, colorMap);
    if (idx >= 1001) {
      const styleNode = theme.bgFillStyleNodes[idx - 1001];
      if (styleNode) {
        const fromTheme = await resolveFillNode(
          styleNode,
          zip,
          partDir,
          rels,
          theme,
          colorMap,
          phClr
        );
        if (fromTheme && fromTheme.kind !== 'none') return fromTheme;
      }
    } else if (idx >= 1 && idx <= theme.fillStyleNodes.length) {
      const styleNode = theme.fillStyleNodes[idx - 1];
      if (styleNode) {
        const fromTheme = await resolveFillNode(
          styleNode,
          zip,
          partDir,
          rels,
          theme,
          colorMap,
          phClr
        );
        if (fromTheme && fromTheme.kind !== 'none') return fromTheme;
      }
    }
    if (phClr) {
      return { kind: 'solid', color: phClr };
    }
  }

  return undefined;
}

function representativeBackgroundColor(fill: PptxFill): string {
  if (fill.kind === 'solid') return fill.color;
  if (fill.kind === 'gradient' && fill.stops.length > 0) return fill.stops[0].color;
  return '#FFFFFF';
}

function readRawTransform(container: XmlNode | undefined): RawTransformEmu | null {
  if (!container) return null;
  const xfrm = getChild(container, 'xfrm');
  if (!xfrm) return null;
  const off = getChild(xfrm, 'off');
  const ext = getChild(xfrm, 'ext');
  if (!off || !ext) return null;

  const x = Number(off.attrs.x ?? 0);
  const y = Number(off.attrs.y ?? 0);
  const cx = Number(ext.attrs.cx ?? 0);
  const cy = Number(ext.attrs.cy ?? 0);
  if (cx < 0 || cy < 0 || (cx === 0 && cy === 0)) return null;

  const rotDeg = xfrm.attrs.rot ? Number(xfrm.attrs.rot) / 60000 : 0;
  return {
    x,
    y,
    cx,
    cy,
    rotDeg,
    flipH: xfrm.attrs.flipH === '1' || xfrm.attrs.flipH === 'true',
    flipV: xfrm.attrs.flipV === '1' || xfrm.attrs.flipV === 'true',
  };
}

function applyGroupTransform(
  raw: RawTransformEmu,
  groupCtx: GroupTransformContext,
  slideW: number,
  slideH: number
): PptxTransform {
  const gx = groupCtx.offsetX + raw.x * groupCtx.scaleX;
  const gy = groupCtx.offsetY + raw.y * groupCtx.scaleY;
  const gw = raw.cx * groupCtx.scaleX;
  const gh = raw.cy * groupCtx.scaleY;

  return {
    x: gx / slideW,
    y: gy / slideH,
    w: gw / slideW,
    h: gh / slideH,
    rotDeg: raw.rotDeg || undefined,
    flipH: raw.flipH || undefined,
    flipV: raw.flipV || undefined,
  };
}

function parseStyleLevels(
  styleContainer: XmlNode | undefined,
  theme: ThemeData,
  colorMap: Record<string, string>
): Record<number, TextStyleLevel> {
  const map: Record<number, TextStyleLevel> = {};
  if (!styleContainer) return map;

  for (let lvl = 1; lvl <= 9; lvl++) {
    const pPr = getChild(styleContainer, `lvl${lvl}pPr`);
    if (!pPr) continue;
    const defRPr = getChild(pPr, 'defRPr');
    const algn = pPr.attrs.algn;
    const align: 'left' | 'center' | 'right' | undefined =
      algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'l' ? 'left' : undefined;

    const buChar = getChild(pPr, 'buChar')?.attrs.char;
    const buNone = Boolean(getChild(pPr, 'buNone'));

    const sz = defRPr?.attrs.sz ? Number(defRPr.attrs.sz) / 100 : undefined;
    const bold =
      defRPr?.attrs.b === '1' || defRPr?.attrs.b === 'true'
        ? true
        : defRPr?.attrs.b === '0'
          ? false
          : undefined;
    const italic =
      defRPr?.attrs.i === '1' || defRPr?.attrs.i === 'true' ? true : undefined;

    const solidFill = getChild(defRPr, 'solidFill');
    const color = resolveColorContainer(solidFill, theme.colors, colorMap);
    const latin = getChild(defRPr, 'latin')?.attrs.typeface;

    map[lvl - 1] = {
      fontSizePt: sz,
      bold,
      italic,
      color,
      align,
      bulletChar: buNone ? '' : buChar,
      fontFamily: latin ? resolveFontName(latin, theme, theme.minorFont) : undefined,
    };
  }
  return map;
}

function parseMasterTextStyles(
  masterDoc: XmlNode | undefined,
  theme: ThemeData,
  colorMap: Record<string, string>
): MasterTextStyles {
  const txStyles = findDescendant(masterDoc, 'txStyles');
  return {
    title: parseStyleLevels(getChild(txStyles, 'titleStyle'), theme, colorMap),
    body: parseStyleLevels(getChild(txStyles, 'bodyStyle'), theme, colorMap),
    other: parseStyleLevels(getChild(txStyles, 'otherStyle'), theme, colorMap),
  };
}

function collectPlaceholderMap(
  spTree: XmlNode | undefined,
  slideW: number,
  slideH: number,
  theme: ThemeData,
  colorMap: Record<string, string>
): Map<string, PlaceholderStyleDefaults> {
  const map = new Map<string, PlaceholderStyleDefaults>();
  if (!spTree) return map;

  for (const sp of getChildren(spTree, 'sp')) {
    const nvSpPr = getChild(sp, 'nvSpPr');
    const nvPr = getChild(nvSpPr, 'nvPr');
    const ph = getChild(nvPr, 'ph');
    if (!ph) continue;

    const type = ph.attrs.type ?? 'body';
    const idx = ph.attrs.idx;
    const spPr = getChild(sp, 'spPr');
    const rawXfrm = readRawTransform(spPr);
    const transform = rawXfrm ? applyGroupTransform(rawXfrm, IDENTITY_GROUP, slideW, slideH) : undefined;
    const geom = getChild(spPr, 'prstGeom')?.attrs.prst;

    const txBody = getChild(sp, 'txBody');
    const bodyPr = getChild(txBody, 'bodyPr');
    const anchorAttr = bodyPr?.attrs.anchor;
    const verticalAnchor: 'top' | 'middle' | 'bottom' | undefined =
      anchorAttr === 'ctr' ? 'middle' : anchorAttr === 'b' ? 'bottom' : anchorAttr === 't' ? 'top' : undefined;

    const lstStyle = getChild(txBody, 'lstStyle');
    const lvl0 = parseStyleLevels(lstStyle, theme, colorMap)[0];

    const entry: PlaceholderStyleDefaults = {
      transform,
      geom,
      fontSizePt: lvl0?.fontSizePt,
      bold: lvl0?.bold,
      color: lvl0?.color,
      align: lvl0?.align,
      verticalAnchor,
      fontFamily: lvl0?.fontFamily,
    };

    if (idx !== undefined) {
      map.set(`idx:${idx}`, entry);
    }
    if (!map.has(`type:${type}`)) {
      map.set(`type:${type}`, entry);
    }
  }

  return map;
}

function parseParagraphsFromTxBody(
  txBody: XmlNode | undefined,
  theme: ThemeData,
  colorMap: Record<string, string>,
  fallbackColor: string,
  styleDefaults: {
    fontSizePt: number;
    bold: boolean;
    fontFamily: string;
    align: 'left' | 'center' | 'right';
    levels?: Record<number, TextStyleLevel>;
    fontScale?: number;
  }
): PptxParagraph[] {
  if (!txBody) return [];

  const fontScale = styleDefaults.fontScale ?? 1;
  const lstStyle = getChild(txBody, 'lstStyle');
  const localLevels = parseStyleLevels(lstStyle, theme, colorMap);
  const pNodes = getChildren(txBody, 'p');
  const rawParagraphs: Array<{ para: PptxParagraph; isEmpty: boolean }> = [];

  for (const pNode of pNodes) {
    const pPr = getChild(pNode, 'pPr');
    const level = Math.max(0, Math.min(8, Number(pPr?.attrs.lvl ?? 0)));
    const inheritedLvl = styleDefaults.levels?.[level] ?? styleDefaults.levels?.[0];
    const localLvl = localLevels[level] ?? localLevels[0];

    const algnAttr = pPr?.attrs.algn;
    const align: 'left' | 'center' | 'right' =
      algnAttr === 'ctr'
        ? 'center'
        : algnAttr === 'r'
          ? 'right'
          : algnAttr === 'l'
            ? 'left'
            : localLvl?.align ?? inheritedLvl?.align ?? styleDefaults.align;

    const buNone = Boolean(getChild(pPr, 'buNone'));
    const buCharNode = getChild(pPr, 'buChar');
    const buAutoNum = getChild(pPr, 'buAutoNum');
    let bulletChar: string | undefined;
    if (!buNone) {
      if (buCharNode?.attrs.char) {
        bulletChar = buCharNode.attrs.char;
      } else if (buAutoNum) {
        bulletChar = '•';
      } else if (localLvl?.bulletChar) {
        bulletChar = localLvl.bulletChar;
      } else if (inheritedLvl?.bulletChar) {
        bulletChar = inheritedLvl.bulletChar;
      }
    }

    const spcBefPts = getChild(getChild(pPr, 'spcBef'), 'spcPts')?.attrs.val;
    const spcAftPts = getChild(getChild(pPr, 'spcAft'), 'spcPts')?.attrs.val;
    const spaceBeforePt = spcBefPts ? Number(spcBefPts) / 100 : 0;
    const spaceAfterPt = spcAftPts ? Number(spcAftPts) / 100 : 4;

    const pDefRPr = getChild(pPr, 'defRPr');
    const pBaseFontSize = pDefRPr?.attrs.sz
      ? Number(pDefRPr.attrs.sz) / 100
      : localLvl?.fontSizePt ?? inheritedLvl?.fontSizePt ?? styleDefaults.fontSizePt;
    const pBaseColor =
      resolveColorContainer(getChild(pDefRPr, 'solidFill'), theme.colors, colorMap) ??
      localLvl?.color ??
      inheritedLvl?.color ??
      fallbackColor;
    const pBaseBold =
      pDefRPr?.attrs.b === '1'
        ? true
        : pDefRPr?.attrs.b === '0'
          ? false
          : localLvl?.bold ?? inheritedLvl?.bold ?? styleDefaults.bold;
    const pBaseFont = resolveFontName(
      getChild(pDefRPr, 'latin')?.attrs.typeface,
      theme,
      localLvl?.fontFamily ?? inheritedLvl?.fontFamily ?? styleDefaults.fontFamily
    );

    const runs: PptxTextRun[] = [];
    for (const child of pNode.children) {
      if (child.localName === 'br') {
        runs.push({
          text: '\n',
          fontSizePt: pBaseFontSize,
          fontFamily: pBaseFont,
          bold: pBaseBold,
          italic: false,
          underline: false,
          color: pBaseColor,
          isBreak: true,
        });
        continue;
      }

      if (child.localName !== 'r' && child.localName !== 'fld') continue;

      const tNode = getChild(child, 't');
      const runText = tNode ? collectText(tNode) : '';
      if (!runText) continue;

      const rPr = getChild(child, 'rPr');
      const rawSizePt = rPr?.attrs.sz ? Number(rPr.attrs.sz) / 100 : pBaseFontSize;
      const fontSizePt = Math.max(7, Math.min(96, rawSizePt * fontScale));
      const bold =
        rPr?.attrs.b === '1' || rPr?.attrs.b === 'true'
          ? true
          : rPr?.attrs.b === '0' || rPr?.attrs.b === 'false'
            ? false
            : pBaseBold;
      const italic = rPr?.attrs.i === '1' || rPr?.attrs.i === 'true';
      const underline = Boolean(rPr?.attrs.u && rPr.attrs.u !== 'none');

      const runSolid = getChild(rPr, 'solidFill');
      const color =
        resolveColorContainer(runSolid, theme.colors, colorMap) ?? pBaseColor;
      const fontFamily = resolveFontName(
        getChild(rPr, 'latin')?.attrs.typeface,
        theme,
        pBaseFont
      );

      runs.push({
        text: runText,
        fontSizePt,
        fontFamily,
        bold,
        italic,
        underline,
        color,
      });
    }

    const hasContent = runs.length > 0 && runs.some((r) => r.text.trim().length > 0);
    if (hasContent) {
      rawParagraphs.push({
        isEmpty: false,
        para: {
          runs,
          align,
          bulletChar,
          level,
          spaceBeforePt,
          spaceAfterPt,
        },
      });
    } else {
      // Capture intentional blank spacer paragraphs (e.g. Enter key between title and body)
      const endParaRPr = getChild(pNode, 'endParaRPr');
      const spacerSize = endParaRPr?.attrs.sz
        ? Math.max(7, (Number(endParaRPr.attrs.sz) / 100) * fontScale)
        : Math.max(8, pBaseFontSize * fontScale * 0.7);
      rawParagraphs.push({
        isEmpty: true,
        para: {
          runs: [
            {
              text: ' ',
              fontSizePt: spacerSize,
              fontFamily: pBaseFont,
              bold: false,
              italic: false,
              underline: false,
              color: pBaseColor,
            },
          ],
          align,
          level,
          spaceBeforePt: 0,
          spaceAfterPt: 0,
        },
      });
    }
  }

  // Trim leading and trailing empty paragraphs while preserving intentional inner blank spacers
  let firstNonEmpty = 0;
  while (firstNonEmpty < rawParagraphs.length && rawParagraphs[firstNonEmpty].isEmpty) {
    firstNonEmpty += 1;
  }
  let lastNonEmpty = rawParagraphs.length - 1;
  while (lastNonEmpty >= firstNonEmpty && rawParagraphs[lastNonEmpty].isEmpty) {
    lastNonEmpty -= 1;
  }
  if (firstNonEmpty > lastNonEmpty) return [];

  return rawParagraphs.slice(firstNonEmpty, lastNonEmpty + 1).map((item) => item.para);
}

async function parseShapeTreeElements(
  spTree: XmlNode | undefined,
  zip: JSZip,
  partDir: string,
  rels: Map<string, { target: string; type: string }>,
  slideW: number,
  slideH: number,
  theme: ThemeData,
  colorMap: Record<string, string>,
  bgRepresentativeColor: string,
  masterTextStyles: MasterTextStyles,
  layoutPlaceholders: Map<string, PlaceholderStyleDefaults>,
  masterPlaceholders: Map<string, PlaceholderStyleDefaults>,
  groupCtx: GroupTransformContext,
  options: { skipPlaceholders: boolean }
): Promise<{ elements: PptxElement[]; detectedTitle: string }> {
  const elements: PptxElement[] = [];
  let detectedTitle = '';
  if (!spTree) return { elements, detectedTitle };

  let bodyFallbackIdx = 0;

  for (const node of spTree.children) {
    // 1) Grouped shapes / images (<p:grpSp>) — recurse with exact child EMU transform!
    if (node.localName === 'grpSp') {
      const grpSpPr = getChild(node, 'grpSpPr');
      const xfrm = getChild(grpSpPr, 'xfrm');
      const off = getChild(xfrm, 'off');
      const ext = getChild(xfrm, 'ext');
      const chOff = getChild(xfrm, 'chOff');
      const chExt = getChild(xfrm, 'chExt');

      let nextGroup = groupCtx;
      if (off && ext && chOff && chExt) {
        const ox = Number(off.attrs.x ?? 0);
        const oy = Number(off.attrs.y ?? 0);
        const ecx = Number(ext.attrs.cx ?? 1);
        const ecy = Number(ext.attrs.cy ?? 1);
        const cox = Number(chOff.attrs.x ?? 0);
        const coy = Number(chOff.attrs.y ?? 0);
        const ccx = Math.max(1, Number(chExt.attrs.cx ?? ecx));
        const ccy = Math.max(1, Number(chExt.attrs.cy ?? ecy));

        const localScaleX = ecx / ccx;
        const localScaleY = ecy / ccy;
        nextGroup = {
          scaleX: groupCtx.scaleX * localScaleX,
          scaleY: groupCtx.scaleY * localScaleY,
          offsetX: groupCtx.offsetX + (ox - cox * localScaleX) * groupCtx.scaleX,
          offsetY: groupCtx.offsetY + (oy - coy * localScaleY) * groupCtx.scaleY,
        };
      }

      const sub = await parseShapeTreeElements(
        node,
        zip,
        partDir,
        rels,
        slideW,
        slideH,
        theme,
        colorMap,
        bgRepresentativeColor,
        masterTextStyles,
        layoutPlaceholders,
        masterPlaceholders,
        nextGroup,
        options
      );
      elements.push(...sub.elements);
      if (!detectedTitle && sub.detectedTitle) detectedTitle = sub.detectedTitle;
      continue;
    }

    // 2) Picture (<p:pic>)
    if (node.localName === 'pic') {
      const nvPicPr = getChild(node, 'nvPicPr');
      const ph = getChild(getChild(nvPicPr, 'nvPr'), 'ph');
      if (options.skipPlaceholders && ph) continue;

      const blipFill = getChild(node, 'blipFill');
      const blip = getChild(blipFill, 'blip');
      const embedId = blip?.attrs['r:embed'] ?? blip?.attrs.embed;
      if (!embedId) continue;
      const rel = rels.get(embedId);
      if (!rel) continue;
      const mediaPath = resolveRelativeZipPath(partDir, rel.target);
      const mediaFile = zip.file(mediaPath);
      if (!mediaFile) continue;

      const spPr = getChild(node, 'spPr');
      const rawXfrm = readRawTransform(spPr);
      const phKeyIdx = ph?.attrs.idx !== undefined ? `idx:${ph.attrs.idx}` : undefined;
      const phFallback =
        (phKeyIdx ? layoutPlaceholders.get(phKeyIdx) : undefined) ??
        (ph?.attrs.type ? layoutPlaceholders.get(`type:${ph.attrs.type}`) : undefined);

      const transform = rawXfrm
        ? applyGroupTransform(rawXfrm, groupCtx, slideW, slideH)
        : phFallback?.transform ?? { x: 0.08, y: 0.14, w: 0.84, h: 0.72 };

      const srcRect = getChild(blipFill, 'srcRect');
      const crop = srcRect
        ? {
            l: Math.max(0, Number(srcRect.attrs.l ?? 0) / 100000),
            t: Math.max(0, Number(srcRect.attrs.t ?? 0) / 100000),
            r: Math.max(0, Number(srcRect.attrs.r ?? 0) / 100000),
            b: Math.max(0, Number(srcRect.attrs.b ?? 0) / 100000),
          }
        : undefined;

      const geom = getChild(spPr, 'prstGeom')?.attrs.prst;
      const ln = getChild(spPr, 'ln');
      let strokeColor: string | undefined;
      let strokeWidthPt: number | undefined;
      if (ln && !getChild(ln, 'noFill')) {
        strokeColor = resolveColorContainer(getChild(ln, 'solidFill'), theme.colors, colorMap);
        strokeWidthPt = ln.attrs.w ? Number(ln.attrs.w) / 12700 : 1;
      }

      const base64 = await mediaFile.async('base64');
      elements.push({
        kind: 'image',
        transform,
        mediaPath,
        mimeType: guessMimeType(mediaPath),
        base64,
        crop,
        geom,
        strokeColor,
        strokeWidthPt,
      });
      continue;
    }

    // 3) Shape or Connector (<p:sp> / <p:cxnSp>)
    if (node.localName === 'sp' || node.localName === 'cxnSp') {
      const isConnector = node.localName === 'cxnSp';
      const nvPr = getChild(
        getChild(node, isConnector ? 'nvCxnSpPr' : 'nvSpPr'),
        'nvPr'
      );
      const ph = getChild(nvPr, 'ph');

      if (options.skipPlaceholders && ph) continue;

      const phType = ph?.attrs.type;
      const phIdx = ph?.attrs.idx;
      if (phType === 'sldNum' || phType === 'ftr' || phType === 'dt') continue;

      const isTitle = phType === 'title' || phType === 'ctrTitle';
      const isSubtitle = phType === 'subTitle';
      const isBody = phType === 'body' || phType === 'obj' || (Boolean(ph) && !isTitle && !isSubtitle);

      const layoutPh =
        (phIdx !== undefined ? layoutPlaceholders.get(`idx:${phIdx}`) : undefined) ??
        (phType ? layoutPlaceholders.get(`type:${phType}`) : undefined);
      const masterPh =
        (phIdx !== undefined ? masterPlaceholders.get(`idx:${phIdx}`) : undefined) ??
        (phType ? masterPlaceholders.get(`type:${phType}`) : undefined);

      const spPr = getChild(node, 'spPr');
      const rawXfrm = readRawTransform(spPr);
      let transform = rawXfrm
        ? applyGroupTransform(rawXfrm, groupCtx, slideW, slideH)
        : layoutPh?.transform ?? masterPh?.transform;

      if (!transform) {
        if (isTitle) {
          transform = { x: 0.06, y: 0.07, w: 0.88, h: 0.16 };
        } else if (isSubtitle) {
          transform = { x: 0.06, y: 0.26, w: 0.88, h: 0.14 };
        } else {
          transform = {
            x: 0.06,
            y: 0.24 + bodyFallbackIdx * 0.2,
            w: 0.88,
            h: 0.62,
          };
          bodyFallbackIdx += 1;
        }
      }

      const prstGeom = getChild(spPr, 'prstGeom');
      const geom = prstGeom?.attrs.prst ?? layoutPh?.geom ?? masterPh?.geom ?? (isConnector ? 'line' : 'rect');
      let cornerRadiusFactor: number | undefined;
      const avLst = getChild(prstGeom, 'avLst');
      const gdAdj = getChildren(avLst, 'gd').find((g) => g.attrs.name === 'adj');
      if (gdAdj?.attrs.fmla?.startsWith('val ')) {
        const adjVal = Number(gdAdj.attrs.fmla.slice(4));
        if (Number.isFinite(adjVal)) {
          cornerRadiusFactor = Math.max(0, Math.min(0.5, adjVal / 100000));
        }
      }

      // Direct child fill on <p:spPr> ONLY (never accidentally grabbing <a:ln> fill!)
      let fill = await resolveFillNode(spPr, zip, partDir, rels, theme, colorMap);

      // If no explicit fill (and not explicitly <a:noFill/>), resolve <p:style><a:fillRef>
      const styleNode = getChild(node, 'style');
      if (!fill && styleNode && !isConnector) {
        const fillRef = getChild(styleNode, 'fillRef');
        const fillIdx = Number(fillRef?.attrs.idx ?? 0);
        if (fillIdx > 0) {
          const phClr = resolveColorContainer(fillRef, theme.colors, colorMap);
          const themeFill =
            fillIdx >= 1001
              ? theme.bgFillStyleNodes[fillIdx - 1001]
              : theme.fillStyleNodes[fillIdx - 1];
          if (themeFill) {
            fill = await resolveFillNode(themeFill, zip, partDir, rels, theme, colorMap, phClr);
          } else if (phClr) {
            fill = { kind: 'solid', color: phClr };
          }
        }
      }

      // Stroke on <a:ln> or <p:style><a:lnRef>
      let strokeColor: string | undefined;
      let strokeWidthPt: number | undefined;
      const ln = getChild(spPr, 'ln');
      if (ln) {
        if (!getChild(ln, 'noFill')) {
          strokeColor = resolveColorContainer(getChild(ln, 'solidFill'), theme.colors, colorMap);
          strokeWidthPt = ln.attrs.w ? Math.max(0.75, Number(ln.attrs.w) / 12700) : 1.25;
        }
      } else if (styleNode) {
        const lnRef = getChild(styleNode, 'lnRef');
        const lnIdx = Number(lnRef?.attrs.idx ?? 0);
        if (lnIdx > 0) {
          strokeColor = resolveColorContainer(lnRef, theme.colors, colorMap);
          strokeWidthPt = 1.25;
        }
      }

      // Text body & vertical anchoring (ECMA-376 default is 't' = top)
      const nvSpPrNode = getChild(node, isConnector ? 'nvCxnSpPr' : 'nvSpPr');
      const cNvSpPr = getChild(nvSpPrNode, 'cNvSpPr');
      const isTextBox = cNvSpPr?.attrs.txBox === '1' || cNvSpPr?.attrs.txBox === 'true';

      const txBody = getChild(node, 'txBody');
      const bodyPr = getChild(txBody, 'bodyPr');
      const anchorAttr = bodyPr?.attrs.anchor;
      const hasVisibleFill = Boolean(fill && fill.kind !== 'none');

      // Only small geometric badges/pills/ellipses/diamonds without explicit anchor default to middle;
      // cards, rectangles, placeholders, and text boxes always default to top per ECMA-376 §21.1.2.1.1.
      const shouldDefaultCenter =
        !isTextBox &&
        !ph &&
        hasVisibleFill &&
        (geom === 'ellipse' ||
          geom === 'diamond' ||
          geom === 'rightArrow' ||
          geom === 'triangle' ||
          transform.h < 0.11);

      const verticalAnchor: 'top' | 'middle' | 'bottom' =
        anchorAttr === 'ctr'
          ? 'middle'
          : anchorAttr === 'b'
            ? 'bottom'
            : anchorAttr === 't'
              ? 'top'
              : layoutPh?.verticalAnchor ??
                masterPh?.verticalAnchor ??
                (shouldDefaultCenter ? 'middle' : 'top');

      // OOXML standard body margins: lIns/rIns = 91440 EMU (7.2pt), tIns/bIns = 45720 EMU (3.6pt)
      const emuToPt = (emuStr: string | undefined, fallbackPt: number) => {
        if (emuStr === undefined) return fallbackPt;
        const val = Number(emuStr);
        return Number.isFinite(val) ? Math.max(0, val / 12700) : fallbackPt;
      };

      const insetsPt = {
        l: emuToPt(bodyPr?.attrs.lIns, 7.2),
        t: emuToPt(bodyPr?.attrs.tIns, 3.6),
        r: emuToPt(bodyPr?.attrs.rIns, 7.2),
        b: emuToPt(bodyPr?.attrs.bIns, 3.6),
      };

      const normAutofit = getChild(bodyPr, 'normAutofit');
      const rawFontScale = normAutofit?.attrs.fontScale
        ? Number(normAutofit.attrs.fontScale) / 100000
        : 1;
      const fontScale =
        Number.isFinite(rawFontScale) && rawFontScale > 0.3 && rawFontScale <= 1.2
          ? rawFontScale
          : 1;

      // Resolve shape-level text color fallback using clrMap tx1 + fill luminance
      const fontRefColor = resolveColorContainer(
        getChild(styleNode, 'fontRef'),
        theme.colors,
        colorMap
      );
      const tx1Color = theme.colors[colorMap.tx1] ?? '#111827';
      let defaultTextColor = fontRefColor ?? layoutPh?.color ?? masterPh?.color;
      if (!defaultTextColor) {
        if (fill && fill.kind === 'solid') {
          defaultTextColor = isDarkCssColor(fill.color) ? '#FFFFFF' : '#111827';
        } else if (fill && fill.kind === 'gradient' && fill.stops.length > 0) {
          defaultTextColor = isDarkCssColor(fill.stops[0].color) ? '#FFFFFF' : '#111827';
        } else {
          // Ensure legibility against slide background while preferring theme tx1
          const bgDark = isDarkCssColor(bgRepresentativeColor);
          const txDark = isDarkCssColor(tx1Color);
          defaultTextColor = bgDark === txDark ? (bgDark ? '#F8FAFC' : '#111827') : tx1Color;
        }
      }

      const styleGroup = isTitle
        ? masterTextStyles.title
        : isBody
          ? masterTextStyles.body
          : masterTextStyles.other;

      const paragraphs = parseParagraphsFromTxBody(txBody, theme, colorMap, defaultTextColor, {
        fontSizePt:
          layoutPh?.fontSizePt ??
          masterPh?.fontSizePt ??
          (isTitle ? 38 : isSubtitle ? 22 : 18),
        bold: layoutPh?.bold ?? masterPh?.bold ?? isTitle,
        fontFamily:
          layoutPh?.fontFamily ??
          masterPh?.fontFamily ??
          (isTitle
            ? `"${theme.majorFont}", "Plus Jakarta Sans", sans-serif`
            : `"${theme.minorFont}", "DM Sans", sans-serif`),
        align:
          layoutPh?.align ??
          masterPh?.align ??
          (phType === 'ctrTitle' ? 'center' : 'left'),
        levels: styleGroup,
        fontScale,
      });

      if (isTitle && !detectedTitle && paragraphs.length > 0) {
        detectedTitle = paragraphs[0].runs.map((r) => r.text).join('').trim();
      }

      if (hasVisibleFill || strokeColor || paragraphs.length > 0) {
        elements.push({
          kind: 'shape',
          transform,
          geom,
          cornerRadiusFactor,
          fill: hasVisibleFill ? fill : undefined,
          strokeColor,
          strokeWidthPt,
          isConnector,
          verticalAnchor,
          insetsPt,
          paragraphs,
        });
      }
      continue;
    }

    // 4) Table (<p:graphicFrame> -> <a:tbl>)
    if (node.localName === 'graphicFrame') {
      const tbl = findDescendant(node, 'tbl');
      if (!tbl) continue;

      const rawXfrm = readRawTransform(node);
      const transform = rawXfrm
        ? applyGroupTransform(rawXfrm, groupCtx, slideW, slideH)
        : { x: 0.06, y: 0.24, w: 0.88, h: 0.58 };

      const tblGrid = getChild(tbl, 'tblGrid');
      const gridCols = getChildren(tblGrid, 'gridCol').map((c) => Math.max(1, Number(c.attrs.w ?? 1)));
      const totalColW = gridCols.reduce((acc, v) => acc + v, 0);

      const trNodes = getChildren(tbl, 'tr');
      const rowHeights = trNodes.map((r) => Math.max(1, Number(r.attrs.h ?? 370840)));
      const totalRowH = rowHeights.reduce((acc, v) => acc + v, 0);

      const accent1 = theme.colors[colorMap.accent1] ?? '#2563EB';
      const bgDark = isDarkCssColor(bgRepresentativeColor);
      const defaultCellText = bgDark ? '#F8FAFC' : '#0F172A';

      const rows: PptxTableCell[][] = [];
      for (let rIdx = 0; rIdx < trNodes.length; rIdx++) {
        const tcNodes = getChildren(trNodes[rIdx], 'tc');
        const rowCells: PptxTableCell[] = [];
        for (const tc of tcNodes) {
          const tcPr = getChild(tc, 'tcPr');
          let fill = await resolveFillNode(tcPr, zip, partDir, rels, theme, colorMap);
          if (!fill) {
            // Subtle theme-accurate fallback only when cell omits explicit fill
            if (rIdx === 0) {
              fill = { kind: 'solid', color: accent1 };
            } else {
              fill = {
                kind: 'solid',
                color:
                  rIdx % 2 === 1
                    ? bgDark
                      ? 'rgba(255,255,255,0.06)'
                      : 'rgba(15,23,42,0.04)'
                    : bgDark
                      ? 'rgba(255,255,255,0.02)'
                      : 'rgba(255,255,255,0.85)',
              };
            }
          }

          const cellTextFallback =
            fill.kind === 'solid' && !fill.color.startsWith('rgba')
              ? isDarkCssColor(fill.color)
                ? '#FFFFFF'
                : '#0F172A'
              : defaultCellText;

          const txBody = getChild(tc, 'txBody');
          const paragraphs = parseParagraphsFromTxBody(txBody, theme, colorMap, cellTextFallback, {
            fontSizePt: rIdx === 0 ? 15 : 14,
            bold: rIdx === 0,
            fontFamily: `"${theme.minorFont}", "DM Sans", sans-serif`,
            align: 'left',
          });

          const text = paragraphs
            .map((p) => p.runs.map((r) => r.text).join(''))
            .join('\n')
            .trim();

          const borderColor =
            resolveColorContainer(
              getChild(getChild(tcPr, 'lnB'), 'solidFill'),
              theme.colors,
              colorMap
            ) ?? (bgDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.16)');

          const anchorAttr = tcPr?.attrs.anchor;
          const verticalAnchor: 'top' | 'middle' | 'bottom' =
            anchorAttr === 't' ? 'top' : anchorAttr === 'b' ? 'bottom' : 'middle';

          rowCells.push({
            text,
            paragraphs,
            fill: fill.kind !== 'none' ? fill : undefined,
            borderColor,
            verticalAnchor,
          });
        }
        if (rowCells.length > 0) rows.push(rowCells);
      }

      if (rows.length > 0) {
        const colCount = Math.max(...rows.map((r) => r.length), 1);
        const colFractions =
          gridCols.length === colCount && totalColW > 0
            ? gridCols.map((w) => w / totalColW)
            : Array.from({ length: colCount }, () => 1 / colCount);
        const rowFractions =
          rowHeights.length === rows.length && totalRowH > 0
            ? rowHeights.map((h) => h / totalRowH)
            : Array.from({ length: rows.length }, () => 1 / rows.length);

        elements.push({
          kind: 'table',
          transform,
          colFractions,
          rowFractions,
          rows,
        });
      }
    }
  }

  return { elements, detectedTitle };
}

function extractNotesText(notesXml: string): string {
  const doc = parseXml(notesXml);
  const spNodes = findDescendants(doc, 'sp');
  const lines: string[] = [];

  for (const sp of spNodes) {
    const phType = getChild(getChild(getChild(sp, 'nvSpPr'), 'nvPr'), 'ph')?.attrs.type;
    if (phType === 'sldNum' || phType === 'sldImg') continue;
    const txBody = getChild(sp, 'txBody');
    for (const p of getChildren(txBody, 'p')) {
      const text = findDescendants(p, 't')
        .map((t) => collectText(t))
        .join('')
        .trim();
      if (text) lines.push(text);
    }
  }
  return lines.join('\n').trim();
}

/**
 * Pure archive parser: unpacks a .pptx archive with JSZip, resolving theme colors,
 * clrMap / clrMapOvr, slideMaster -> slideLayout -> slide background & decorative shape
 * inheritance, exact Z-order, grouped shapes, cropped images, rich text runs, tables, and notes.
 */
export async function parsePptxArchive(
  data: ArrayBuffer | Uint8Array,
  deckBaseName = 'Presentation'
): Promise<ParsedPptxDeck> {
  const zip = await JSZip.loadAsync(data);

  const presXml = await zip.file('ppt/presentation.xml')?.async('string');
  const presRels = await readRelsFor(zip, 'ppt/presentation.xml');

  // Default theme fallback
  const fallbackThemeXml = await zip.file('ppt/theme/theme1.xml')?.async('string');
  const defaultTheme = parseThemeXml(fallbackThemeXml ?? null);

  let slideWidthEmu = DEFAULT_SLIDE_W_EMU;
  let slideHeightEmu = DEFAULT_SLIDE_H_EMU;
  const slidePaths: string[] = [];

  if (presXml) {
    const presDoc = parseXml(presXml);
    const sldSz = findDescendant(presDoc, 'sldSz');
    if (sldSz) {
      const cx = Number(sldSz.attrs.cx);
      const cy = Number(sldSz.attrs.cy);
      if (Number.isFinite(cx) && cx > 0 && Number.isFinite(cy) && cy > 0) {
        slideWidthEmu = cx;
        slideHeightEmu = cy;
      }
    }

    const sldIds = findDescendants(presDoc, 'sldId');
    for (const sldId of sldIds) {
      const rId = sldId.attrs['r:id'] ?? sldId.attrs.id;
      if (!rId) continue;
      const rel = presRels.get(rId);
      if (rel?.target) {
        const fullPath = resolveRelativeZipPath('ppt', rel.target);
        if (zip.file(fullPath)) slidePaths.push(fullPath);
      }
    }
  }

  if (slidePaths.length === 0) {
    const found: Array<{ num: number; path: string }> = [];
    zip.forEach((relativePath) => {
      const m = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      if (m) found.push({ num: Number(m[1]), path: relativePath });
    });
    found.sort((a, b) => a.num - b.num);
    found.forEach((f) => slidePaths.push(f.path));
  }

  // Cache parsed layouts, masters, and themes across slides
  const xmlCache = new Map<string, XmlNode>();
  const relsCache = new Map<string, Map<string, { target: string; type: string }>>();
  const themeCache = new Map<string, ThemeData>();

  const loadXmlCached = async (path: string): Promise<XmlNode | undefined> => {
    if (xmlCache.has(path)) return xmlCache.get(path);
    const str = await zip.file(path)?.async('string');
    if (!str) return undefined;
    const parsed = parseXml(str);
    xmlCache.set(path, parsed);
    return parsed;
  };

  const loadRelsCached = async (
    path: string
  ): Promise<Map<string, { target: string; type: string }>> => {
    if (relsCache.has(path)) return relsCache.get(path)!;
    const rels = await readRelsFor(zip, path);
    relsCache.set(path, rels);
    return rels;
  };

  const loadThemeCached = async (path: string): Promise<ThemeData> => {
    if (themeCache.has(path)) return themeCache.get(path)!;
    const str = await zip.file(path)?.async('string');
    const parsed = parseThemeXml(str ?? null);
    themeCache.set(path, parsed);
    return parsed;
  };

  const slides: ParsedPptxSlide[] = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const slidePath = slidePaths[i];
    const slideDoc = await loadXmlCached(slidePath);
    if (!slideDoc) continue;

    const slideDir = dirOf(slidePath);
    const slideRels = await loadRelsCached(slidePath);

    // Follow slide -> slideLayout -> slideMaster -> theme cascade
    let layoutPath: string | undefined;
    for (const rel of slideRels.values()) {
      if (rel.type.toLowerCase().includes('slidelayout') || rel.target.toLowerCase().includes('slidelayout')) {
        layoutPath = resolveRelativeZipPath(slideDir, rel.target);
        break;
      }
    }

    const layoutDoc = layoutPath ? await loadXmlCached(layoutPath) : undefined;
    const layoutRels = layoutPath ? await loadRelsCached(layoutPath) : new Map();

    let masterPath: string | undefined;
    if (layoutPath) {
      for (const rel of layoutRels.values()) {
        if (rel.type.toLowerCase().includes('slidemaster') || rel.target.toLowerCase().includes('slidemaster')) {
          masterPath = resolveRelativeZipPath(dirOf(layoutPath), rel.target);
          break;
        }
      }
    }
    if (!masterPath && zip.file('ppt/slideMasters/slideMaster1.xml')) {
      masterPath = 'ppt/slideMasters/slideMaster1.xml';
    }

    const masterDoc = masterPath ? await loadXmlCached(masterPath) : undefined;
    const masterRels = masterPath ? await loadRelsCached(masterPath) : new Map();

    let theme = defaultTheme;
    if (masterPath) {
      for (const rel of masterRels.values()) {
        if (rel.type.toLowerCase().includes('/theme') || rel.target.toLowerCase().includes('theme/')) {
          const themePath = resolveRelativeZipPath(dirOf(masterPath), rel.target);
          if (zip.file(themePath)) {
            theme = await loadThemeCached(themePath);
            break;
          }
        }
      }
    }

    // Build effective colorMap: Default -> Master clrMap -> Layout clrMapOvr -> Slide clrMapOvr
    const masterRoot = getChild(masterDoc, 'sldMaster');
    const layoutRoot = getChild(layoutDoc, 'sldLayout');
    const slideRoot = getChild(slideDoc, 'sld');

    let colorMap = parseColorMap(getChild(masterRoot, 'clrMap'), DEFAULT_COLOR_MAP);
    const layoutClrOvr = getChild(getChild(layoutRoot, 'clrMapOvr'), 'overrideClrMapping');
    if (layoutClrOvr) colorMap = parseColorMap(layoutClrOvr, colorMap);
    const slideClrOvr = getChild(getChild(slideRoot, 'clrMapOvr'), 'overrideClrMapping');
    if (slideClrOvr) colorMap = parseColorMap(slideClrOvr, colorMap);

    const masterCSld = getChild(masterRoot, 'cSld');
    const layoutCSld = getChild(layoutRoot, 'cSld');
    const slideCSld = getChild(slideRoot, 'cSld');

    // Cascade background resolution: Slide -> Layout -> Master -> Theme bg1
    const slideBg = await resolveBackgroundFromPart(
      slideCSld,
      zip,
      slideDir,
      slideRels,
      theme,
      colorMap
    );
    const layoutBg =
      slideBg ??
      (layoutPath
        ? await resolveBackgroundFromPart(
            layoutCSld,
            zip,
            dirOf(layoutPath),
            layoutRels,
            theme,
            colorMap
          )
        : undefined);
    const masterBg =
      layoutBg ??
      (masterPath
        ? await resolveBackgroundFromPart(
            masterCSld,
            zip,
            dirOf(masterPath),
            masterRels,
            theme,
            colorMap
          )
        : undefined);

    const bg1Fallback = theme.colors[colorMap.bg1] ?? '#FFFFFF';
    const background: PptxFill = masterBg ?? { kind: 'solid', color: bg1Fallback };
    const backgroundColor = representativeBackgroundColor(background);

    const masterTextStyles = parseMasterTextStyles(masterDoc, theme, colorMap);
    const masterSpTree = getChild(masterCSld, 'spTree');
    const layoutSpTree = getChild(layoutCSld, 'spTree');
    const slideSpTree = getChild(slideCSld, 'spTree');

    const masterPlaceholders = collectPlaceholderMap(
      masterSpTree,
      slideWidthEmu,
      slideHeightEmu,
      theme,
      colorMap
    );
    const layoutPlaceholders = collectPlaceholderMap(
      layoutSpTree,
      slideWidthEmu,
      slideHeightEmu,
      theme,
      colorMap
    );

    const allElements: PptxElement[] = [];

    // Include non-placeholder decorative master & layout artwork unless explicitly hidden
    const showMasterOnLayout = layoutRoot?.attrs.showMasterSp !== '0';
    const showMasterOnSlide = slideRoot?.attrs.showMasterSp !== '0';

    if (masterPath && masterSpTree && showMasterOnLayout && showMasterOnSlide) {
      const masterDecor = await parseShapeTreeElements(
        masterSpTree,
        zip,
        dirOf(masterPath),
        masterRels,
        slideWidthEmu,
        slideHeightEmu,
        theme,
        colorMap,
        backgroundColor,
        masterTextStyles,
        layoutPlaceholders,
        masterPlaceholders,
        IDENTITY_GROUP,
        { skipPlaceholders: true }
      );
      allElements.push(...masterDecor.elements);
    }

    if (layoutPath && layoutSpTree && showMasterOnSlide) {
      const layoutDecor = await parseShapeTreeElements(
        layoutSpTree,
        zip,
        dirOf(layoutPath),
        layoutRels,
        slideWidthEmu,
        slideHeightEmu,
        theme,
        colorMap,
        backgroundColor,
        masterTextStyles,
        layoutPlaceholders,
        masterPlaceholders,
        IDENTITY_GROUP,
        { skipPlaceholders: true }
      );
      allElements.push(...layoutDecor.elements);
    }

    // Parse slide elements in exact Z-order
    const slideParsed = await parseShapeTreeElements(
      slideSpTree,
      zip,
      slideDir,
      slideRels,
      slideWidthEmu,
      slideHeightEmu,
      theme,
      colorMap,
      backgroundColor,
      masterTextStyles,
      layoutPlaceholders,
      masterPlaceholders,
      IDENTITY_GROUP,
      { skipPlaceholders: false }
    );
    allElements.push(...slideParsed.elements);

    // Extract speaker notes
    let notes = '';
    for (const rel of slideRels.values()) {
      if (rel.type.toLowerCase().includes('notesslide') || rel.target.toLowerCase().includes('notesslide')) {
        const notesPath = resolveRelativeZipPath(slideDir, rel.target);
        const notesXml = await zip.file(notesPath)?.async('string');
        if (notesXml) notes = extractNotesText(notesXml);
        break;
      }
    }

    let title = slideParsed.detectedTitle;
    if (!title) {
      const firstTextShape = slideParsed.elements.find(
        (el): el is PptxShapeElement => el.kind === 'shape' && el.paragraphs.length > 0
      );
      title =
        firstTextShape?.paragraphs[0].runs.map((r) => r.text).join('').trim() ||
        `${deckBaseName} · Slide ${i + 1}`;
    }

    slides.push({
      index: i + 1,
      title: title.slice(0, 64),
      background,
      backgroundColor,
      elements: allElements,
      notes,
    });
  }

  return {
    slideWidthEmu,
    slideHeightEmu,
    slides,
  };
}

// ============================================================================
// High-Fidelity Browser Canvas Slide Renderer
// ============================================================================

function loadDataUrlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode embedded PowerPoint image'));
    img.src = dataUrl;
  });
}

function buildLinearGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  angleDeg: number,
  stops: PptxGradientStop[],
  radial?: boolean
): CanvasGradient {
  if (radial) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.72);
    for (const s of stops) grad.addColorStop(s.pos, s.color);
    return grad;
  }

  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const halfLen = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;

  const grad = ctx.createLinearGradient(
    cx - dx * halfLen,
    cy - dy * halfLen,
    cx + dx * halfLen,
    cy + dy * halfLen
  );
  for (const s of stops) {
    grad.addColorStop(Math.max(0, Math.min(1, s.pos)), s.color);
  }
  return grad;
}

async function applyCanvasFill(
  ctx: CanvasRenderingContext2D,
  fill: PptxFill,
  x: number,
  y: number,
  w: number,
  h: number
): Promise<boolean> {
  if (fill.kind === 'none') return false;
  if (fill.kind === 'solid') {
    ctx.fillStyle = fill.color;
    ctx.fill();
    return true;
  }
  if (fill.kind === 'gradient') {
    ctx.fillStyle = buildLinearGradient(ctx, x, y, w, h, fill.angleDeg, fill.stops, fill.radial);
    ctx.fill();
    return true;
  }
  if (fill.kind === 'image') {
    try {
      const img = await loadDataUrlImage(`data:${fill.mimeType};base64,${fill.base64}`);
      ctx.save();
      ctx.clip();
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function traceShapeGeometry(
  ctx: CanvasRenderingContext2D,
  geom: string,
  x: number,
  y: number,
  w: number,
  h: number,
  cornerRadiusFactor?: number
) {
  ctx.beginPath();
  switch (geom) {
    case 'ellipse':
      ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
      break;
    case 'roundRect': {
      const factor = cornerRadiusFactor ?? 0.16;
      const r = Math.min(w, h) * factor;
      ctx.roundRect(x, y, w, h, r);
      break;
    }
    case 'triangle':
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    case 'rtTriangle':
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    case 'parallelogram': {
      const skew = w * 0.18;
      ctx.moveTo(x + skew, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w - skew, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    }
    case 'rightArrow': {
      const headW = Math.min(w * 0.35, h * 0.8);
      const shaftTop = y + h * 0.25;
      const shaftBot = y + h * 0.75;
      ctx.moveTo(x, shaftTop);
      ctx.lineTo(x + w - headW, shaftTop);
      ctx.lineTo(x + w - headW, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w - headW, y + h);
      ctx.lineTo(x + w - headW, shaftBot);
      ctx.lineTo(x, shaftBot);
      ctx.closePath();
      break;
    }
    case 'line':
    case 'straightConnector1':
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      break;
    default:
      ctx.rect(x, y, w, h);
      break;
  }
}

interface LayoutLine {
  segments: Array<{
    text: string;
    font: string;
    color: string;
    width: number;
    fontSizePx: number;
    underline: boolean;
  }>;
  totalWidth: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  indentPx: number;
  spaceBeforePx: number;
}

function layoutRichParagraphs(
  ctx: CanvasRenderingContext2D,
  paragraphs: PptxParagraph[],
  maxWidth: number,
  ptScale: number
): LayoutLine[] {
  const lines: LayoutLine[] = [];

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx];
    const indentPx = para.level * Math.round(20 * ptScale);
    const availW = Math.max(40, maxWidth - indentPx);
    const spaceBeforePx = pIdx > 0 && para.spaceBeforePt > 0 ? Math.round(para.spaceBeforePt * ptScale * 0.75) : 0;

    // Preserve empty spacer paragraphs cleanly
    if (para.runs.length === 1 && para.runs[0].text === ' ') {
      const spacerH = Math.round(para.runs[0].fontSizePt * ptScale * 0.85);
      lines.push({
        segments: [],
        totalWidth: 0,
        lineHeight: Math.max(8, spacerH),
        align: para.align,
        indentPx,
        spaceBeforePx,
      });
      continue;
    }

    // Flatten runs into word tokens preserving run formatting
    const tokens: Array<{
      text: string;
      font: string;
      color: string;
      fontSizePx: number;
      underline: boolean;
      isBreak?: boolean;
    }> = [];

    if (para.bulletChar && para.runs.length > 0) {
      const first = para.runs[0];
      const px = Math.round(first.fontSizePt * ptScale);
      tokens.push({
        text: `${para.bulletChar} `,
        font: `${first.italic ? 'italic' : 'normal'} ${first.bold ? '700' : '400'} ${px}px ${first.fontFamily}`,
        color: first.color,
        fontSizePx: px,
        underline: false,
      });
    }

    for (const run of para.runs) {
      const px = Math.round(run.fontSizePt * ptScale);
      const font = `${run.italic ? 'italic' : 'normal'} ${run.bold ? '700' : '400'} ${px}px ${run.fontFamily}`;
      if (run.isBreak) {
        tokens.push({ text: '', font, color: run.color, fontSizePx: px, underline: false, isBreak: true });
        continue;
      }
      const parts = run.text.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        tokens.push({
          text: part,
          font,
          color: run.color,
          fontSizePx: px,
          underline: run.underline,
        });
      }
    }

    let currentSegments: LayoutLine['segments'] = [];
    let currentWidth = 0;
    let maxFontPx = 16;
    let isFirstLineOfPara = true;

    const pushLine = () => {
      lines.push({
        segments: currentSegments,
        totalWidth: currentWidth,
        lineHeight: Math.round(maxFontPx * 1.24),
        align: para.align,
        indentPx,
        spaceBeforePx: isFirstLineOfPara ? spaceBeforePx : 0,
      });
      currentSegments = [];
      currentWidth = 0;
      maxFontPx = 16;
      isFirstLineOfPara = false;
    };

    for (const tok of tokens) {
      if (tok.isBreak) {
        pushLine();
        continue;
      }
      ctx.font = tok.font;
      const w = ctx.measureText(tok.text).width;
      const isSpace = /^\s+$/.test(tok.text);

      if (currentSegments.length > 0 && currentWidth + w > availW && !isSpace) {
        pushLine();
      }
      if (currentSegments.length === 0 && isSpace) {
        continue;
      }

      currentSegments.push({
        text: tok.text,
        font: tok.font,
        color: tok.color,
        width: w,
        fontSizePx: tok.fontSizePx,
        underline: tok.underline,
      });
      currentWidth += w;
      if (tok.fontSizePx > maxFontPx) maxFontPx = tok.fontSizePx;
    }

    if (currentSegments.length > 0) {
      pushLine();
    }

    // Add paragraph spacing after non-final paragraphs
    if (lines.length > 0 && pIdx < paragraphs.length - 1 && para.spaceAfterPt > 0) {
      lines[lines.length - 1].lineHeight += Math.round(para.spaceAfterPt * ptScale * 0.65);
    }
  }

  return lines;
}

function drawRichTextInBox(
  ctx: CanvasRenderingContext2D,
  paragraphs: PptxParagraph[],
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  verticalAnchor: 'top' | 'middle' | 'bottom',
  insetsPt: { l: number; t: number; r: number; b: number },
  ptScale: number
) {
  const insL = Math.round(insetsPt.l * ptScale);
  const insT = Math.round(insetsPt.t * ptScale);
  const insR = Math.round(insetsPt.r * ptScale);
  const insB = Math.round(insetsPt.b * ptScale);

  const innerX = boxX + insL;
  const innerY = boxY + insT;
  const innerW = Math.max(30, boxW - insL - insR);
  const innerH = Math.max(16, boxH - insT - insB);

  const lines = layoutRichParagraphs(ctx, paragraphs, innerW, ptScale);
  if (lines.length === 0) return;

  const totalHeight = lines.reduce((sum, l) => sum + l.lineHeight + l.spaceBeforePx, 0);
  let cursorY = innerY;
  if (verticalAnchor === 'middle') {
    cursorY = innerY + Math.max(0, (innerH - totalHeight) / 2);
  } else if (verticalAnchor === 'bottom') {
    cursorY = innerY + Math.max(0, innerH - totalHeight);
  }

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  for (const line of lines) {
    cursorY += line.spaceBeforePx;
    let cursorX = innerX + line.indentPx;
    const availW = Math.max(20, innerW - line.indentPx);
    if (line.align === 'center') {
      cursorX = innerX + line.indentPx + Math.max(0, (availW - line.totalWidth) / 2);
    } else if (line.align === 'right') {
      cursorX = innerX + line.indentPx + Math.max(0, availW - line.totalWidth);
    }

    for (const seg of line.segments) {
      ctx.font = seg.font;
      ctx.fillStyle = seg.color;
      ctx.fillText(seg.text, cursorX, cursorY);
      if (seg.underline) {
        ctx.fillRect(cursorX, cursorY + seg.fontSizePx * 1.06, seg.width, Math.max(1.5, seg.fontSizePx * 0.06));
      }
      cursorX += seg.width;
    }

    cursorY += line.lineHeight;
  }

  ctx.textBaseline = 'alphabetic';
}

function applyTransformMatrix(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tr: PptxTransform
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (tr.rotDeg || tr.flipH || tr.flipV) {
    ctx.translate(cx, cy);
    if (tr.rotDeg) ctx.rotate((tr.rotDeg * Math.PI) / 180);
    if (tr.flipH || tr.flipV) ctx.scale(tr.flipH ? -1 : 1, tr.flipV ? -1 : 1);
    ctx.translate(-cx, -cy);
  }
}

/**
 * Browser-side renderer: parses a .pptx File with JSZip and rasterizes each slide
 * at crisp full-HD resolution preserving true PowerPoint theme colors, master/layout backgrounds,
 * Z-order, grouped shapes, cropped images, rich text runs, and styled tables.
 */
export async function renderPptxFileToSlides(file: File): Promise<SlideItem[]> {
  const buffer = await file.arrayBuffer();
  const baseName = file.name.replace(/\.pptx$/i, '');
  const deck = await parsePptxArchive(buffer, baseName);

  const aspect = deck.slideWidthEmu / Math.max(1, deck.slideHeightEmu);
  const canvasW = 1920;
  const canvasH = Math.max(720, Math.min(1920, Math.round(canvasW / aspect)));
  // PowerPoint slide width in points = slideWidthEmu / 12700
  const slideWidthPt = deck.slideWidthEmu / 12700;
  const ptScale = canvasW / Math.max(320, slideWidthPt);

  const results: SlideItem[] = [];

  for (const slide of deck.slides) {
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    // 1) Draw Slide Background (exact solid / angled gradient / image from Slide -> Layout -> Master -> Theme)
    ctx.beginPath();
    ctx.rect(0, 0, canvasW, canvasH);
    const filledBg = await applyCanvasFill(ctx, slide.background, 0, 0, canvasW, canvasH);
    if (!filledBg) {
      ctx.fillStyle = slide.backgroundColor || '#FFFFFF';
      ctx.fillRect(0, 0, canvasW, canvasH);
    }

    // 2) Draw Elements in Exact Z-Order (Master Decor -> Layout Decor -> Slide Elements)
    for (const el of slide.elements) {
      const ex = el.transform.x * canvasW;
      const ey = el.transform.y * canvasH;
      const ew = el.transform.w * canvasW;
      const eh = el.transform.h * canvasH;

      if (el.kind === 'image') {
        try {
          const img = await loadDataUrlImage(`data:${el.mimeType};base64,${el.base64}`);
          ctx.save();
          applyTransformMatrix(ctx, ex, ey, ew, eh, el.transform);

          const clipGeom = el.geom && el.geom !== 'rect' ? el.geom : undefined;
          if (clipGeom) {
            traceShapeGeometry(ctx, clipGeom, ex, ey, ew, eh);
            ctx.clip();
          }

          // Respect OOXML srcRect image cropping if present
          const cropL = el.crop?.l ?? 0;
          const cropT = el.crop?.t ?? 0;
          const cropR = el.crop?.r ?? 0;
          const cropB = el.crop?.b ?? 0;
          const sx = img.naturalWidth * cropL;
          const sy = img.naturalHeight * cropT;
          const sw = Math.max(1, img.naturalWidth * (1 - cropL - cropR));
          const sh = Math.max(1, img.naturalHeight * (1 - cropT - cropB));

          ctx.drawImage(img, sx, sy, sw, sh, ex, ey, ew, eh);
          ctx.restore();

          if (el.strokeColor) {
            ctx.save();
            applyTransformMatrix(ctx, ex, ey, ew, eh, el.transform);
            traceShapeGeometry(ctx, el.geom ?? 'rect', ex, ey, ew, eh);
            ctx.strokeStyle = el.strokeColor;
            ctx.lineWidth = Math.max(1, (el.strokeWidthPt ?? 1) * ptScale);
            ctx.stroke();
            ctx.restore();
          }
        } catch {
          // Skip unreadable image format cleanly
        }
      } else if (el.kind === 'shape') {
        ctx.save();
        applyTransformMatrix(ctx, ex, ey, ew, eh, el.transform);

        if (el.fill && el.fill.kind !== 'none' && !el.isConnector) {
          traceShapeGeometry(ctx, el.geom, ex, ey, ew, eh, el.cornerRadiusFactor);
          await applyCanvasFill(ctx, el.fill, ex, ey, ew, eh);
        }

        if (el.strokeColor) {
          traceShapeGeometry(ctx, el.geom, ex, ey, ew, eh, el.cornerRadiusFactor);
          ctx.strokeStyle = el.strokeColor;
          ctx.lineWidth = Math.max(1, (el.strokeWidthPt ?? 1.25) * ptScale);
          ctx.stroke();
        }

        if (el.paragraphs.length > 0) {
          drawRichTextInBox(
            ctx,
            el.paragraphs,
            ex,
            ey,
            ew,
            eh,
            el.verticalAnchor,
            el.insetsPt,
            ptScale
          );
        }

        ctx.restore();
      } else if (el.kind === 'table' && el.rows.length > 0) {
        ctx.save();
        let rowY = ey;
        for (let r = 0; r < el.rows.length; r++) {
          const rowH = eh * (el.rowFractions[r] ?? 1 / el.rows.length);
          let colX = ex;
          const cells = el.rows[r];
          for (let c = 0; c < cells.length; c++) {
            const colW = ew * (el.colFractions[c] ?? 1 / cells.length);
            const cell = cells[c];

            if (cell.fill && cell.fill.kind !== 'none') {
              ctx.beginPath();
              ctx.rect(colX, rowY, colW, rowH);
              await applyCanvasFill(ctx, cell.fill, colX, rowY, colW, rowH);
            }

            if (cell.borderColor) {
              ctx.strokeStyle = cell.borderColor;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(colX, rowY, colW, rowH);
            }

            if (cell.paragraphs.length > 0) {
              drawRichTextInBox(
                ctx,
                cell.paragraphs,
                colX,
                rowY,
                colW,
                rowH,
                cell.verticalAnchor,
                { l: 7.2, t: 3.6, r: 7.2, b: 3.6 },
                ptScale
              );
            }

            colX += colW;
          }
          rowY += rowH;
        }
        ctx.restore();
      }
    }

    results.push({
      id: `pptx-${Date.now()}-${slide.index}-${Math.random().toString(36).slice(2, 6)}`,
      title: slide.title,
      dataUrl: canvas.toDataURL('image/png'),
      width: canvasW,
      height: canvasH,
      sourceType: 'pptx',
      notes: slide.notes || undefined,
    });
  }

  return results;
}
