/**
 * DelegatedIcon — a person silhouette with a forward arrow.
 * Indicates that the current user has delegated their vote on a topic.
 */

interface DelegatedIconProps {
  size?: number;
  className?: string;
}

export function DelegatedIcon({ size = 16, className = "" }: DelegatedIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Person silhouette (head + shoulders) */}
      <circle cx="8" cy="6" r="3" fill="currentColor" />
      <path
        d="M2 16.5C2 13.5 4.5 11.5 8 11.5C9 11.5 9.8 11.7 10.5 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Forward arrow */}
      <path
        d="M13 13L17 13M17 13L15 11M17 13L15 15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
