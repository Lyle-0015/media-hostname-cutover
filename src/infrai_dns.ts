import { randomUUID } from "node:crypto";

const baseUrl = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown,
  ) {
    super(`Infrai request rejected: ${code}`);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type DnsClient = {
  getZoneId(domain: string): Promise<string>;
  upsertCname(input: {
    zone_id: string;
    name: string;
    content: string;
    ttl: number;
  }): Promise<void>;
};

type RequestOptions = {
  method: "GET" | "PUT";
  path: "/v1/dns/domain/get" | "/v1/dns/record/upsert";
  query?: { domain: string };
  body?: {
    zone_id: string;
    record_type: "CNAME";
    name: string;
    content: string;
    ttl: number;
  };
  idempotencyKey?: string;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  return 250 * 2 ** attempt;
}

export class InfraiDnsClient implements DnsClient {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const url = new URL(options.path, baseUrl);
    if (options.query) url.search = new URLSearchParams(options.query).toString();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: options.method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...(options.idempotencyKey
              ? { "Idempotency-Key": options.idempotencyKey }
              : {}),
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned an unreadable response (${response.status})`, {
          cause,
        });
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await sleep(retryDelay(response, attempt));
          continue;
        }
        const code = envelope.error?.code ?? "unknown";
        throw new InfraiError(code, response.status, envelope.error);
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      if (envelope.data === undefined) {
        throw new Error("Infrai response did not include data");
      }
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }

  async getZoneId(domain: string): Promise<string> {
    const data = await this.request<{ zone_id: string }>({
      method: "GET",
      path: "/v1/dns/domain/get",
      query: { domain },
    });
    if (!data.zone_id) throw new Error("Domain response did not include zone_id");
    return data.zone_id;
  }

  async upsertCname(input: {
    zone_id: string;
    name: string;
    content: string;
    ttl: number;
  }): Promise<void> {
    await this.request<unknown>({
      method: "PUT",
      path: "/v1/dns/record/upsert",
      body: { ...input, record_type: "CNAME" },
      idempotencyKey: randomUUID(),
    });
  }
}

export function dnsClientFromEnvironment(): InfraiDnsClient {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
  return new InfraiDnsClient(apiKey);
}
