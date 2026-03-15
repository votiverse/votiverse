/**
 * Deterministic avatar component using DiceBear's "avataaars" style.
 * Same name always produces the same face, so cross-assembly participants
 * (e.g. Sofia Reyes in OSC and Youth) get a consistent visual identity.
 */

const DICEBEAR_BASE = "https://api.dicebear.com/9.x/avataaars/svg";

export function avatarUrl(seed: string): string {
  return `${DICEBEAR_BASE}?seed=${encodeURIComponent(seed)}`;
}

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<AvatarSize, string> = {
  xs: "w-5 h-5",
  sm: "w-7 h-7",
  md: "w-9 h-9",
  lg: "w-12 h-12",
  xl: "w-16 h-16",
};

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ name, size = "md", className = "" }: AvatarProps) {
  return (
    <img
      src={avatarUrl(name)}
      alt={name}
      className={`${sizeClasses[size]} rounded-full bg-gray-100 shrink-0 ${className}`}
      loading="lazy"
    />
  );
}
