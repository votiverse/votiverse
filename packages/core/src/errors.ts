/**
 * @votiverse/core — Error base classes
 *
 * All domain-specific errors extend VotiverseError.
 * Each package defines its own error subclasses.
 */

/**
 * Base error class for all Votiverse domain errors.
 * Packages extend this with specific error types.
 */
export class VotiverseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VotiverseError";
    // Restore prototype chain (required for instanceof to work with ES5 targets)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an entity is not found by its ID.
 */
export class NotFoundError extends VotiverseError {
  constructor(
    public readonly entityType: string,
    public readonly entityId: string,
  ) {
    super(`${entityType} with ID "${entityId}" not found`);
    this.name = "NotFoundError";
  }
}

/**
 * Thrown when a validation constraint is violated.
 */
export class ValidationError extends VotiverseError {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(`Validation error on "${field}": ${message}`);
    this.name = "ValidationError";
  }
}

/**
 * Thrown when an operation is attempted in an invalid state.
 */
export class InvalidStateError extends VotiverseError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStateError";
  }
}

/**
 * Thrown when an operation violates a governance rule.
 */
export class GovernanceRuleViolation extends VotiverseError {
  constructor(
    public readonly rule: string,
    message: string,
  ) {
    super(`Governance rule "${rule}" violated: ${message}`);
    this.name = "GovernanceRuleViolation";
  }
}

/**
 * Thrown when an operation is not authorized for the requesting identity.
 * Defined in core for consistent error handling across the stack.
 */
export class AuthorizationError extends VotiverseError {
  constructor(
    public readonly action: string,
    public readonly reason: string,
  ) {
    super(`Authorization denied for "${action}": ${reason}`);
    this.name = "AuthorizationError";
  }
}
