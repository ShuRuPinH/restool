import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  clearHistory,
  deleteHistory,
  exportCurlCommand,
  listHistory,
  parseCurlCommand,
  sendRequest,
} from "./api";
import {
  AuthType,
  createEmptyRequest,
  emptyKeyValue,
  ExecuteResult,
  HistoryEntry,
  HttpMethod,
  HttpRequest,
  HttpResponse,
  KeyValue,
  normalizeRequest,
  TraceEvent,
} from "./types";
import "./App.css";

type EditorTab = "params" | "headers" | "body" | "auth" | "curl";
type ResultTab = "body" | "headers" | "trace";

const METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

function App() {
  const [request, setRequest] = useState<HttpRequest>(createEmptyRequest);
  const [editorTab, setEditorTab] = useState<EditorTab>("headers");
  const [resultTab, setResultTab] = useState<ResultTab>("body");
  const [curlDraft, setCurlDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [status, setStatus] = useState<string>("Ready");

  const loadHistory = useCallback(async () => {
    try {
      const items = await listHistory();
      setHistory(items);
    } catch (err) {
      setStatus(String(err));
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const prettyBody = useMemo(() => {
    if (!response?.body) return "";
    try {
      return JSON.stringify(JSON.parse(response.body), null, 2);
    } catch {
      return response.body;
    }
  }, [response]);

  function updateRequest(patch: Partial<HttpRequest>) {
    setRequest((prev) => ({ ...prev, ...patch }));
  }

  function updateList(
    field: "headers" | "query",
    index: number,
    patch: Partial<KeyValue>,
  ) {
    setRequest((prev) => {
      const next = [...prev[field]];
      next[index] = { ...next[index], ...patch };
      return { ...prev, [field]: next };
    });
  }

  function addRow(field: "headers" | "query") {
    setRequest((prev) => ({ ...prev, [field]: [...prev[field], emptyKeyValue()] }));
  }

  function removeRow(field: "headers" | "query", index: number) {
    setRequest((prev) => {
      const next = prev[field].filter((_, i) => i !== index);
      return { ...prev, [field]: next.length ? next : [emptyKeyValue()] };
    });
  }

  async function onSend(event?: FormEvent) {
    event?.preventDefault();
    setSending(true);
    setError(null);
    setStatus("Sending…");
    try {
      const result: ExecuteResult = await sendRequest(request);
      setResponse(result.response ?? null);
      setEvents(result.events);
      setError(result.error ?? null);
      setResultTab(result.error ? "trace" : "body");
      setStatus(
        result.error
          ? "Failed"
          : `HTTP ${result.response?.status} · ${result.response?.durationMs} ms`,
      );
      await loadHistory();
    } catch (err) {
      setError(String(err));
      setStatus("Error");
    } finally {
      setSending(false);
    }
  }

  async function onImportCurl() {
    try {
      const parsed = await parseCurlCommand(curlDraft);
      setRequest(normalizeRequest(parsed));
      setEditorTab("headers");
      setStatus("Imported from curl");
    } catch (err) {
      setStatus(`Curl import failed: ${err}`);
    }
  }

  async function onExportCurl() {
    try {
      const command = await exportCurlCommand(request);
      setCurlDraft(command);
      setEditorTab("curl");
      setStatus("Exported to curl");
    } catch (err) {
      setStatus(`Curl export failed: ${err}`);
    }
  }

  function restoreHistory(entry: HistoryEntry) {
    setRequest(normalizeRequest(entry.request));
    setResponse(entry.response ?? null);
    setEvents(entry.events);
    setError(entry.error ?? null);
    setResultTab(entry.error ? "trace" : "body");
    setStatus(
      entry.ok
        ? `Restored · HTTP ${entry.response?.status ?? "—"}`
        : `Restored · failed`,
    );
  }

  async function onDeleteHistory(id: string) {
    await deleteHistory(id);
    await loadHistory();
  }

  async function onClearHistory() {
    await clearHistory();
    await loadHistory();
  }

  return (
    <div className="app">
      <aside className="history-pane">
        <div className="pane-title">
          <span>History</span>
          <button type="button" className="ghost" onClick={() => void onClearHistory()}>
            Clear
          </button>
        </div>
        <div className="history-list">
          {history.length === 0 && (
            <p className="muted pad">Sent requests will appear here.</p>
          )}
          {history.map((entry) => (
            <article key={entry.id} className={`history-item ${entry.ok ? "ok" : "fail"}`}>
              <button
                type="button"
                className="history-main"
                onClick={() => restoreHistory(entry)}
                title="Restore into editor"
              >
                <div className="history-top">
                  <span className={`method m-${entry.request.method.toLowerCase()}`}>
                    {entry.request.method}
                  </span>
                  <span className="history-status">
                    {entry.ok ? entry.response?.status ?? "OK" : "ERR"}
                  </span>
                </div>
                <div className="history-url">{entry.request.url}</div>
                <div className="history-meta">
                  {new Date(entry.createdAt).toLocaleString()}
                  {entry.response ? ` · ${entry.response.durationMs} ms` : ""}
                </div>
              </button>
              <button
                type="button"
                className="ghost tiny"
                onClick={() => void onDeleteHistory(entry.id)}
              >
                ×
              </button>
            </article>
          ))}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="brand">Restool</div>
          <div className="status">{status}</div>
        </header>

        <form className="request-bar" onSubmit={(e) => void onSend(e)}>
          <select
            value={request.method}
            onChange={(e) => updateRequest({ method: e.target.value as HttpMethod })}
          >
            {METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
          <input
            className="url"
            value={request.url}
            onChange={(e) => updateRequest({ url: e.target.value })}
            placeholder="https://api.example.com/resource"
            spellCheck={false}
          />
          <button type="submit" className="primary" disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </button>
          <button type="button" onClick={() => void onExportCurl()}>
            Export curl
          </button>
        </form>

        <section className="editor">
          <div className="tabs">
            {(
              [
                ["params", "Query"],
                ["headers", "Headers"],
                ["body", "Body"],
                ["auth", "Auth"],
                ["curl", "cURL"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={editorTab === id ? "active" : ""}
                onClick={() => setEditorTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="editor-body">
            {editorTab === "params" && (
              <KeyValueEditor
                rows={request.query}
                onChange={(i, patch) => updateList("query", i, patch)}
                onAdd={() => addRow("query")}
                onRemove={(i) => removeRow("query", i)}
              />
            )}
            {editorTab === "headers" && (
              <KeyValueEditor
                rows={request.headers}
                onChange={(i, patch) => updateList("headers", i, patch)}
                onAdd={() => addRow("headers")}
                onRemove={(i) => removeRow("headers", i)}
              />
            )}
            {editorTab === "body" && (
              <textarea
                className="code"
                value={request.body}
                onChange={(e) => updateRequest({ body: e.target.value })}
                placeholder='{"example": true}'
                spellCheck={false}
              />
            )}
            {editorTab === "auth" && (
              <div className="auth-grid">
                <label>
                  Type
                  <select
                    value={request.auth.authType}
                    onChange={(e) =>
                      updateRequest({
                        auth: {
                          ...request.auth,
                          authType: e.target.value as AuthType,
                        },
                      })
                    }
                  >
                    <option value="none">None</option>
                    <option value="bearer">Bearer</option>
                    <option value="basic">Basic</option>
                  </select>
                </label>
                {request.auth.authType === "bearer" && (
                  <label className="wide">
                    Token
                    <input
                      value={request.auth.bearerToken}
                      onChange={(e) =>
                        updateRequest({
                          auth: { ...request.auth, bearerToken: e.target.value },
                        })
                      }
                      spellCheck={false}
                    />
                  </label>
                )}
                {request.auth.authType === "basic" && (
                  <>
                    <label>
                      Username
                      <input
                        value={request.auth.username}
                        onChange={(e) =>
                          updateRequest({
                            auth: { ...request.auth, username: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label>
                      Password
                      <input
                        type="password"
                        value={request.auth.password}
                        onChange={(e) =>
                          updateRequest({
                            auth: { ...request.auth, password: e.target.value },
                          })
                        }
                      />
                    </label>
                  </>
                )}
                <label>
                  Timeout (ms)
                  <input
                    type="number"
                    min={1}
                    value={request.timeoutMs}
                    onChange={(e) =>
                      updateRequest({ timeoutMs: Number(e.target.value) || 30000 })
                    }
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={request.followRedirects}
                    onChange={(e) =>
                      updateRequest({ followRedirects: e.target.checked })
                    }
                  />
                  Follow redirects
                </label>
              </div>
            )}
            {editorTab === "curl" && (
              <div className="curl-pane">
                <textarea
                  className="code"
                  value={curlDraft}
                  onChange={(e) => setCurlDraft(e.target.value)}
                  placeholder="Paste a curl command here…"
                  spellCheck={false}
                />
                <div className="row-actions">
                  <button type="button" className="primary" onClick={() => void onImportCurl()}>
                    Import into editor
                  </button>
                  <button type="button" onClick={() => void onExportCurl()}>
                    Refresh from editor
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="result">
          <div className="tabs">
            {(
              [
                ["body", "Response"],
                ["headers", "Headers"],
                ["trace", "Trace"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={resultTab === id ? "active" : ""}
                onClick={() => setResultTab(id)}
              >
                {label}
              </button>
            ))}
            {response && (
              <span className="result-meta">
                {response.status} {response.statusText} · {response.durationMs} ms
                {response.truncated ? " · truncated" : ""}
              </span>
            )}
          </div>
          <div className="result-body">
            {error && <div className="error-banner">{error}</div>}
            {resultTab === "body" && (
              <pre className="code-view">{prettyBody || "No response yet."}</pre>
            )}
            {resultTab === "headers" && (
              <pre className="code-view">
                {response?.headers?.length
                  ? response.headers.map((h) => `${h.key}: ${h.value}`).join("\n")
                  : "No response headers."}
              </pre>
            )}
            {resultTab === "trace" && (
              <div className="trace-list">
                {events.length === 0 && <p className="muted">No trace events yet.</p>}
                {events.map((event, index) => (
                  <details key={`${event.atMs}-${index}`} open={index < 3 || !!event.detail}>
                    <summary>
                      <span className="trace-time">+{event.atMs} ms</span>
                      <span className="trace-kind">{event.kind}</span>
                      <span>{event.message}</span>
                    </summary>
                    {event.detail && <pre>{event.detail}</pre>}
                  </details>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function KeyValueEditor({
  rows,
  onChange,
  onAdd,
  onRemove,
}: {
  rows: KeyValue[];
  onChange: (index: number, patch: Partial<KeyValue>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="kv-editor">
      {rows.map((row, index) => (
        <div className="kv-row" key={index}>
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => onChange(index, { enabled: e.target.checked })}
          />
          <input
            placeholder="Key"
            value={row.key}
            onChange={(e) => onChange(index, { key: e.target.value })}
            spellCheck={false}
          />
          <input
            placeholder="Value"
            value={row.value}
            onChange={(e) => onChange(index, { value: e.target.value })}
            spellCheck={false}
          />
          <button type="button" className="ghost" onClick={() => onRemove(index)}>
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={onAdd}>
        Add row
      </button>
    </div>
  );
}

export default App;
