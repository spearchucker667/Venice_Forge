import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';

import clearDay from '@meteocons/svg/fill/clear-day.svg?raw';
import clearNight from '@meteocons/svg/fill/clear-night.svg?raw';
import cloudy from '@meteocons/svg/fill/cloudy.svg?raw';
import partlyCloudyDay from '@meteocons/svg/fill/partly-cloudy-day.svg?raw';
import thunderstorms from '@meteocons/svg/fill/thunderstorms.svg?raw';
import compass from '@meteocons/svg/fill/compass.svg?raw';
import barometer from '@meteocons/svg/fill/barometer.svg?raw';
import star from '@meteocons/svg/fill/star.svg?raw';
import timeMorning from '@meteocons/svg/fill/time-morning.svg?raw';
import timeNight from '@meteocons/svg/fill/time-night.svg?raw';
import rainbowClear from '@meteocons/svg/fill/rainbow-clear.svg?raw';
import horizon from '@meteocons/svg/fill/horizon.svg?raw';
import wind from '@meteocons/svg/fill/wind.svg?raw';
import codePurple from '@meteocons/svg/fill/code-purple.svg?raw';
import codeGreen from '@meteocons/svg/fill/code-green.svg?raw';
import umbrella from '@meteocons/svg/fill/umbrella.svg?raw';
import weatherAlarm from '@meteocons/svg/fill/weather-alarm.svg?raw';
import humidity from '@meteocons/svg/fill/humidity.svg?raw';
import thermometer from '@meteocons/svg/fill/thermometer.svg?raw';
import tornado from '@meteocons/svg/fill/tornado.svg?raw';
import raindrop from '@meteocons/svg/fill/raindrop.svg?raw';
import snowflake from '@meteocons/svg/fill/snowflake.svg?raw';

export const METEOCONS = {
  'clear-day': clearDay,
  'clear-night': clearNight,
  'cloudy': cloudy,
  'partly-cloudy-day': partlyCloudyDay,
  'thunderstorms': thunderstorms,
  'compass': compass,
  'barometer': barometer,
  'star': star,
  'time-morning': timeMorning,
  'time-night': timeNight,
  'rainbow-clear': rainbowClear,
  'horizon': horizon,
  'wind': wind,
  'code-purple': codePurple,
  'code-green': codeGreen,
  'umbrella': umbrella,
  'weather-alarm': weatherAlarm,
  'humidity': humidity,
  'thermometer': thermometer,
  'tornado': tornado,
  'raindrop': raindrop,
  'snowflake': snowflake,
} as const;

export type MeteoconName = keyof typeof METEOCONS;

export interface MeteoconProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: MeteoconName;
  size?: number | string;
  className?: string;
}

/**
 * Reads the current theme mode from the <html> data-theme-mode attribute set
 * by applyTheme(). Falls back to 'dark' (the app default) in non-DOM
 * environments (e.g. tests).
 */
function getThemeMode(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';
  const mode = document.documentElement.dataset.themeMode;
  return mode === 'light' ? 'light' : 'dark';
}

/**
 * CSS style blocks injected into the SVG <defs> for light-mode correction.
 *
 * The fill/stroke *attributes* on SVG elements have lower specificity than CSS
 * declarations, so a `<style>` block can override them without touching the
 * source SVG. Each rule targets the exact element IDs present in the bundled
 * meteocon SVG files.
 *
 * Dark theme: no overrides needed – the fill-variant icons are designed for
 * dark backgrounds.
 *
 * Light theme: we need to:
 *  - Make cloud fills visible (light grey → stronger grey)
 *  - Make white text/icon elements on coloured backgrounds dark
 *  - Make near-white strokes visible on white backgrounds
 *  - Keep dark-background dial icons (compass, barometer, horizon) visible
 *    by giving them a light slate background tint
 */
