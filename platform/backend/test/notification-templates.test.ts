import { describe, it, expect } from "vitest";
import { escapeHtml } from "../src/lib/html.js";
import { renderTemplate } from "../src/services/notification-templates.js";

describe("escapeHtml", () => {
  it("escapes all five OWASP-recommended characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#x27;");
  });

  it("escapes a script tag", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("leaves safe strings unchanged", () => {
    expect(escapeHtml("Hello World 123")).toBe("Hello World 123");
  });
});

describe("renderTemplate XSS prevention", () => {
  const XSS_ASSEMBLY = '<img src=x onerror="alert(1)">';
  const XSS_TITLE = '"><script>fetch("evil")</script>';
  const XSS_INVITER = "<b>Evil</b>";

  const baseData = {
    assemblyName: XSS_ASSEMBLY,
    title: XSS_TITLE,
    baseUrl: "https://example.com",
    votingStart: "2026-01-01T00:00:00Z",
    votingEnd: "2026-01-07T00:00:00Z",
    closesAt: "2026-01-07T00:00:00Z",
  };

  it("escapes assemblyName and title in event_created HTML", () => {
    const result = renderTemplate("event_created", baseData);
    expect(result.bodyHtml).not.toContain("<img src=x");
    expect(result.bodyHtml).not.toContain("<script>");
    expect(result.bodyHtml).toContain("&lt;img src=x");
    expect(result.bodyHtml).toContain("&lt;script&gt;");
    // Plain text body is NOT escaped (safe context)
    expect(result.body).toContain(XSS_ASSEMBLY);
    expect(result.body).toContain(XSS_TITLE);
  });

  it("escapes title in voting_open HTML", () => {
    const result = renderTemplate("voting_open", baseData);
    expect(result.bodyHtml).not.toContain("<script>");
    expect(result.bodyHtml).toContain("&lt;script&gt;");
  });

  it("escapes title and assemblyName in deadline_approaching HTML", () => {
    const result = renderTemplate("deadline_approaching", baseData);
    expect(result.bodyHtml).not.toContain("<script>");
    expect(result.bodyHtml).not.toContain("<img src=x");
  });

  it("escapes title and assemblyName in results_available HTML", () => {
    const result = renderTemplate("results_available", baseData);
    expect(result.bodyHtml).not.toContain("<script>");
    expect(result.bodyHtml).not.toContain("<img src=x");
  });

  it("escapes assemblyName and title in survey_created HTML", () => {
    const result = renderTemplate("survey_created", baseData);
    expect(result.bodyHtml).not.toContain("<img src=x");
    expect(result.bodyHtml).not.toContain("<script>");
  });

  it("escapes title and assemblyName in survey_deadline HTML", () => {
    const result = renderTemplate("survey_deadline", baseData);
    expect(result.bodyHtml).not.toContain("<script>");
    expect(result.bodyHtml).not.toContain("<img src=x");
  });

  it("escapes inviterName and assemblyName in invitation_received HTML", () => {
    const result = renderTemplate("invitation_received", {
      ...baseData,
      inviterName: XSS_INVITER,
    });
    expect(result.bodyHtml).not.toContain("<b>Evil</b>");
    expect(result.bodyHtml).toContain("&lt;b&gt;Evil&lt;/b&gt;");
    expect(result.bodyHtml).not.toContain("<img src=x");
    // Plain text still has raw inviterName
    expect(result.body).toContain(XSS_INVITER);
  });

  it("escapes assemblyName in invitation_received without inviterName", () => {
    const result = renderTemplate("invitation_received", baseData);
    expect(result.bodyHtml).not.toContain("<img src=x");
    expect(result.bodyHtml).toContain("&lt;img src=x");
  });
});
