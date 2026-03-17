/**
 * Error handling middleware — catches errors and returns consistent JSON responses.
 *
 * Uses both instanceof and error.name checks for resilience against dual
 * module resolution (e.g., vitest loading engine source alongside VCP source
 * can produce separate class instances for the same error type).
 */

import type { Context, Next } from "hono";
import { VotiverseError, NotFoundError, ValidationError, GovernanceRuleViolation } from "@votiverse/core";
import { AssemblyNotFoundError } from "../../engine/assembly-manager.js";
import { logger } from "../../lib/logger.js";

/** Type-safe check that works across module boundaries. */
function isErrorNamed(error: unknown, name: string): error is Error & Record<string, unknown> {
  return error instanceof Error && error.name === name;
}

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error: unknown) {
    if (error instanceof AssemblyNotFoundError || isErrorNamed(error, "AssemblyNotFoundError")) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: (error as Error).message } },
        404,
      );
    }

    if (error instanceof NotFoundError || isErrorNamed(error, "NotFoundError")) {
      const e = error as Error & { entityType?: string; entityId?: string };
      return c.json(
        { error: { code: "NOT_FOUND", message: e.message } },
        404,
      );
    }

    if (error instanceof ValidationError || isErrorNamed(error, "ValidationError")) {
      const e = error as Error & { field?: string };
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: e.message, details: { field: e.field } } },
        400,
      );
    }

    if (error instanceof GovernanceRuleViolation || isErrorNamed(error, "GovernanceRuleViolation")) {
      const e = error as Error & { rule?: string };
      return c.json(
        { error: { code: "GOVERNANCE_RULE_VIOLATION", message: e.message, details: { rule: e.rule } } },
        409,
      );
    }

    if (error instanceof VotiverseError || isErrorNamed(error, "InvalidStateError")) {
      return c.json(
        { error: { code: "ENGINE_ERROR", message: (error as Error).message } },
        400,
      );
    }

    if (error instanceof Error) {
      // Fallback: catch any VotiverseError subclass by name pattern
      if (error.name === "VotiverseError" || error.name.endsWith("Error") && "rule" in error) {
        return c.json(
          { error: { code: "ENGINE_ERROR", message: error.message } },
          400,
        );
      }

      // Check for common application errors
      if (error.message.includes("not found") || error.message.includes("Not found")) {
        return c.json(
          { error: { code: "NOT_FOUND", message: error.message } },
          404,
        );
      }
      if (error.message.includes("already exists") || error.message.includes("duplicate")) {
        return c.json(
          { error: { code: "CONFLICT", message: error.message } },
          409,
        );
      }

      logger.error("Internal error", { message: error.message, stack: error.stack });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: error.message } },
        500,
      );
    }

    logger.error("Unknown error", { error: String(error) });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
      500,
    );
  }
}
