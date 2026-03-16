/**
 * Error handling middleware — catches errors and returns consistent JSON responses.
 */

import type { Context, Next } from "hono";
import { VotiverseError, NotFoundError, ValidationError, GovernanceRuleViolation } from "@votiverse/core";
import { AssemblyNotFoundError } from "../../engine/assembly-manager.js";
import { logger } from "../../lib/logger.js";

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error: unknown) {
    if (error instanceof AssemblyNotFoundError) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: error.message } },
        404,
      );
    }

    if (error instanceof NotFoundError) {
      return c.json(
        { error: { code: "NOT_FOUND", message: error.message } },
        404,
      );
    }

    if (error instanceof ValidationError) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: error.message, details: { field: error.field } } },
        400,
      );
    }

    if (error instanceof GovernanceRuleViolation) {
      return c.json(
        { error: { code: "GOVERNANCE_RULE_VIOLATION", message: error.message, details: { rule: error.rule } } },
        409,
      );
    }

    if (error instanceof VotiverseError) {
      return c.json(
        { error: { code: "ENGINE_ERROR", message: error.message } },
        400,
      );
    }

    if (error instanceof Error) {
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
