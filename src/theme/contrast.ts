function toRgb(color: string): [number, number, number] | null {
  const value = color.trim();
  const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map((v) => Math.max(0, Math.min(255, v))) as [number, number, number];
  if (!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)) return null;
  const c = value.replace('#', '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

export function luminance(color: string): number {
  const rgb = toRgb(color);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((channel) => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: string, bg: string): number {
  const L1 = luminance(fg);
  const L2 = luminance(bg);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

export function isAAPass(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= 4.5;
}
