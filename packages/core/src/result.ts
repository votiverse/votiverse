/**
 * @votiverse/core — Result type
 *
 * A discriminated union for representing success or failure without
 * throwing exceptions. Packages choose whether to use Result<T, E>
 * or typed throws — this type supports the former pattern.
 */

/**
 * A successful result containing a value.
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * A failed result containing an error.
 */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Discriminated union representing either success (Ok) or failure (Err).
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Creates a successful Result.
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Creates a failed Result.
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Returns true if the result is Ok, narrowing the type.
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/**
 * Returns true if the result is Err, narrowing the type.
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Extracts the value from an Ok result, or throws if Err.
 * Use only when you are certain the result is Ok.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw new Error(
    `Attempted to unwrap an Err result: ${String(result.error)}`,
  );
}

/**
 * Extracts the error from an Err result, or throws if Ok.
 * Use only when you are certain the result is Err.
 */
export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (!result.ok) {
    return result.error;
  }
  throw new Error(`Attempted to unwrapErr an Ok result`);
}
