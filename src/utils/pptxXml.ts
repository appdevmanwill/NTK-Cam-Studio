export interface XmlNode {
  tag: string;
  localName: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

export function decodeXmlEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g,
    (match, entity: string) => {
      switch (entity) {
        case 'amp':
          return '&';
        case 'lt':
          return '<';
        case 'gt':
          return '>';
        case 'quot':
          return '"';
        case 'apos':
          return "'";
        default: {
          const code = entity.startsWith('#x')
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
          if (Number.isInteger(code) && code >= 0 && code <= 0x10ffff) {
            return String.fromCodePoint(code);
          }
          return match;
        }
      }
    }
  );
}

function getLocalName(tag: string): string {
  const idx = tag.indexOf(':');
  return idx === -1 ? tag : tag.slice(idx + 1);
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(attrString)) !== null) {
    const key = match[1];
    const val = decodeXmlEntities(match[2] ?? match[3] ?? '');
    attrs[key] = val;
    const local = getLocalName(key);
    if (!(local in attrs)) {
      attrs[local] = val;
    }
  }
  return attrs;
}

/**
 * Lightweight, deterministic XML tree parser that works identically in Browser and Node.js.
 * Preserves exact child Z-order and distinguishes direct children from nested descendants.
 */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = {
    tag: '#root',
    localName: '#root',
    attrs: {},
    children: [],
    text: '',
  };

  // Strip XML declarations, comments, and DOCTYPE headers
  const cleaned = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '');

  const stack: XmlNode[] = [root];
  const tokenRe = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^<>]*?)?)(\/?)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(cleaned)) !== null) {
    const [, closingSlash, tagName, rawAttrs, selfClosingSlash, textChunk] = match;

    if (textChunk !== undefined) {
      const current = stack[stack.length - 1];
      if (current && textChunk.length > 0) {
        current.text += decodeXmlEntities(textChunk);
      }
      continue;
    }

    if (closingSlash === '/') {
      // Pop matching tag from stack
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].tag === tagName || stack[i].localName === getLocalName(tagName)) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const node: XmlNode = {
      tag: tagName,
      localName: getLocalName(tagName),
      attrs: rawAttrs ? parseAttributes(rawAttrs) : {},
      children: [],
      text: '',
    };

    const parent = stack[stack.length - 1];
    parent.children.push(node);

    if (selfClosingSlash !== '/') {
      stack.push(node);
    }
  }

  return root;
}

export function getChild(node: XmlNode | null | undefined, localName: string): XmlNode | undefined {
  if (!node) return undefined;
  return node.children.find((c) => c.localName === localName);
}

export function getChildren(node: XmlNode | null | undefined, localName: string): XmlNode[] {
  if (!node) return [];
  return node.children.filter((c) => c.localName === localName);
}

export function findDescendant(
  node: XmlNode | null | undefined,
  localName: string
): XmlNode | undefined {
  if (!node) return undefined;
  for (const child of node.children) {
    if (child.localName === localName) return child;
    const nested = findDescendant(child, localName);
    if (nested) return nested;
  }
  return undefined;
}

export function findDescendants(node: XmlNode | null | undefined, localName: string): XmlNode[] {
  const out: XmlNode[] = [];
  if (!node) return out;
  const walk = (curr: XmlNode) => {
    for (const child of curr.children) {
      if (child.localName === localName) {
        out.push(child);
      }
      walk(child);
    }
  };
  walk(node);
  return out;
}

export function collectText(node: XmlNode | null | undefined): string {
  if (!node) return '';
  let result = node.text;
  for (const child of node.children) {
    result += collectText(child);
  }
  return result;
}

// ============================================================================
// OOXML Color Resolution & Transform Engine (HSL lumMod/lumOff/tint/shade/alpha)
// ============================================================================

const PRESET_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#FF0000',
  green: '#008000',
  blue: '#0000FF',
  yellow: '#FFFF00',
  cyan: '#00FFFF',
  magenta: '#FF00FF',
  gray: '#808080',
  grey: '#808080',
  dkGray: '#A9A9A9',
  ltGray: '#D3D3D3',
  silver: '#C0C0C0',
  navy: '#000080',
  teal: '#008080',
  maroon: '#800000',
  olive: '#808000',
  purple: '#800080',
  orange: '#FFA500',
  gold: '#FFD700',
  crimson: '#DC143C',
  indigo: '#4B0082',
  coral: '#FF7F50',
  turquoise: '#40E0D0',
  slateGray: '#708090',
  darkBlue: '#00008B',
  darkSlateGray: '#2F4F4F',
  midnightBlue: '#191970',
};

export interface RgbaColor {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
  a: number; // 0..1
}

export function hexToRgba(color: string, alpha = 1): RgbaColor {
  const trimmed = color.trim();
  const rgbaMatch = trimmed.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/i
  );
  if (rgbaMatch) {
    return {
      r: Number(rgbaMatch[1]),
      g: Number(rgbaMatch[2]),
      b: Number(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) * alpha : alpha,
    };
  }
  const clean = trimmed.replace('#', '');
  if (clean.length !== 6) {
    return { r: 0, g: 0, b: 0, a: alpha };
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
    a: alpha,
  };
}

