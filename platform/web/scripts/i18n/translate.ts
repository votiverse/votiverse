/**
 * Translation pipeline CLI script for the Votiverse i18n system.
 *
 * Reads English source namespace files, detects new/stale/deleted keys
 * via content-addressable hashing, and translates missing keys using
 * the Anthropic API.
 *
 * Usage:
 *   pnpm run translate                          # all locales, all namespaces
 *   pnpm run translate --locale fr              # French only
 *   pnpm run translate --namespace governance   # one namespace, all locales
 *   pnpm run translate --dry-run                # report without translating
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { readdirSync } from "node:fs";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const WEB_ROOT = resolve(import.meta.dirname, "../..");
const LOCALES_CONFIG_PATH = join(WEB_ROOT, "locales.json");
const LOCALES_DIR = join(WEB_ROOT, "public", "locales");
const PROMPT_TEMPLATE_PATH = join(
  WEB_ROOT,
  "scripts",
  "i18n",
  "translation-prompt.md",
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocalesConfig {
  sourceLocale: string;
  targetLocales: string[];
}

/** Per-key manifest entry — stores the hash of the English value that was translated. */
interface ManifestEntry {
  hash: string;
}

/** Per-namespace map of key -> ManifestEntry. */
type NamespaceManifest = Record<string, ManifestEntry>;

/** Full manifest for a locale: namespace -> key -> entry. */
type LocaleManifest = Record<string, NamespaceManifest>;

/** Flat key-value translation map (one namespace). */
type TranslationMap = Record<string, string>;

type KeyClassification = "new" | "stale" | "up-to-date" | "deleted";

interface ClassifiedKey {
  key: string;
  classification: KeyClassification;
  englishValue?: string;
  currentHash?: string;
  manifestHash?: string;
}

interface NamespaceReport {
  namespace: string;
  keys: ClassifiedKey[];
  newCount: number;
  staleCount: number;
  upToDateCount: number;
  deletedCount: number;
}

