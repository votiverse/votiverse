/**
 * Error handling middleware — catches errors and returns consistent JSON responses.
 */

import type { Context, Next } from "hono";
import { logger } from "../../lib/logger.js";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super("NOT_FOUND", message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Invalid credentials") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super("FORBIDDEN", message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

export class GoneError extends AppError {
  constructor(message: string) {
    super("EXPIRED", message, 410);
  }
}

export class BadGatewayError extends AppError {
  constructor(message: string) {
    super("VCP_ERROR", message, 502);
  }
}

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error: unknown) {
    if (error instanceof AppError) {
      const body: { code: string; message: string; details?: Record<string, unknown> } = {
        code: error.code,
        message: error.message,
      };
      if (error.details) body.details = error.details;
      return c.json({ error: body }, error.statusCode as 400);
    }

    const isProduction = process.env["NODE_ENV"] === "production";

    if (error instanceof Error) {
      logger.error("Internal error", { message: error.message, stack: error.stack });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: isProduction ? "An internal error occurred" : error.message } },
        500,
      );
    }

    logger.error("Unknown error", { error: String(error) });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "An internal error occurred" } },
      500,
    );
  }
}
