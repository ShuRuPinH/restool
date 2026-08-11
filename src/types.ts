export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type AuthType = "none" | "bearer" | "basic";

export type BodyType = "raw" | "multipart";

export type MultipartFieldKind = "text" | "file";

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

export interface MultipartField {
  key: string;
  kind: MultipartFieldKind;
  value: string;
  filePath: string;
  fileName: string;
  contentType: string;
  enabled: boolean;
}

export interface PickedFile {
  path: string;
  fileName: string;
  contentType: string;
}

export interface HttpRequest {
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  query: KeyValue[];
  body: string;
  bodyType: BodyType;
  multipart: MultipartField[];
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
  tag?: string | null;
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

export function emptyMultipartField(
  kind: MultipartFieldKind = "text",
): MultipartField {
  return {
    key: "",
    kind,
    value: "",
    filePath: "",
    fileName: "",
    contentType: "",
    enabled: true,
  };
}

export function createEmptyRequest(): HttpRequest {
  return {
    method: "GET",
    url: "https://httpbin.org/get",
    headers: [emptyKeyValue()],
    query: [emptyKeyValue()],
    body: "",
    bodyType: "raw",
    multipart: [emptyMultipartField()],
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
    bodyType: request.bodyType === "multipart" ? "multipart" : "raw",
    multipart:
      request.multipart && request.multipart.length > 0
        ? request.multipart
        : [emptyMultipartField()],
    headers:
      request.headers.length > 0 ? request.headers : [emptyKeyValue()],
    query: request.query.length > 0 ? request.query : [emptyKeyValue()],
  };
}
