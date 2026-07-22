import React, { useLayoutEffect, useRef } from 'react';

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

export function Meteocon({ name, size = 22, className = '', ...props }: MeteoconProps) {
  const rawSvg = METEOCONS[name] || METEOCONS['cloudy'];
  const numericSize = typeof size === 'number' ? Math.round(size * 1.2) : size;
  const dim = typeof numericSize === 'number' ? `${numericSize}px` : numericSize;
  const spanRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    el.style.setProperty('width', dim);
    el.style.setProperty('height', dim);
  }, [dim]);

  return (
    <span
      ref={spanRef}
      className={`inline-flex shrink-0 items-center justify-center pointer-events-none [&>svg]:w-full [&>svg]:h-full ${className}`}
      dangerouslySetInnerHTML={{ __html: rawSvg }}
      {...props}
    />
  );
}
