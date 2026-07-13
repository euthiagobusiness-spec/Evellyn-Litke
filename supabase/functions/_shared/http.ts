const MAX_PAYLOAD_BYTES = 12_000;
const LOCAL_ORIGINS = [
  "http://127.0.0.1:8000",
  "http://localhost:8000",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];

function configuredOrigins(): Set<string> {
  const configured = [
    Deno.env.get("SITE_URL"),
    ...(Deno.env.get("ALLOWED_ORIGINS") ?? "").split(","),
    "https://evellyn-litke.vercel.app",
    ...LOCAL_ORIGINS,
  ]
    .map((value) => value?.trim().replace(/\/$/, ""))
    .filter((value): value is string => Boolean(value));

  return new Set(configured);
}

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  return Boolean(origin && configuredOrigins().has(origin));
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  const allowedOrigin = origin && configuredOrigins().has(origin) ? origin : "";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

export function jsonResponse(
  request: Request,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request),
  });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PAYLOAD_BYTES) {
    throw new HttpError(413, "payload_too_large");
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "unsupported_media_type");
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_PAYLOAD_BYTES) {
    throw new HttpError(413, "payload_too_large");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    request.headers.get("cf-connecting-ip") ??
    forwarded ??
    request.headers.get("x-real-ip") ??
    "unknown"
  ).slice(0, 80);
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly field?: string,
  ) {
    super(code);
  }
}
