/** Generate a deterministic gradient from a string seed (name or ID). */
export function bannerGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40 + Math.abs((hash >> 8) % 30)) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 35%, 55%) 0%, hsl(${h2}, 45%, 65%) 100%)`;
}
