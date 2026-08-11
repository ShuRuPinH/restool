import { parseCookieParts } from "./cookies";
import {
  createEmptyRequest,
  emptyKeyValue,
  ExecuteResult,
  HttpMethod,
  HttpRequest,
  KeyValue,
} from "./types";

export type AuthProfileStatus = "idle" | "ok" | "error";

export const REFRESH_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

export interface AuthProfile {
  id: string;
  name: string;
  cookies: string;
  loginUrl: string;
  /** Raw JSON body for login POST, e.g. {"username":"...","password":"..."} */
  loginBody: string;
  refreshUrl: string;
  refreshMethod: HttpMethod;
  status: AuthProfileStatus;
  lastError?: string | null;
  lastAuthAt?: string | null;
  createdAt: string;
}

export const AUTH_PROFILES_STORAGE_KEY = "restool.authProfiles";

const TOKEN_BODY_KEYS = [
  "access_token",
  "refresh_token",
  "accessToken",
  "refreshToken",
  "token",
] as const;

export function createEmptyAuthProfile(): AuthProfile {
  return {
    id: crypto.randomUUID(),
    name: "",
    cookies: "",
    loginUrl: "",
    loginBody: '{\n  "username": "",\n  "password": ""\n}',
    refreshUrl: "",
    refreshMethod: "GET",
    status: "idle",
    lastError: null,
    lastAuthAt: null,
    createdAt: new Date().toISOString(),
  };
}

export function loadAuthProfiles(): AuthProfile[] {
  try {
    const raw = localStorage.getItem(AUTH_PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuthProfile[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeProfile);
  } catch {
    return [];
  }
}

export function saveAuthProfiles(profiles: AuthProfile[]) {
  localStorage.setItem(AUTH_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
}

function normalizeRefreshMethod(value: unknown): HttpMethod {
  if (typeof value === "string" && REFRESH_METHODS.includes(value as HttpMethod)) {
    return value as HttpMethod;
  }
  return "GET";
}

function normalizeProfile(
  item: Partial<AuthProfile> & { username?: string; password?: string },
): AuthProfile {
  let loginBody = item.loginBody ?? "";
  if (!loginBody.trim() && (item.username || item.password)) {
    loginBody = JSON.stringify(
      { username: item.username ?? "", password: item.password ?? "" },
      null,
      2,
    );
  }
  if (!loginBody.trim()) {
    loginBody = '{\n  "username": "",\n  "password": ""\n}';
  }
  return {
    id: item.id || crypto.randomUUID(),
    name: item.name ?? "",
    cookies: item.cookies ?? "",
    loginUrl: item.loginUrl ?? "",
    loginBody,
    refreshUrl: item.refreshUrl ?? "",
    refreshMethod: normalizeRefreshMethod(item.refreshMethod),
    status: item.status === "ok" || item.status === "error" ? item.status : "idle",
    lastError: item.lastError ?? null,
    lastAuthAt: item.lastAuthAt ?? null,
    createdAt: item.createdAt ?? new Date().toISOString(),
  };
}

/** Replace Cookie header in request headers (full swap for role testing). */
export function applyCookiesToHeaders(
  headers: KeyValue[],
  cookies: string,
): KeyValue[] {
  const value = cookies.trim();
  const next = headers.map((row) => ({ ...row }));
  const index = next.findIndex((h) => h.key.toLowerCase() === "cookie");

  if (index >= 0) {
    next[index] = {
      ...next[index],
      key: "Cookie",
      value,
      enabled: true,
    };
    return next;
  }

  const withoutTrailingEmpty = next.filter((h) => h.key.trim() || h.value.trim());
  return [
    { key: "Cookie", value, enabled: true },
    ...withoutTrailingEmpty,
    emptyKeyValue(),
  ];
}

export function parseLoginBody(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Login JSON body is empty");
  }
  // Validate and normalize so we always send compact valid JSON.
  return JSON.stringify(JSON.parse(trimmed));
}

export function buildLoginRequest(profile: AuthProfile): HttpRequest {
  const request = createEmptyRequest();
  return {
    ...request,
    method: "POST",
    url: profile.loginUrl.trim(),
    headers: [
      { key: "Content-Type", value: "application/json", enabled: true },
      emptyKeyValue(),
    ],
    body: parseLoginBody(profile.loginBody),
    auth: {
      authType: "none",
      bearerToken: "",
      username: "",
      password: "",
    },
  };
}

export function buildRefreshRequest(profile: AuthProfile): HttpRequest {
  const request = createEmptyRequest();
  const method = normalizeRefreshMethod(profile.refreshMethod);
  const withBody = method !== "GET" && method !== "HEAD";
  const headers: KeyValue[] = [];
  if (profile.cookies.trim()) {
    headers.push({
      key: "Cookie",
      value: profile.cookies.trim(),
      enabled: true,
    });
  }
  if (withBody) {
    headers.push({
      key: "Content-Type",
      value: "application/json",
      enabled: true,
    });
  }
  headers.push(emptyKeyValue());
  return {
    ...request,
    method,
    url: profile.refreshUrl.trim(),
    headers,
    body: withBody ? "{}" : "",
    auth: {
      authType: "none",
      bearerToken: "",
      username: "",
      password: "",
    },
  };
}

export function extractCookiesFromResult(result: ExecuteResult): string {
  const fromHeaders = cookiesFromSetCookie(result.response?.headers ?? []);
  if (fromHeaders) return fromHeaders;
  return cookiesFromBody(result.response?.body ?? "");
}

function cookiesFromSetCookie(headers: KeyValue[]): string {
  const pairs: string[] = [];
  for (const header of headers) {
    if (header.key.toLowerCase() !== "set-cookie") continue;
    const parts = parseCookieParts(header.key, header.value);
    const cookie = parts[0];
    if (!cookie?.name) continue;
    pairs.push(
      cookie.value === "" && !cookie.raw.includes("=")
        ? cookie.name
        : `${cookie.name}=${cookie.value}`,
    );
  }
  return pairs.join("; ");
}

function cookiesFromBody(body: string): string {
  if (!body.trim()) return "";
  try {
    const json = JSON.parse(body) as unknown;
    const pairs: string[] = [];
    collectTokenPairs(json, pairs);
    return pairs.join("; ");
  } catch {
    return "";
  }
}

function collectTokenPairs(value: unknown, out: string[], depth = 0) {
  if (depth > 3 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectTokenPairs(item, out, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of TOKEN_BODY_KEYS) {
    const token = record[key];
    if (typeof token === "string" && token.trim()) {
      out.push(`${key}=${token.trim()}`);
    }
  }
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") {
      collectTokenPairs(nested, out, depth + 1);
    }
  }
}

export function profileAfterAuth(
  profile: AuthProfile,
  result: ExecuteResult,
): AuthProfile {
  if (result.error || !result.response) {
    return {
      ...profile,
      status: "error",
      lastError: result.error ?? "No response",
    };
  }

  const status = result.response.status;
  if (status < 200 || status >= 300) {
    return {
      ...profile,
      status: "error",
      lastError: `HTTP ${status} ${result.response.statusText}`.trim(),
    };
  }

  const cookies = extractCookiesFromResult(result);
  if (!cookies) {
    return {
      ...profile,
      status: "error",
      lastError: "No cookies or tokens found in response",
    };
  }

  return {
    ...profile,
    cookies,
    status: "ok",
    lastError: null,
    lastAuthAt: new Date().toISOString(),
  };
}
