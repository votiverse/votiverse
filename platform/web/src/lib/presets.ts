/** Maps engine preset config names to user-facing labels.
 *  Used wherever a preset name appears in the UI — assembly cards, profile, dashboard.
 */
export const PRESET_LABELS: Record<string, string> = {
  "Town Hall": "Everyone votes directly",
  "Swiss Model": "Discuss, then vote",
  "Liquid Standard": "Flexible delegation",
  "Liquid Accountable": "Delegates with accountability",
  "Board Proxy": "Elected representatives",
  "Civic Participatory": "Mixed — direct votes and delegates",
};

/** Return a plain-language label for a preset config name. Falls back to the raw name. */
export function presetLabel(configName: string): string {
  return PRESET_LABELS[configName] ?? configName;
}