interface LocaleReport {
  locale: string;
  namespaces: NamespaceReport[];
  totalNew: number;
  totalStale: number;
  totalUpToDate: number;
  totalDeleted: number;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  locale?: string;
  namespace?: string;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { dryRun: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--locale":
        result.locale = args[++i];
        if (!result.locale) {
          console.error("Error: --locale requires a value (e.g., --locale fr)");
          process.exit(1);
        }
        break;
      case "--namespace":
        result.namespace = args[++i];
        if (!result.namespace) {
          console.error(
            "Error: --namespace requires a value (e.g., --namespace governance)",
          );
          process.exit(1);
        }
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        console.error(
          "Usage: translate.ts [--locale <code>] [--namespace <name>] [--dry-run]",
        );
        process.exit(1);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

function readJson<T>(filePath: string): T {
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function writeJsonSorted(filePath: string, data: Record<string, unknown>): void {
  const sorted = Object.keys(data)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = data[key];
      return acc;
    }, {});
  writeFileSync(filePath, JSON.stringify(sorted, null, 2) + "\n", "utf-8");
}

function writeManifest(filePath: string, manifest: LocaleManifest): void {
  // Sort namespaces and keys within each namespace for stable diffs.
  const sorted: LocaleManifest = {};
  for (const ns of Object.keys(manifest).sort()) {
    sorted[ns] = {};
    for (const key of Object.keys(manifest[ns]).sort()) {
      sorted[ns][key] = manifest[ns][key];
    }
  }
  writeFileSync(filePath, JSON.stringify(sorted, null, 2) + "\n", "utf-8");
}

function loadManifest(localeDir: string): LocaleManifest {
  const manifestPath = join(localeDir, "_manifest.json");
  if (!existsSync(manifestPath)) {
    return {};
  }
  return readJson<LocaleManifest>(manifestPath);
}

function discoverNamespaces(sourceDir: string): string[] {
  return readdirSync(sourceDir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => basename(f, ".json"))
    .sort();
}

// ---------------------------------------------------------------------------
// Key classification
// ---------------------------------------------------------------------------

function classifyKeys(
  englishMap: TranslationMap,
  nsManifest: NamespaceManifest,
): ClassifiedKey[] {
  const result: ClassifiedKey[] = [];
  const allKeys = new Set([
    ...Object.keys(englishMap),
    ...Object.keys(nsManifest),
  ]);

  for (const key of allKeys) {
    const englishValue = englishMap[key];
    const manifestEntry = nsManifest[key];

    if (englishValue !== undefined && !manifestEntry) {
      // Key exists in English but not in manifest => new
      result.push({
        key,
        classification: "new",
        englishValue,
        currentHash: hashValue(englishValue),
      });
    } else if (englishValue !== undefined && manifestEntry) {
      const currentHash = hashValue(englishValue);
      if (currentHash === manifestEntry.hash) {
        result.push({
          key,
          classification: "up-to-date",
          englishValue,
          currentHash,
          manifestHash: manifestEntry.hash,
        });
      } else {
        result.push({
          key,
          classification: "stale",
          englishValue,
          currentHash,
          manifestHash: manifestEntry.hash,
        });
      }
    } else if (englishValue === undefined && manifestEntry) {
      // Key deleted from English
      result.push({
        key,
        classification: "deleted",
        manifestHash: manifestEntry.hash,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// LLM Translation
// ---------------------------------------------------------------------------

/** Language names for the LLM prompt — more natural than ISO codes. */
const LANGUAGE_NAMES: Record<string, string> = {
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  "pt-BR": "Brazilian Portuguese",
  de: "German",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  uk: "Ukrainian",
  ru: "Russian",
  tr: "Turkish",
  ar: "Arabic",
  hi: "Hindi",
  zh: "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  ja: "Japanese",
  ko: "Korean",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
};

function getLanguageName(locale: string): string {
  return LANGUAGE_NAMES[locale] ?? locale;
}

function buildPrompt(
  targetLanguage: string,
  namespace: string,
  sourceJson: TranslationMap,
): string {
  const template = readFileSync(PROMPT_TEMPLATE_PATH, "utf-8");
  return template
    .replace(/\{\{targetLanguage\}\}/g, targetLanguage)
    .replace(/\{\{namespace\}\}/g, namespace)
    .replace(/\{\{sourceJson\}\}/g, JSON.stringify(sourceJson, null, 2));
}

async function translateBatch(
  locale: string,
  namespace: string,
  keysToTranslate: TranslationMap,
): Promise<TranslationMap> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: ANTHROPIC_API_KEY environment variable is not set.",
    );
    console.error(
      "Set it before running: export ANTHROPIC_API_KEY=sk-ant-...",
    );
    process.exit(1);
  }

  // Dynamic import to avoid requiring the SDK when --dry-run is used.
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const targetLanguage = getLanguageName(locale);
  const prompt = buildPrompt(targetLanguage, namespace, keysToTranslate);

  const keyCount = Object.keys(keysToTranslate).length;
  console.log(
    `  Translating ${keyCount} key(s) in "${namespace}" to ${targetLanguage}...`,
  );

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16384,
        messages: [{ role: "user", content: prompt }],
      });

      // Extract text from the response.
      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text content in LLM response");
      }

      let responseText = textBlock.text.trim();

      // Strip markdown code fences if the LLM wrapped them despite instructions.
      if (responseText.startsWith("```")) {
        responseText = responseText
          .replace(/^```(?:json)?\s*\n?/, "")
          .replace(/\n?```\s*$/, "");
      }

