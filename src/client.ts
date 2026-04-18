const BASE_URL = process.env.VERCEL_API_BASE ?? "https://api.vercel.com";

export class VercelApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

function withTeam(
  query?: Record<string, string | number | boolean | undefined>,
) {
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!teamId) return query;
  return { ...(query ?? {}), teamId };
}

export async function vercelFetch<T = unknown>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    throw new Error(
      "VERCEL_TOKEN must be set in env. Generate at https://vercel.com/account/tokens",
    );
  }

  const url = new URL(BASE_URL + path);
  const query = withTeam(opts.query);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, { method: opts.method ?? "GET", headers, body });
  const text = await res.text();
  let data: unknown = text;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // keep as string
    }
  }
  if (!res.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "object" &&
      (data as { error: { message?: string } }).error?.message
        ? (data as { error: { message: string } }).error.message
        : `HTTP ${res.status}`;
    throw new VercelApiError(res.status, data, message);
  }
  return data as T;
}
