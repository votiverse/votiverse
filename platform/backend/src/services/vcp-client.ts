/**
 * VCPClient — HTTP client for communicating with the VCP server.
 */

import { logger } from "../lib/logger.js";

export interface VCPAssembly {
  id: string;
  name: string;
  organizationId: string | null;
  config: unknown;
  status: string;
  createdAt: string;
}

export interface VCPParticipant {
  id: string;
  name: string;
  registeredAt: string;
  status: string;
}

export class VCPClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async request<T = unknown>(
    method: string,
    path: string,
    options?: { participantId?: string; body?: unknown },
  ): Promise<{ status: number; body: T }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (options?.participantId) {
      headers["X-Participant-Id"] = options.participantId;
    }

    const init: RequestInit = { method, headers };
    if (options?.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, init);

    if (!res.ok) {
      let errorBody: unknown;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = await res.text();
      }
      logger.warn(`VCP request failed: ${method} ${path}`, { status: res.status, error: errorBody });
      throw new VCPError(res.status, method, path, errorBody);
    }

    if (res.status === 204) {
      return { status: 204, body: undefined as T };
    }

    const body = (await res.json()) as T;
    return { status: res.status, body };
  }

  async listAssemblies(): Promise<VCPAssembly[]> {
    const { body } = await this.request<{ assemblies: VCPAssembly[] }>("GET", "/assemblies");
    return body.assemblies;
  }

  async getAssembly(id: string): Promise<VCPAssembly> {
    const { body } = await this.request<VCPAssembly>("GET", `/assemblies/${id}`);
    return body;
  }

  async createParticipant(assemblyId: string, name: string): Promise<VCPParticipant> {
    const { body } = await this.request<VCPParticipant>("POST", `/assemblies/${assemblyId}/participants`, {
      body: { name },
    });
    return body;
  }

  async listParticipants(assemblyId: string): Promise<VCPParticipant[]> {
    const { body } = await this.request<{ participants: VCPParticipant[] }>("GET", `/assemblies/${assemblyId}/participants`);
    return body.participants;
  }
}

export class VCPError extends Error {
  constructor(
    public readonly status: number,
    public readonly method: string,
    public readonly path: string,
    public readonly responseBody: unknown,
  ) {
    super(`VCP ${method} ${path} failed with status ${status}`);
    this.name = "VCPError";
  }
}