      // Sanitize common LLM JSON issues:
      // 1. Trailing commas before } or ]
      responseText = responseText.replace(/,\s*([}\]])/g, "$1");
      // 2. Ensure response starts with { and ends with } (trim any trailing text)
      const firstBrace = responseText.indexOf("{");
      const lastBrace = responseText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        responseText = responseText.slice(firstBrace, lastBrace + 1);
      }

      const parsed = JSON.parse(responseText) as TranslationMap;

      // Validate: ensure all requested keys are present.
      const missingKeys = Object.keys(keysToTranslate).filter(
        (k) => !(k in parsed),
      );
      if (missingKeys.length > 0) {
        console.warn(
          `  Warning: LLM response missing ${missingKeys.length} key(s): ${missingKeys.slice(0, 5).join(", ")}${missingKeys.length > 5 ? "..." : ""}`,
        );
      }

      return parsed;
    } catch (err) {
      if (attempts < maxAttempts) {
        console.warn(
          `  Attempt ${attempts} failed, retrying... (${err instanceof Error ? err.message : String(err)})`,
        );
      } else {
        console.error(
          `  Error: Translation failed after ${maxAttempts} attempts for ${locale}/${namespace}:`,
        );
        console.error(
          `    ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }
    }
  }

  // Unreachable, but TypeScript needs it.
  throw new Error("Translation failed");
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();

  // Load configuration.
  if (!existsSync(LOCALES_CONFIG_PATH)) {
    console.error(`Error: locales.json not found at ${LOCALES_CONFIG_PATH}`);
    process.exit(1);
  }
  const config = readJson<LocalesConfig>(LOCALES_CONFIG_PATH);

  const sourceDir = join(LOCALES_DIR, config.sourceLocale);
  if (!existsSync(sourceDir)) {
    console.error(`Error: Source locale directory not found: ${sourceDir}`);
    process.exit(1);
  }

  // Discover namespaces from the English source.
  const allNamespaces = discoverNamespaces(sourceDir);
  const namespacesToProcess = args.namespace
    ? [args.namespace]
    : allNamespaces;

  // Validate --namespace if specified.
  if (args.namespace && !allNamespaces.includes(args.namespace)) {
    console.error(
      `Error: Namespace "${args.namespace}" not found. Available: ${allNamespaces.join(", ")}`,
    );
    process.exit(1);
  }

  // Determine target locales.
  const targetLocales = args.locale
    ? [args.locale]
    : config.targetLocales;

  // Validate --locale if specified.
  if (args.locale && !config.targetLocales.includes(args.locale)) {
    console.error(
      `Error: Locale "${args.locale}" is not in targetLocales. Available: ${config.targetLocales.join(", ")}`,
    );
    process.exit(1);
  }

  // Load all English source files.
  const englishData: Record<string, TranslationMap> = {};
  for (const ns of namespacesToProcess) {
    const filePath = join(sourceDir, `${ns}.json`);
    if (!existsSync(filePath)) {
      console.error(`Error: English source file not found: ${filePath}`);
      process.exit(1);
    }
    englishData[ns] = readJson<TranslationMap>(filePath);
  }

  if (args.dryRun) {
    console.log("DRY RUN — no files will be modified.\n");
  }

  const localeReports: LocaleReport[] = [];

  // Process each target locale.
  for (const locale of targetLocales) {
    const localeDir = join(LOCALES_DIR, locale);
    const manifest = loadManifest(localeDir);

    const report: LocaleReport = {
      locale,
      namespaces: [],
      totalNew: 0,
      totalStale: 0,
      totalUpToDate: 0,
      totalDeleted: 0,
    };

    // Keys to translate, grouped by namespace.
    const translationBatches: Array<{
      namespace: string;
      keys: TranslationMap;
    }> = [];

    // Phase 1: Classify all keys and handle deletions.
    for (const ns of namespacesToProcess) {
      const englishMap = englishData[ns];
      const nsManifest = manifest[ns] ?? {};
      const classified = classifyKeys(englishMap, nsManifest);

      const newKeys = classified.filter((k) => k.classification === "new");
      const staleKeys = classified.filter(
        (k) => k.classification === "stale",
      );
      const upToDateKeys = classified.filter(
        (k) => k.classification === "up-to-date",
      );
      const deletedKeys = classified.filter(
        (k) => k.classification === "deleted",
      );

      const nsReport: NamespaceReport = {
        namespace: ns,
        keys: classified,
        newCount: newKeys.length,
        staleCount: staleKeys.length,
        upToDateCount: upToDateKeys.length,
        deletedCount: deletedKeys.length,
      };
      report.namespaces.push(nsReport);
      report.totalNew += nsReport.newCount;
      report.totalStale += nsReport.staleCount;
      report.totalUpToDate += nsReport.upToDateCount;
      report.totalDeleted += nsReport.deletedCount;

      // Remove deleted keys from the locale's namespace file and manifest.
      if (deletedKeys.length > 0 && !args.dryRun) {
        // Remove from locale JSON.
        const localeFilePath = join(localeDir, `${ns}.json`);
        if (existsSync(localeFilePath)) {
          const localeData = readJson<TranslationMap>(localeFilePath);
          for (const dk of deletedKeys) {
            delete localeData[dk.key];
          }
          writeJsonSorted(localeFilePath, localeData);
        }
        // Remove from manifest.
        if (manifest[ns]) {
          for (const dk of deletedKeys) {
            delete manifest[ns][dk.key];
          }
          // Clean up empty namespace entry.
          if (Object.keys(manifest[ns]).length === 0) {
            delete manifest[ns];
          }
        }
      }

      // Collect keys that need translation.
      const keysForTranslation = [...newKeys, ...staleKeys];
      if (keysForTranslation.length > 0) {
        const batch: TranslationMap = {};
        for (const k of keysForTranslation) {
          if (k.englishValue !== undefined) {
            batch[k.key] = k.englishValue;
          }
        }
        translationBatches.push({ namespace: ns, keys: batch });
      }
    }

    // Print report for this locale.
    const hasWork =
      report.totalNew > 0 ||
      report.totalStale > 0 ||
      report.totalDeleted > 0;

    if (hasWork || args.dryRun) {
      console.log(
        `${locale}: ${report.totalNew} new, ${report.totalStale} stale, ${report.totalDeleted} deleted, ${report.totalUpToDate} up-to-date`,
      );

      if (args.dryRun && hasWork) {
        for (const nsReport of report.namespaces) {
          const changes = nsReport.keys.filter(
            (k) => k.classification !== "up-to-date",
          );
          if (changes.length > 0) {
            console.log(`  ${nsReport.namespace}:`);
            for (const k of changes) {
              const label =
                k.classification === "new"
                  ? "+"
                  : k.classification === "stale"
                    ? "~"
                    : "-";
              console.log(`    ${label} ${k.key}`);
            }
          }
        }
      }
    } else {
      console.log(
        `${locale}: ${report.totalUpToDate} up-to-date (nothing to do)`,
      );
    }

    localeReports.push(report);

    // Phase 2: Translate (unless dry run or nothing to translate).
    if (args.dryRun || translationBatches.length === 0) {
      continue;
    }

    // Ensure locale directory exists.
    if (!existsSync(localeDir)) {
      mkdirSync(localeDir, { recursive: true });
    }

    for (const batch of translationBatches) {
      // Chunk large namespaces to avoid LLM output truncation.
      const CHUNK_SIZE = 150;
      const allKeys = Object.entries(batch.keys);
      const chunks: TranslationMap[] = [];
      for (let i = 0; i < allKeys.length; i += CHUNK_SIZE) {
        chunks.push(Object.fromEntries(allKeys.slice(i, i + CHUNK_SIZE)));
      }

      let translated: TranslationMap = {};
      for (const chunk of chunks) {
        const chunkResult = await translateBatch(
          locale,
          batch.namespace,
          chunk,
        );
        translated = { ...translated, ...chunkResult };
      }

      // Merge translated values into the locale's namespace file.
      const localeFilePath = join(localeDir, `${batch.namespace}.json`);
      let existingData: TranslationMap = {};
      if (existsSync(localeFilePath)) {
        existingData = readJson<TranslationMap>(localeFilePath);
      }

      // The LLM may return extra plural keys (e.g., _zero, _few, _many)
      // that weren't in the English source. Include them all.
      for (const [key, value] of Object.entries(translated)) {
        existingData[key] = value;
      }
      writeJsonSorted(localeFilePath, existingData);

      // Update the manifest with hashes for translated keys.
      if (!manifest[batch.namespace]) {
        manifest[batch.namespace] = {};
      }
      for (const key of Object.keys(batch.keys)) {
        manifest[batch.namespace][key] = {
          hash: hashValue(batch.keys[key]),
        };
      }

      // Also add manifest entries for any extra plural keys the LLM generated,
      // mapping them to the hash of their base English key if available,
      // or a hash of the generated value itself.
      for (const key of Object.keys(translated)) {
        if (!(key in batch.keys) && !(key in (manifest[batch.namespace] ?? {}))) {
          // This is an extra plural form generated by the LLM.
          // Find the base key (e.g., "item_zero" -> look for "item_one" or "item_other").
          const baseParts = key.split("_");
          const suffix = baseParts.pop();
          const basePrefix = baseParts.join("_");
          const pluralSuffixes = ["one", "other", "zero", "few", "many", "two"];
          let baseHash: string | undefined;
          if (suffix && pluralSuffixes.includes(suffix)) {
            for (const ps of pluralSuffixes) {
              const candidate = `${basePrefix}_${ps}`;
              if (candidate in batch.keys) {
                baseHash = hashValue(batch.keys[candidate]);
                break;
              }
            }
          }
          manifest[batch.namespace][key] = {
            hash: baseHash ?? hashValue(translated[key]),
          };
        }
      }
    }

    // Write updated manifest.
    const manifestPath = join(localeDir, "_manifest.json");
    writeManifest(manifestPath, manifest);
  }

  // Final summary.
  console.log("\n--- Summary ---");
  let grandNew = 0;
  let grandStale = 0;
  let grandDeleted = 0;
  let grandUpToDate = 0;
  for (const r of localeReports) {
    grandNew += r.totalNew;
    grandStale += r.totalStale;
    grandDeleted += r.totalDeleted;
    grandUpToDate += r.totalUpToDate;
  }
  console.log(
    `${localeReports.length} locale(s): ${grandNew} new, ${grandStale} stale, ${grandDeleted} deleted, ${grandUpToDate} up-to-date`,
  );
  if (args.dryRun) {
    console.log("(dry run — no files were modified)");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
