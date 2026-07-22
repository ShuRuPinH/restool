export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type AuthType = "none" | "bearer" | "basic";

export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

export interface AuthConfig {
  authType: AuthType;
  bearerToken: string;
  username: string;
  password: string;
}

export interface HttpRequest {
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  query: KeyValue[];
  body: string;
  auth: AuthConfig;
  followRedirects: boolean;
  timeoutMs: number;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: KeyValue[];
  body: string;
  durationMs: number;
  finalUrl: string;
  truncated: boolean;
}

export interface TraceEvent {
  atMs: number;
  kind: string;
  message: string;
  detail?: string | null;
}

export interface HistoryEntry {
  id: string;
  createdAt: string;
  request: HttpRequest;
  response?: HttpResponse | null;
  events: TraceEvent[];
  ok: boolean;
  error?: string | null;
}

export interface ExecuteResult {
  response?: HttpResponse | null;
  events: TraceEvent[];
  history: HistoryEntry;
  error?: string | null;
}

export function emptyKeyValue(): KeyValue {
  return { key: "", value: "", enabled: true };
}

export function createEmptyRequest(): HttpRequest {
  return {
    method: "GET",
    url: "https://httpbin.org/get",
    headers: [emptyKeyValue()],
    query: [emptyKeyValue()],
    body: "",
    auth: {
      authType: "none",
      bearerToken: "",
      username: "",
      password: "",
    },
    followRedirects: true,
    timeoutMs: 30000,
  };
}

export function normalizeRequest(request: HttpRequest): HttpRequest {
  return {
    ...request,
    headers:
      request.headers.length > 0 ? request.headers : [emptyKeyValue()],
    query: request.query.length > 0 ? request.query : [emptyKeyValue()],
  };
}
