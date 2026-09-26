interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function clampChannel(v: number): number {
  return Math.max(0, Math.min(255, v));
}

function clampAlpha(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Parse a CSS color into RGBA channels. Supports:
 *   - Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
 *   - rgb()/rgba(): comma- or space-separated, optional alpha (number or %,
 *     comma or slash syntax)
 *   - hsl()/hsla(): hue (deg optional), saturation %, lightness %, optional
 *     alpha (number or %, comma or slash syntax)
 *
 * Returns null for unrecognized values (including CSS keywords such as
 * "transparent", whose contrast behavior is defined by callers).
 */
function parseColor(color: string): RgbaColor | null {
  const value = color.trim();

  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    const c = hex[1];
    if (c.length === 3 || c.length === 4) {
      return {
        r: parseInt(c[0] + c[0], 16),
        g: parseInt(c[1] + c[1], 16),
        b: parseInt(c[2] + c[2], 16),
        a: c.length === 4 ? parseInt(c[3] + c[3], 16) / 255 : 1,
      };
    }
    if (c.length === 6 || c.length === 8) {
      return {
        r: parseInt(c.slice(0, 2), 16),
        g: parseInt(c.slice(2, 4), 16),
        b: parseInt(c.slice(4, 6), 16),
        a: c.length === 8 ? parseInt(c.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  const rgb = /^rgba?\(\s*([-+]?\d+(?:\.\d+)?)\s*[, ]\s*([-+]?\d+(?:\.\d+)?)\s*[, ]\s*([-+]?\d+(?:\.\d+)?)(?:\s*[,/]\s*([-+]?\d+(?:\.\d+)?)(%)?)?\s*\)$/i.exec(value);
  if (rgb) {
    let a = 1;
    if (rgb[4] !== undefined) {
      const raw = Number(rgb[4]);
      a = clampAlpha(rgb[5] === '%' ? raw / 100 : raw);
    }
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a };
  }

  const hsl = /^hsla?\(\s*([-+]?\d+(?:\.\d+)?)(?:deg)?\s*[, ]\s*([-+]?\d+(?:\.\d+)?)%\s*[, ]\s*([-+]?\d+(?:\.\d+)?)%(?:\s*[,/]\s*([-+]?\d+(?:\.\d+)?)(%)?)?\s*\)$/i.exec(value);
  if (hsl) {
    const h = (Number(hsl[1]) % 360 + 360) % 360;
    const s = Math.max(0, Math.min(100, Number(hsl[2]))) / 100;
    const l = Math.max(0, Math.min(100, Number(hsl[3]))) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = c; g = 0; b = x; }
    else { r = x; g = 0; b = c; }
    let a = 1;
    if (hsl[4] !== undefined) {
      const raw = Number(hsl[4]);
      a = clampAlpha(hsl[5] === '%' ? raw / 100 : raw);
    }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a };
  }

  return null;
}

/** Standard "over" alpha compositing of fg on top of bg. */
function compositeOver(fg: RgbaColor, bg: RgbaColor): RgbaColor {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
    a,
  };
}

function toRgb(color: string, background = '#ffffff'): [number, number, number] | null {
  const parsed = parseColor(color);
  if (!parsed) return null;
  const bg = parseColor(background) ?? { r: 255, g: 255, b: 255, a: 1 };
  const c = compositeOver(parsed, bg);
  return [clampChannel(c.r), clampChannel(c.g), clampChannel(c.b)];
}

function luminanceFromRgb(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function luminance(color: string): number {
  const rgb = toRgb(color);
  if (!rgb) return 0;
  return luminanceFromRgb(rgb);
}

export function contrastRatio(fg: string, bg: string): number {
  // Composite a semi-transparent foreground over its background before
  // measuring, so e.g. 80% white on near-black reads as high contrast instead
  // of the raw (uncomposited) white-on-black ratio.
  const fgRgb = toRgb(fg, bg);
  const L1 = fgRgb ? luminanceFromRgb(fgRgb) : 0;
  const L2 = luminance(bg);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

export function isAAPass(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= 4.5;
}
