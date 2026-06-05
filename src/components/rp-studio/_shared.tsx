/**
 * @fileoverview Local utilities shared by the RP Studio sub-components.
 *
 * Kept tiny and side-effect-free. UI components import formatters from here.
 */

import type { RpRole } from "../../types/rp";
import { Badge } from "../ui/shared";

export const RP_SUB_TABS = [
  { id: "library", label: "Characters" },
  { id: "personas", label: "Personas" },
  { id: "lorebooks", label: "Lorebooks" },
  { id: "chats", label: "Chats" },
  { id: "scenes", label: "Scenes" },
] as const;

export type RpSubTabId = (typeof RP_SUB_TABS)[number]["id"];

export function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 0) return "in the future";
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export function roleLabel(role: RpRole, characterName?: string): string {
  switch (role) {
    case "system":
      return "System";
    case "user":
      return "You";
    case "character":
      return characterName ?? "Character";
    case "narrator":
      return "Narrator";
    case "tool":
      return "Tool";
  }
}

export function roleBadgeTone(role: RpRole): "slate" | "emerald" | "violet" | "amber" | "sky" | "pink" {
  switch (role) {
    case "system":
      return "slate";
    case "user":
      return "emerald";
    case "character":
      return "violet";
    case "narrator":
      return "amber";
    case "tool":
      return "sky";
  }
}

export function RolePill({ role, characterName }: { role: RpRole; characterName?: string }) {
  return <Badge tone={roleBadgeTone(role)}>{roleLabel(role, characterName)}</Badge>;
}

export function avatarDataUri(avatar: { data: string; mimeType: string } | undefined): string | undefined {
  if (!avatar) return undefined;
  if (avatar.data.startsWith("data:")) return avatar.data;
  if (avatar.data.startsWith("http") || avatar.data.startsWith("file:")) return avatar.data;
  return `data:${avatar.mimeType};base64,${avatar.data}`;
}
