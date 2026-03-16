/**
 * Pagination helpers for list endpoints.
 */

import type { Context } from "hono";

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Parse limit/offset from query params. */
export function parsePagination(c: Context): PaginationParams {
  const rawLimit = c.req.query("limit");
  const rawOffset = c.req.query("offset");
  const limit = Math.min(
    Math.max(rawLimit ? parseInt(rawLimit, 10) || DEFAULT_LIMIT : DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
  const offset = Math.max(rawOffset ? parseInt(rawOffset, 10) || 0 : 0, 0);
  return { limit, offset };
}

/** Paginate an in-memory array. */
export function paginate<T>(items: T[], params: PaginationParams): { data: T[]; pagination: PaginationMeta } {
  return {
    data: items.slice(params.offset, params.offset + params.limit),
    pagination: {
      limit: params.limit,
      offset: params.offset,
      total: items.length,
    },
  };
}
