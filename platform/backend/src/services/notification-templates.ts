/**
 * Notification templates — generates plain text and HTML bodies for each notification type.
 */

export type NotificationType =
  | "event_created"
  | "voting_open"
  | "deadline_approaching"
  | "results_available"
  | "survey_created"
  | "survey_deadline";

interface TemplateData {
  assemblyName: string;
  title: string;
  votingStart?: string;
  votingEnd?: string;
  closesAt?: string;
  baseUrl: string;
}

interface RenderedTemplate {
  subject: string;
  body: string;
  bodyHtml: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function wrapHtml(heading: string, bodyLines: string[], ctaText: string, ctaUrl: string): string {
  const bodyHtml = bodyLines.map((line) => (line ? `<p style="margin:0 0 12px">${line}</p>` : "")).join("\n");
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="font-size:18px;margin:0 0 16px">${heading}</h2>
  ${bodyHtml}
  <a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;margin-top:8px">${ctaText}</a>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px">
  <p style="font-size:12px;color:#888;margin:0">Votiverse — Governance that listens</p>
</body>
</html>`;
}

export function renderTemplate(type: NotificationType, data: TemplateData): RenderedTemplate {
  switch (type) {
    case "event_created":
      return {
        subject: `New vote in ${data.assemblyName}: ${data.title}`,
        body: [
          `A new vote has been created in ${data.assemblyName}.`,
          "",
          data.title,
          "",
          `Voting opens: ${data.votingStart ? formatDate(data.votingStart) : "TBD"}`,
          `Voting closes: ${data.votingEnd ? formatDate(data.votingEnd) : "TBD"}`,
          "",
          `Go to Votiverse to review and vote: ${data.baseUrl}`,
        ].join("\n"),
        bodyHtml: wrapHtml(
          `New vote in ${data.assemblyName}`,
          [
            `A new vote has been created: <strong>${data.title}</strong>`,
            `Voting opens: ${data.votingStart ? formatDate(data.votingStart) : "TBD"}`,
            `Voting closes: ${data.votingEnd ? formatDate(data.votingEnd) : "TBD"}`,
          ],
          "Review and Vote",
          data.baseUrl,
        ),
      };

    case "voting_open":
      return {
        subject: `Voting is open: ${data.title}`,
        body: [
          `Voting is now open for ${data.title} in ${data.assemblyName}.`,
          "",
          `Deadline: ${data.votingEnd ? formatDate(data.votingEnd) : "TBD"}`,
          "",
          `Cast your vote: ${data.baseUrl}`,
        ].join("\n"),
        bodyHtml: wrapHtml(
          `Voting is open: ${data.title}`,
          [
            `Voting is now open for <strong>${data.title}</strong> in ${data.assemblyName}.`,
            `Deadline: ${data.votingEnd ? formatDate(data.votingEnd) : "TBD"}`,
          ],
          "Cast Your Vote",
          data.baseUrl,
        ),
      };

    case "deadline_approaching":
      return {
        subject: `Voting closes tomorrow: ${data.title}`,
        body: [
          `Voting for ${data.title} in ${data.assemblyName} closes in less than 24 hours.`,
          "",
          `Deadline: ${data.votingEnd ? formatDate(data.votingEnd) : "TBD"}`,
          "",
          `Vote now: ${data.baseUrl}`,
        ].join("\n"),
        bodyHtml: wrapHtml(
          `Voting closes tomorrow`,
          [
            `Voting for <strong>${data.title}</strong> in ${data.assemblyName} closes in less than 24 hours.`,
            `Deadline: ${data.votingEnd ? formatDate(data.votingEnd) : "TBD"}`,
          ],
          "Vote Now",
          data.baseUrl,
        ),
      };

    case "results_available":
      return {
        subject: `Results are in: ${data.title}`,
        body: [
          `Voting has closed for ${data.title} in ${data.assemblyName}.`,
          "",
          `View the results: ${data.baseUrl}`,
        ].join("\n"),
        bodyHtml: wrapHtml(
          `Results are in`,
          [
            `Voting has closed for <strong>${data.title}</strong> in ${data.assemblyName}.`,
          ],
          "View Results",
          data.baseUrl,
        ),
      };

    case "survey_created":
      return {
        subject: `New survey in ${data.assemblyName}: ${data.title}`,
        body: [
          `A new survey has been created in ${data.assemblyName}.`,
          "",
          data.title,
          "",
          "Your observations matter \u2014 surveys help the community understand",
          "what's happening on the ground.",
          "",
          `Respond now: ${data.baseUrl}`,
        ].join("\n"),
        bodyHtml: wrapHtml(
          `New survey in ${data.assemblyName}`,
          [
            `A new survey has been created: <strong>${data.title}</strong>`,
            "Your observations matter \u2014 surveys help the community understand what\u2019s happening on the ground.",
          ],
          "Respond Now",
          data.baseUrl,
        ),
      };

    case "survey_deadline":
      return {
        subject: `Survey closes tomorrow: ${data.title}`,
        body: [
          `The survey ${data.title} in ${data.assemblyName} closes in less than 24 hours.`,
          "",
          "If you haven't responded yet, your observations are still needed.",
          "",
          `Respond now: ${data.baseUrl}`,
        ].join("\n"),
        bodyHtml: wrapHtml(
          `Survey closes tomorrow`,
          [
            `The survey <strong>${data.title}</strong> in ${data.assemblyName} closes in less than 24 hours.`,
            "If you haven\u2019t responded yet, your observations are still needed.",
          ],
          "Respond Now",
          data.baseUrl,
        ),
      };
  }
}
