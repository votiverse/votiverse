/**
 * MemberSearch component tests.
 *
 * Tests the typeahead search, candidate discovery, and selection
 * behavior without API dependencies.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemberSearch } from "../src/components/member-search.js";
import type { Participant, Candidacy } from "../src/api/types.js";

const participants: Participant[] = [
  { id: "p1", name: "Alice Johnson" },
  { id: "p2", name: "Bob Smith" },
  { id: "p3", name: "Carol Davis" },
  { id: "p4", name: "Priya Sharma" },
  { id: "p5", name: "Aisha Moyo" },
];

const candidates: Candidacy[] = [
  {
    id: "c1",
    participantId: "p5",
    topicScope: ["t1", "t2"],
    voteTransparencyOptIn: true,
    currentVersion: 1,
    status: "active",
    declaredAt: Date.now(),
  },
];

const topicNameMap = new Map([
  ["t1", "Education"],
  ["t2", "Digital Literacy"],
]);

describe("MemberSearch", () => {
  it("renders search input with placeholder", () => {
    render(
      <MemberSearch
        participants={participants}
        currentParticipantId="p1"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("Search by name\u2026")).toBeDefined();
  });

  it("shows candidates on focus in candidacy mode", () => {
    render(
      <MemberSearch
        participants={participants}
        currentParticipantId="p1"
        onSelect={vi.fn()}
        candidates={candidates}
        topicNameMap={topicNameMap}
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);

    expect(screen.getByText("Declared Candidates")).toBeDefined();
    expect(screen.getByText("Aisha Moyo")).toBeDefined();
    expect(screen.getByText("Candidate")).toBeDefined();
    expect(screen.getByText("Public votes")).toBeDefined();
    expect(screen.getByText("Education, Digital Literacy")).toBeDefined();
  });

  it("filters members by search query (minimum 2 chars)", () => {
    render(
      <MemberSearch
        participants={participants}
        currentParticipantId="p1"
        onSelect={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);

    // 1 char: no results
    fireEvent.change(input, { target: { value: "B" } });
    expect(screen.queryByText("Bob Smith")).toBeNull();

    // 2+ chars: results appear
    fireEvent.change(input, { target: { value: "Bo" } });
    expect(screen.getByText("Bob Smith")).toBeDefined();
  });

  it("excludes current participant from results", () => {
    render(
      <MemberSearch
        participants={participants}
        currentParticipantId="p1"
        onSelect={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Alice" } });

    // Alice (p1) is the current user — excluded
    expect(screen.queryByText("Alice Johnson")).toBeNull();
  });

  it("calls onSelect when a member is clicked", () => {
    const onSelect = vi.fn();
    render(
      <MemberSearch
        participants={participants}
        currentParticipantId="p1"
        onSelect={onSelect}
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Pr" } });
    fireEvent.click(screen.getByText("Priya Sharma"));

    expect(onSelect).toHaveBeenCalledWith("p4");
  });

  it("calls onSelect when a candidate is clicked", () => {
    const onSelect = vi.fn();
    render(
      <MemberSearch
        participants={participants}
        currentParticipantId="p1"
        onSelect={onSelect}
        candidates={candidates}
        topicNameMap={topicNameMap}
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.click(screen.getByText("Aisha Moyo"));

    expect(onSelect).toHaveBeenCalledWith("p5");
  });

  it("excludes current user from candidates", () => {
    const candidatesSelf: Candidacy[] = [
      { ...candidates[0]!, participantId: "p1" }, // current user is a candidate
    ];
    render(
      <MemberSearch
        participants={participants}
        currentParticipantId="p1"
        onSelect={vi.fn()}
        candidates={candidatesSelf}
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);

    // Should not show candidates section since the only candidate is self
    expect(screen.queryByText("DECLARED CANDIDATES")).toBeNull();
  });

  it("shows no results message for unmatched search", () => {
    render(
      <MemberSearch
        participants={participants}
        currentParticipantId="p1"
        onSelect={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzz" } });

    expect(screen.getByText(/No members found/)).toBeDefined();
  });

  it("clears search after selection", () => {
    render(
      <MemberSearch
        participants={participants}
        currentParticipantId="p1"
        onSelect={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Bob" } });
    fireEvent.click(screen.getByText("Bob Smith"));

    expect(input.value).toBe("");
  });

  it("shows Candidate badge on search results for declared candidates", () => {
    render(
      <MemberSearch
        participants={participants}
        currentParticipantId="p1"
        onSelect={vi.fn()}
        candidates={candidates}
        topicNameMap={topicNameMap}
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Ai" } });

    // Aisha appears in search results with Candidate badge
    const badges = screen.getAllByText("Candidate");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});
