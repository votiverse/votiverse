# @votiverse/config

Governance configuration schemas, validation, named presets, and diffing.

## What it provides

- **GovernanceConfig type** — complete configuration schema covering delegation primitives, ballot parameters, feature toggles, and thresholds.
- **Validation** — `validateConfig(config)` checks for internal consistency (e.g., "if delegation is disabled, transitivity must also be disabled"). Returns errors and warnings.
- **Named presets** — `PRESETS.TOWN_HALL`, `PRESETS.SWISS_MODEL`, `PRESETS.LIQUID_STANDARD`, `PRESETS.LIQUID_ACCOUNTABLE`, `PRESETS.BOARD_PROXY`, `PRESETS.CIVIC_PARTICIPATORY`.
- **Configuration diffing** — `diffConfig(a, b)` shows what a customized config changed from its base preset.
- **Configuration derivation** — `deriveConfig(base, overrides)` creates a new config from a preset with overrides. The base is never mutated.

## Usage

```typescript
import {
  getPreset,
  deriveConfig,
  validateConfig,
  diffConfig,
  PRESETS,
} from "@votiverse/config";

// Use a preset directly
const config = getPreset("LIQUID_STANDARD");

// Customize a preset
const custom = deriveConfig(getPreset("SWISS_MODEL"), {
  name: "Our Co-op",
  delegation: { enabled: true, topicScoped: true },
  ballot: { quorum: 0.3 },
});

// Validate
const result = validateConfig(custom);
if (!result.valid) {
  console.error(result.issues);
}

// See what changed from the base
const diffs = diffConfig(getPreset("SWISS_MODEL"), custom);
```

## Dependencies

- `@votiverse/core`
