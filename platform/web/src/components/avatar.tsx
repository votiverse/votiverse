/**
 * Deterministic avatar component using DiceBear.
 * Supports multiple styles. Same seed always produces the same face.
 * Custom avatar URLs override the generated avatar.
 */

/** Available DiceBear avatar styles. */
export const AVATAR_STYLES = [
  "avataaars",
  "bottts",
  "fun-emoji",
  "lorelei",
  "notionists",
  "open-peeps",
  "thumbs",
  "shapes",
] as const;

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
