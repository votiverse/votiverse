/**
 * Deterministic avatar component using DiceBear.
 * Supports multiple styles. Same seed always produces the same face.
 * Custom avatar URLs override the generated avatar.
 */

/** Available DiceBear avatar styles. */
/** All character-based DiceBear styles (best for user avatars). */
export const AVATAR_STYLES = [
  "avataaars",
  "avataaars-neutral",
  "adventurer",
  "adventurer-neutral",
  "big-ears",
  "big-ears-neutral",
  "big-smile",
  "bottts",
  "bottts-neutral",
  "croodles",
  "croodles-neutral",
  "dylan",
  "fun-emoji",
  "lorelei",
  "lorelei-neutral",
  "micah",
  "miniavs",
  "notionists",
  "notionists-neutral",
  "open-peeps",
  "personas",
  "pixel-art",
  "pixel-art-neutral",
  "thumbs",
  "shapes",
  "glass",
  "rings",
  "identicon",
] as const;

/** Human-readable labels for styles. */
export const AVATAR_STYLE_LABELS: Record<string, string> = {
  "avataaars": "Avataaars",
  "avataaars-neutral": "Avataaars Neutral",
  "adventurer": "Adventurer",
  "adventurer-neutral": "Adventurer Neutral",
  "big-ears": "Big Ears",
  "big-ears-neutral": "Big Ears Neutral",
  "big-smile": "Big Smile",
  "bottts": "Robots",
  "bottts-neutral": "Robots Neutral",
  "croodles": "Croodles",
  "croodles-neutral": "Croodles Neutral",
  "dylan": "Dylan",
  "fun-emoji": "Fun Emoji",
  "lorelei": "Lorelei",
  "lorelei-neutral": "Lorelei Neutral",
  "micah": "Micah",
  "miniavs": "Mini Avatars",
  "notionists": "Notionists",
  "notionists-neutral": "Notionists Neutral",
  "open-peeps": "Open Peeps",
  "personas": "Personas",
  "pixel-art": "Pixel Art",
  "pixel-art-neutral": "Pixel Art Neutral",
  "thumbs": "Thumbs",
  "shapes": "Shapes",
  "glass": "Glass",
  "rings": "Rings",
  "identicon": "Identicon",
};

export type AvatarStyle = typeof AVATAR_STYLES[number];

const DICEBEAR_BASE = "https://api.dicebear.com/9.x";

/** Generate a DiceBear avatar URL for a given style and seed. */
export function avatarUrl(seed: string, style: AvatarStyle = "avataaars"): string {
  return `${DICEBEAR_BASE}/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<AvatarSize, string> = {
  xs: "w-5 h-5",
  sm: "w-7 h-7",
  md: "w-9 h-9",
  lg: "w-12 h-12",
  xl: "w-16 h-16",
};

interface AvatarProps {
  name: string;
  /** Custom avatar URL — overrides DiceBear generation. */
  url?: string | null;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ name, url, size = "md", className = "" }: AvatarProps) {
  const src = url || avatarUrl(name);
  return (
    <img
      src={src}
      alt={name}
      className={`${sizeClasses[size]} rounded-full bg-gray-100 shrink-0 ${className}`}
      loading="lazy"
    />
  );
}
