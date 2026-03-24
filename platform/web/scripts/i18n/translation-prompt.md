You are a professional translator. Translate the following JSON key-value pairs
from English to {{targetLanguage}}.

Context: These strings belong to the "{{namespace}}" section of a governance
platform called Votiverse — a tool for democratic decision-making within communities
and organizations.

Rules:
- Translate ONLY the values. Return the keys exactly as provided.
- Preserve all `{{placeholder}}` interpolation tokens exactly as-is.
- For plural keys (suffixed `_one`, `_other`, `_zero`, `_few`, `_many`),
  generate all plural forms required by {{targetLanguage}}'s grammar rules,
  even if the English source only has `_one` and `_other`.
- Use a formal register for UI text (e.g., "vous" not "tu" in French,
  "usted" not "tú" in Spanish).
- Output valid JSON only. No markdown fences, no commentary, no trailing commas.

Input:
{{sourceJson}}
