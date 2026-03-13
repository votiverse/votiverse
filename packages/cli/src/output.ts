/**
 * @votiverse/cli — Output formatting
 *
 * Abstraction for CLI output. Supports human-readable and JSON formats.
 */

export interface Output {
  info(message: string): void;
  success(message: string): void;
  error(message: string): void;
  json(data: unknown): void;
}

/** Console-based output for human-readable format. */
export class ConsoleOutput implements Output {
  info(message: string): void {
    console.log(message);
  }
  success(message: string): void {
    console.log(`✓ ${message}`);
  }
  error(message: string): void {
    console.error(`✗ ${message}`);
  }
  json(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
  }
}

/** Collects output into arrays for testing. */
export class TestOutput implements Output {
  readonly messages: string[] = [];
  readonly errors: string[] = [];

  info(message: string): void {
    this.messages.push(message);
  }
  success(message: string): void {
    this.messages.push(message);
  }
  error(message: string): void {
    this.errors.push(message);
  }
  json(data: unknown): void {
    this.messages.push(JSON.stringify(data, null, 2));
  }
}
