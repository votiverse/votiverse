/**
 * OnboardingDialog — multi-step modal that teaches new members about
 * their group's governance model on first visit after joining.
 *
 * Steps are conditional based on the group's GovernanceConfig.
 * State is tracked in localStorage per assembly.
 */

import { useState, useCallback, useEffect, useRef } from "react";
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

function buildSteps(config: GovernanceConfig, assemblyName: string): Step[] {
  const steps: Step[] = [];

  // 1. Welcome (always)
  steps.push({
    icon: "👋",
    title: `Welcome to ${assemblyName}`,
    lines: [
      `This group uses ${presetLabel(config.name)} governance.`,
      "Here's a quick overview of how decisions are made.",
    ],
  });

  // 2. Voting timeline (always)
  const tl = config.timeline;
  const timelineLines = [
    "Every vote follows a structured timeline:",
    `Deliberation: ${tl.deliberationDays} day${tl.deliberationDays !== 1 ? "s" : ""} to discuss and propose amendments.`,
  ];
  if (tl.curationDays > 0) {
    timelineLines.push(`Curation: ${tl.curationDays} day${tl.curationDays !== 1 ? "s" : ""} for the panel to review and finalize proposals.`);
  }
  timelineLines.push(`Voting: ${tl.votingDays} day${tl.votingDays !== 1 ? "s" : ""} to cast your vote.`);
  if (config.ballot.secret) {
    timelineLines.push("Ballots are secret — results are revealed only after voting closes.");
  }
  if (config.ballot.allowVoteChange) {
    timelineLines.push("You can change your vote at any time before voting closes.");
  }
  steps.push({
    icon: "🗳️",
    title: "How Voting Works",
    lines: timelineLines,
  });

  // 3. Delegation (conditional)
  const delegationEnabled = config.delegation.candidacy || config.delegation.transferable;
  if (delegationEnabled) {
    const delegationLines = [
      "You don't have to vote on everything.",
      config.delegation.candidacy
        ? "You can delegate your vote to declared candidates who have published their positions."
        : "You can delegate your vote to any member you trust.",
    ];
    delegationLines.push("Delegations can be scoped by topic — different delegates for different subjects.");
    delegationLines.push(
      "You always keep the final say: voting directly on any question automatically overrides your delegation for that question.",
    );
    steps.push({
      icon: "🤝",
      title: "Delegation",
      lines: delegationLines,
    });
  }

  // 4. Community features (conditional)
  const featureLines: string[] = [];
  if (config.features.communityNotes) {
    featureLines.push("Community notes let members add context and fact-checks to proposals and candidate profiles. Notes become visible after enough members evaluate them.");
  }
  if (config.features.surveys) {
    featureLines.push("Surveys capture member observations — what's working, what isn't. This evidence feeds into accountability and helps inform future decisions.");
  }
  if (config.features.predictions) {
    featureLines.push("Predictions let members forecast outcomes before votes close, building a track record of judgment over time.");
  }
  if (featureLines.length > 0) {
    featureLines.unshift("Your voice matters beyond just voting:");
    steps.push({
      icon: "💬",
      title: "Beyond Voting",
      lines: featureLines,
    });
  }

  // 5. Getting started (always)
  const startLines = ["You're all set. Here's what you can do now:"];
  startLines.push("Browse active votes and upcoming proposals on the dashboard.");
  if (delegationEnabled) {
    startLines.push("Set up your delegations — choose people you trust to vote on your behalf.");
  }
  startLines.push("Explore the member list to see who's in this group.");
  steps.push({
    icon: "🚀",
    title: "Getting Started",
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
  const steps = buildSteps(config, assemblyName);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Group onboarding"
        tabIndex={-1}
        className="bg-white rounded-xl shadow-xl max-w-md w-full outline-none"
      >
        {/* Header with skip */}
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <span className="text-xs text-gray-400">
            {currentStep + 1} of {steps.length}
          </span>
          {!isLast && (
            <button
              onClick={handleSkip}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip
            </button>
          )}
        </div>

        {/* Step content */}
        <div className="px-6 py-4 min-h-[220px]">
          <div className="text-3xl mb-3">{step.icon}</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">{step.title}</h2>
          <div className="space-y-2">
            {step.lines.map((line, i) => (
              <p key={i} className="text-sm text-gray-600 leading-relaxed">{line}</p>
            ))}
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 py-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentStep ? "bg-brand" : i < currentStep ? "bg-brand/40" : "bg-gray-200"
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
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Back
              </button>
            )}
          </div>
          <Button onClick={handleNext}>
            {isLast ? "Got it!" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
