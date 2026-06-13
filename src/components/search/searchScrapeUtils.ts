export const ALL_PLATFORMS = [
  "GitHub",
  "LinkedIn",
  "X/Twitter",
  "Instagram",
  "TikTok",
  "YouTube",
  "Reddit",
  "Facebook",
  "Bluesky",
  "Threads",
  "Mastodon",
  "personal website",
];

export function safeHref(url: string | undefined): string {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? url : "#";
  } catch {
    return "#";
  }
}
