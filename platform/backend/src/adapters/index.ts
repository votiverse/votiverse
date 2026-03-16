/**
 * Adapter container — all infrastructure dependencies behind interfaces.
 */

export type { DatabaseAdapter, RunResult } from "./database/interface.js";
export { SQLiteAdapter } from "./database/sqlite.js";

export interface BackendAdapters {
  database: import("./database/interface.js").DatabaseAdapter;
}
