/**
 * OnboardingDialog — multi-step modal that teaches new members about
 * their group's governance model on first visit after joining.
 *
 * Steps are conditional based on the group's GovernanceConfig.
 * State is tracked in localStorage per assembly.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { GovernanceConfig } from "../api/types.js";
import { presetLabel } from "../lib/presets.js";
import { Button } from "./ui.js";

// ── localStorage helpers ─────────────────────────────────────────────

const STORAGE_KEY_PREFIX = "votiverse:onboarding-complete:";

export function shouldShowOnboarding(assemblyId: string): boolean {
  return localStorage.getItem(`${STORAGE_KEY_PREFIX}${assemblyId}`) !== "1";
}

export function markOnboardingComplete(assemblyId: string): void {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${assemblyId}`, "1");
}

export function resetOnboarding(assemblyId: string): void {
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}${assemblyId}`);
}

// ── Step definitions ─────────────────────────────────────────────────

interface Step {
  icon: string;
  title: string;
  lines: string[];
}

function buildSteps(config: GovernanceConfig, assemblyName: string, t: (key: string, opts?: Record<string, unknown>) => string): Step[] {
  const steps: Step[] = [];

  // 1. Welcome (always)
  steps.push({
    icon: "👋",
    title: t("step.welcome.title", { name: assemblyName }),
    lines: [
      t("step.welcome.governanceModel", { preset: presetLabel(config.name) }),
      t("step.welcome.overview"),
    ],
  });

  // 2. Voting timeline (always)
  const tl = config.timeline;
  const timelineLines = [
    t("step.voting.timeline"),
    t("step.voting.deliberation", { count: tl.deliberationDays }),
  ];
  if (tl.curationDays > 0) {
    timelineLines.push(t("step.voting.curation", { count: tl.curationDays }));
  }
  timelineLines.push(t("step.voting.votingDays", { count: tl.votingDays }));
  if (config.ballot.secret) {
    timelineLines.push(t("step.voting.secretBallot"));
  }
  if (config.ballot.allowVoteChange) {
    timelineLines.push(t("step.voting.allowVoteChange"));
  }
  steps.push({
    icon: "🗳️",
    title: t("step.voting.title"),
    lines: timelineLines,
  });

  // 3. Delegation (conditional)
  const delegationEnabled = config.delegation.candidacy || config.delegation.transferable;
  if (delegationEnabled) {
    const delegationLines = [
      t("step.delegation.intro"),
      config.delegation.candidacy
        ? t("step.delegation.candidacy")
        : t("step.delegation.open"),
    ];
    delegationLines.push(t("step.delegation.topicScoped"));
    delegationLines.push(t("step.delegation.override"));
    steps.push({
      icon: "🤝",
      title: t("step.delegation.title"),
      lines: delegationLines,
    });
  }

  // 4. Community features (conditional)
  const featureLines: string[] = [];
  if (config.features.communityNotes) {
    featureLines.push(t("step.features.communityNotes"));
  }
  if (config.features.surveys) {
    featureLines.push(t("step.features.surveys"));
  }
  if (config.features.predictions) {
    featureLines.push(t("step.features.predictions"));
  }
  if (featureLines.length > 0) {
    featureLines.unshift(t("step.features.intro"));
    steps.push({
      icon: "💬",
      title: t("step.features.title"),
      lines: featureLines,
    });
  }

  // 5. Getting started (always)
  const startLines = [t("step.start.ready")];
  startLines.push(t("step.start.browseDashboard"));
  if (delegationEnabled) {
    startLines.push(t("step.start.setupDelegations"));
  }
  startLines.push(t("step.start.exploreMembers"));
  steps.push({
    icon: "🚀",
    title: t("step.start.title"),
    lines: startLines,
  });

  return steps;
}

// ── Component ────────────────────────────────────────────────────────

interface OnboardingDialogProps {
  assemblyId: string;
  assemblyName: string;
  config: GovernanceConfig;
  onDismiss: () => void;
}

export function OnboardingDialog({ assemblyId, assemblyName, config, onDismiss }: OnboardingDialogProps) {
  const { t } = useTranslation("onboarding");
  const steps = buildSteps(config, assemblyName, t);
  const [currentStep, setCurrentStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const step = steps[currentStep];

  const handleNext = useCallback(() => {
    if (isLast) {
      markOnboardingComplete(assemblyId);
      onDismiss();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }, [isLast, assemblyId, onDismiss]);

  const handleBack = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const handleSkip = useCallback(() => {
    markOnboardingComplete(assemblyId);
    onDismiss();
  }, [assemblyId, onDismiss]);

  // Focus trap: auto-focus the dialog on mount
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Keyboard: Escape to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleSkip();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSkip]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("dialog.ariaLabel")}
        tabIndex={-1}
        className="bg-surface-raised rounded-xl shadow-xl max-w-md w-full outline-none"
      >
        {/* Header with skip */}
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <span className="text-xs text-text-tertiary">
            {t("dialog.stepOf", { current: currentStep + 1, total: steps.length })}
          </span>
          {!isLast && (
            <button
              onClick={handleSkip}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {t("dialog.skip")}
            </button>
          )}
        </div>

        {/* Step content */}
        <div className="px-6 py-4 min-h-[220px]">
          <div className="text-3xl mb-3">{step.icon}</div>
          <h2 className="text-lg font-bold font-display text-text-primary mb-3">{step.title}</h2>
          <div className="space-y-2">
            {step.lines.map((line, i) => (
              <p key={i} className="text-sm text-text-secondary leading-relaxed">{line}</p>
            ))}
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 py-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentStep ? "bg-accent" : i < currentStep ? "bg-accent-muted" : "bg-border-default"
              }`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 pb-5 pt-2">
          <div>
            {!isFirst && (
              <button
                onClick={handleBack}
                className="text-sm text-text-muted hover:text-text-secondary transition-colors"
              >
                {t("common:back")}
              </button>
            )}
          </div>
          <Button onClick={handleNext}>
            {isLast ? t("dialog.gotIt") : t("common:next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
