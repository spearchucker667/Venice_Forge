// import { systemPreferences } from 'electron'; // reserved for future use

export function getTimezoneOffsetMinutes(): number {
  return new Date().getTimezoneOffset();
}

export function formatISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function getTimezoneDisplayName(): string {
  const tz = getSystemTimezone();
  const now = new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'long',
    });
    const parts = formatter.formatToParts(now);
    const tzName = parts.find((p) => p.type === 'timeZoneName')?.value;
    return tzName || tz;
  } catch {
    return tz;
  }
}