export function rgbaToCss(c: RgbaColor): string {
  const r = Math.max(0, Math.min(255, Math.round(c.r)));
  const g = Math.max(0, Math.min(255, Math.round(c.g)));
  const b = Math.max(0, Math.min(255, Math.round(c.b)));
  const a = Math.max(0, Math.min(1, c.a));
  if (a >= 0.995) {
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

export function isDarkCssColor(cssColor: string): boolean {
  if (cssColor.startsWith('#') && cssColor.length === 7) {
    const c = hexToRgba(cssColor);
    const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    return lum < 0.48;
  }
  const match = cssColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (match) {
    const lum = (0.299 * Number(match[1]) + 0.587 * Number(match[2]) + 0.114 * Number(match[3])) / 255;
    return lum < 0.48;
  }
  return false;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, tInput: number) => {
    let t = tInput;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

/**
 * Applies OOXML color child modifiers (lumMod, lumOff, tint, shade, satMod, satOff, alpha)
 * to a base RGB color following the ECMA-376 specification.
 */
export function applyOoxmlColorTransforms(baseHex: string, colorNode: XmlNode): string {
  const rgba = hexToRgba(baseHex, 1);

  for (const mod of colorNode.children) {
    const rawVal = Number(mod.attrs.val);
    if (!Number.isFinite(rawVal)) continue;
    const pct = rawVal / 100000;

    switch (mod.localName) {
      case 'alpha':
        rgba.a = Math.max(0, Math.min(1, pct));
        break;
      case 'alphaMod':
        rgba.a = Math.max(0, Math.min(1, rgba.a * pct));
        break;
      case 'alphaOff':
        rgba.a = Math.max(0, Math.min(1, rgba.a + pct));
        break;
      case 'tint':
        // OOXML tint mixes color toward white: c' = c * pct + 255 * (1 - pct)
        rgba.r = rgba.r * pct + 255 * (1 - pct);
        rgba.g = rgba.g * pct + 255 * (1 - pct);
        rgba.b = rgba.b * pct + 255 * (1 - pct);
        break;
      case 'shade':
        // OOXML shade mixes color toward black: c' = c * pct
        rgba.r = rgba.r * pct;
        rgba.g = rgba.g * pct;
        rgba.b = rgba.b * pct;
        break;
      case 'lumMod': {
        const [h, s, l] = rgbToHsl(rgba.r, rgba.g, rgba.b);
        const nextL = Math.max(0, Math.min(1, l * pct));
        const [r, g, b] = hslToRgb(h, s, nextL);
        rgba.r = r;
        rgba.g = g;
        rgba.b = b;
        break;
      }
      case 'lumOff': {
        const [h, s, l] = rgbToHsl(rgba.r, rgba.g, rgba.b);
        const nextL = Math.max(0, Math.min(1, l + pct));
        const [r, g, b] = hslToRgb(h, s, nextL);
        rgba.r = r;
        rgba.g = g;
        rgba.b = b;
        break;
      }
      case 'satMod': {
        const [h, s, l] = rgbToHsl(rgba.r, rgba.g, rgba.b);
        const nextS = Math.max(0, Math.min(1, s * pct));
        const [r, g, b] = hslToRgb(h, nextS, l);
        rgba.r = r;
        rgba.g = g;
        rgba.b = b;
        break;
      }
      case 'satOff': {
        const [h, s, l] = rgbToHsl(rgba.r, rgba.g, rgba.b);
        const nextS = Math.max(0, Math.min(1, s + pct));
        const [r, g, b] = hslToRgb(h, nextS, l);
        rgba.r = r;
        rgba.g = g;
        rgba.b = b;
        break;
      }
    }
  }

  return rgbaToCss(rgba);
}

/**
 * Resolves a color XML container (e.g. a:solidFill, a:gs, a:fillRef) using theme colors,
 * the active slide/master color map (bg1/tx1/bg2/tx2 -> dk1/lt1/etc.), and an optional phClr override.
 */
export function resolveColorContainer(
  container: XmlNode | null | undefined,
  themeColors: Record<string, string>,
  colorMap: Record<string, string>,
  phClrOverride?: string
): string | undefined {
  if (!container) return undefined;

  const srgb = getChild(container, 'srgbClr');
  if (srgb?.attrs.val) {
    return applyOoxmlColorTransforms(`#${srgb.attrs.val}`, srgb);
  }

  const scheme = getChild(container, 'schemeClr');
  if (scheme?.attrs.val) {
    const key = scheme.attrs.val;
    if (key === 'phClr' && phClrOverride) {
      return applyOoxmlColorTransforms(phClrOverride, scheme);
    }
    const mappedKey = colorMap[key] ?? key;
    const baseHex = themeColors[mappedKey] ?? themeColors[key];
    if (baseHex) {
      return applyOoxmlColorTransforms(baseHex, scheme);
    }
  }

  const sys = getChild(container, 'sysClr');
  if (sys) {
    const hex = sys.attrs.lastClr ?? (sys.attrs.val === 'window' ? 'FFFFFF' : '000000');
    return applyOoxmlColorTransforms(`#${hex}`, sys);
  }

  const prst = getChild(container, 'prstClr');
  if (prst?.attrs.val) {
    const baseHex = PRESET_COLORS[prst.attrs.val];
    if (baseHex) {
      return applyOoxmlColorTransforms(baseHex, prst);
    }
  }

  const scrgb = getChild(container, 'scrgbClr');
  if (scrgb) {
    const r = Math.round((Number(scrgb.attrs.r ?? 0) / 100000) * 255);
    const g = Math.round((Number(scrgb.attrs.g ?? 0) / 100000) * 255);
    const b = Math.round((Number(scrgb.attrs.b ?? 0) / 100000) * 255);
    const hex = rgbaToCss({ r, g, b, a: 1 });
    return applyOoxmlColorTransforms(hex, scrgb);
  }

  return undefined;
}
