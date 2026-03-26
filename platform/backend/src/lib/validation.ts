/**
 * Zod validation schemas for backend request bodies.
 *
 * Centralised here so routes stay thin and schemas are reusable
 * across tests and documentation.
 */

import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Handle: 3-30 lowercase alphanumeric + underscore/hyphen. */
const handle = z.string()
  .min(3, "Handle must be at least 3 characters")
  .max(30, "Handle must be at most 30 characters")
  .regex(/^[a-z0-9_-]+$/, "Handle may only contain lowercase letters, numbers, underscores, and hyphens");

/** Email: basic RFC check via Zod built-in. */
const email = z.email("Invalid email address");

/** Password: minimum 12 characters. */
const password = z.string()
  .min(12, "Password must be at least 12 characters");

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const RegisterBody = z.object({
  email,
  password,
  name: z.string().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
  handle: handle.optional(),
});

export const LoginBody = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});

export const RefreshBody = z.object({
  refreshToken: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** BCP 47 locale tag: 2-3 letter language, optional region. */
const locale = z.string()
  .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, "Invalid locale format");

export const UpdateProfileBody = z.object({
  handle: handle.optional(),
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  locale: locale.optional(),
});

// ---------------------------------------------------------------------------
// Membership profile
// ---------------------------------------------------------------------------

export const UpdateMemberProfileBody = z.object({
  title: z.string().max(100).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

export const NotificationPrefBody = z.object({
  key: z.string().min(1, "key is required"),
  value: z.string().min(1, "value is required"),
});

// ---------------------------------------------------------------------------
// Device tokens
// ---------------------------------------------------------------------------

export const DeviceTokenBody = z.object({
  platform: z.enum(["ios", "android"]),
  token: z.string().min(1, "token is required"),
});

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export const AdmissionModeBody = z.object({
  admissionMode: z.enum(["open", "approval", "invite-only"]),
});

/** Validates a website URL: must be http(s), max 2048 chars. Rejects javascript:, data:, etc. */
export const safeWebsiteUrl = z.string().max(2048).refine(
  (val) => {
    if (!val) return true;
    try {
      const url = new URL(val);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "Must be a valid http or https URL" },
);

export const AssemblySettingsBody = z.object({
  admissionMode: z.enum(["open", "approval", "invite-only"]).optional(),
  websiteUrl: safeWebsiteUrl.optional().or(z.literal("")),
  voteCreation: z.enum(["admin", "members"]).optional(),
});

export const CreateLinkInviteBody = z.object({
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.string().optional(),
});

export const CreateDirectInviteBody = z.object({
  inviteeHandle: z.string().min(1, "inviteeHandle is required"),
});

export const BulkInviteBody = z.object({
  handles: z.array(z.string().min(1)).min(1, "At least one handle is required"),
});

// ---------------------------------------------------------------------------
// Helper: parse body with Zod, throw ValidationError on failure
// ---------------------------------------------------------------------------

import { ValidationError } from "../api/middleware/error-handler.js";

/**
 * Parse and validate a request body against a Zod schema.
 * Throws a ValidationError with a structured message on failure.
 */
export function parseBody<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const firstIssue = result.error.issues[0] ?? { path: [], message: "Invalid request body" };
  const field = firstIssue.path.length > 0 ? firstIssue.path.join(".") : undefined;
  const message = field
    ? `${field}: ${firstIssue.message}`
    : firstIssue.message;
  throw new ValidationError(message);
}