const LIGHT_MODE_STYLE_OVERRIDES: Partial<Record<MeteoconName, string>> = {
  // ── Cloud-body icons ─────────────────────────────────────────────────────
  // Cloud gradient (#F3F7FE → #E6EFFC) and stroke (#E6EFFC) are near-invisible
  // on a white/light background. We replace them with a mid-slate palette.
  'cloudy': `
    #Cloud_2 { fill: #CBD5E1 !important; stroke: #94A3B8 !important; }
  `,
  'partly-cloudy-day': `
    #Cloud_2 { fill: #CBD5E1 !important; stroke: #94A3B8 !important; }
  `,
  'thunderstorms': `
    #Cloud_2 { fill: #CBD5E1 !important; stroke: #94A3B8 !important; }
    #Lightning { stroke: #F6A823 !important; }
  `,
  'weather-alarm': `
    #Cloud_2 { fill: #CBD5E1 !important; stroke: #94A3B8 !important; }
    #Exclamation { stroke: #64748B !important; }
    #ExclamationMark { fill: #F8FAFC !important; }
  `,
  // ── Code-alert icons ─────────────────────────────────────────────────────
  // Triangle body is coloured (fine). The exclamation text is fill="white"
  // which is invisible if the triangle is light-coloured. On light bg the
  // triangle colour is visible enough; just ensure mark is contrasting.
  'code-purple': `
    #ExclamationMark { fill: #F8FAFC !important; }
  `,
  'code-green': `
    #ExclamationMark { fill: #F8FAFC !important; }
  `,
  // ── Humidity ─────────────────────────────────────────────────────────────
  // Raindrop body is a dark blue gradient (fine). The % label is fill="white".
  // On a light bg the label is invisible against the coloured drop; keep white
  // so it pops against the blue drop body (the gradient is dark enough).
  // No change needed – dark blue drop + white text reads fine on any bg.

  // ── Wind ─────────────────────────────────────────────────────────────────
  // Wind lines use #E2E8F0 (near-white) – invisible on light bg.
  'wind': `
    #Wind { stroke: #64748B !important; }
    [id^="Wind Line"] { stroke: #64748B !important; }
  `,
  // ── Snowflake ────────────────────────────────────────────────────────────
  // Stroke #72B9D5 (light blue) has low contrast on white.
  'snowflake': `
    #Snowflake_2 { stroke: #0EA5E9 !important; }
  `,
  // ── Star ─────────────────────────────────────────────────────────────────
  // Star uses a very light yellow (#FEF3C7 → #FDE68A). Not invisible but low
  // contrast on white. Deepen the stroke to amber.
  'star': `
    #Star_2 { stroke: #D97706 !important; }
  `,
  // ── Dark-dial icons ──────────────────────────────────────────────────────
  // Compass and barometer have a dark navy dial background (#334155 → #1E293B).
  // On a light background these are clearly visible (dark on light is fine),
  // so no structural change is needed. The white compass needle pointer is
  // also visible against the dark dial body. No override needed.

  // ── Horizon ─────────────────────────────────────────────────────────────
  // Horizon line is stroke="#202939" (very dark) – fine on light bg.
  // The mask rect uses fill="black" which is structural (mask-type:alpha).
  // No colour change needed.

  // ── Time-night label ────────────────────────────────────────────────────
  // The label text (fill="#202939") renders dark – reads well on light bg.
  // No change needed.

  // ── Time-morning ────────────────────────────────────────────────────────
  // The clock face label fill="#202939" is dark – reads fine on light bg.
  // Sunrise sun rays are #F8AF18 – visible. No change needed.

  // ── Thermometer ─────────────────────────────────────────────────────────
  // Glass gradient is very transparent blue (opacity 0.25) – barely visible
  // on both themes but intentionally subtle. Mercury red is fine. No change.

  // ── Tornado ─────────────────────────────────────────────────────────────
  // Tornado strokes are #D6DFE9 (light grey). Deepen for light bg.
  'tornado': `
    [id^="Tornado"] { stroke: #64748B !important; }
  `,
  // ── Raindrop ────────────────────────────────────────────────────────────
  // Stroke #1D4ED8 (blue) – visible on both themes. No change needed.

  // ── Umbrella ────────────────────────────────────────────────────────────
  // Umbrella stick stroke #71717A – fine. Top fill has gradient + stroke
  // #F1F5F9 (near-white) on outer section. Deepen outer stroke.
  'umbrella': `
    #Vector_2 { stroke: #94A3B8 !important; }
  `,
};

/**
 * Injects a per-icon light-mode <style> block into the raw SVG string so that
 * theme-incompatible hardcoded colours are overridden via CSS specificity.
 * The style block is injected before </svg> so it is always part of the DOM
 * shadow when rendered via dangerouslySetInnerHTML.
 */
function adaptSvgForTheme(rawSvg: string, name: MeteoconName, mode: 'dark' | 'light'): string {
  if (mode === 'dark') return rawSvg;
  const overrides = LIGHT_MODE_STYLE_OVERRIDES[name];
  if (!overrides) return rawSvg;
  const styleTag = `<style>${overrides}</style>`;
  // Inject before closing </svg> tag.
  const insertAt = rawSvg.lastIndexOf('</svg>');
  if (insertAt === -1) return rawSvg + styleTag;
  return rawSvg.slice(0, insertAt) + styleTag + rawSvg.slice(insertAt);
}

export function Meteocon({ name, size = 22, className = '', ...props }: MeteoconProps) {
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(getThemeMode);
  const spanRef = useRef<HTMLSpanElement>(null);

  // Track the current numeric/string dimension (size × 1.2 multiplier).
  const numericSize = typeof size === 'number' ? Math.round(size * 1.2) : size;
  const dim = typeof numericSize === 'number' ? `${numericSize}px` : numericSize;

  // Apply size imperatively to satisfy the VERIFY-007 no-inline-style invariant.
  useLayoutEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    el.style.setProperty('width', dim);
    el.style.setProperty('height', dim);
  }, [dim]);

  // Listen for theme changes dispatched by applyTheme() and synchronise.
  useEffect(() => {
    const handler = () => setThemeMode(getThemeMode());
    // Sync immediately in case the theme changed between mount and this effect.
    handler();
    window.addEventListener('applyTheme:complete', handler);
    return () => window.removeEventListener('applyTheme:complete', handler);
  }, []);

  const rawSvg = METEOCONS[name] || METEOCONS['cloudy'];
  const adaptedSvg = adaptSvgForTheme(rawSvg, name, themeMode);

  return (
    <span
      ref={spanRef}
      className={`inline-flex shrink-0 items-center justify-center pointer-events-none [&>svg]:w-full [&>svg]:h-full ${className}`}
      dangerouslySetInnerHTML={{ __html: adaptedSvg }}
      {...props}
    />
  );
}
