import { FormEvent, MouseEvent, startTransition, useCallback, useEffect, useMemo, useState } from "react";
import {
  clearHistory,
  deleteHistory,
  exportCurlCommand,
  listHistory,
  parseCurlCommand,
  sendRequest,
  updateHistoryTag,
} from "./api";
import {
  AuthType,
  BodyType,
  createEmptyRequest,
  emptyKeyValue,
  emptyMultipartField,
  ExecuteResult,
  HistoryEntry,
  HttpMethod,
  HttpRequest,
  HttpResponse,
  KeyValue,
  MultipartField,
  MultipartFieldKind,
  normalizeRequest,
  TraceEvent,
} from "./types";
import { applyCookiesToHeaders } from "./authProfiles";
import { AuthProfilesPane } from "./AuthProfilesPane";
import { ClipboardPane } from "./ClipboardPane";
import { HeadersEditor } from "./HeadersEditor";
import { HeadersView } from "./HeadersView";
import { JsonEditor } from "./JsonEditor";
import { MultipartEditor } from "./MultipartEditor";
import { JsonView } from "./jsonHighlight";
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
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");

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
    return response.body;
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

  function updateMultipart(index: number, patch: Partial<MultipartField>) {
    setRequest((prev) => {
      const next = [...prev.multipart];
      next[index] = { ...next[index], ...patch };
      return { ...prev, multipart: next };
    });
  }

  function addMultipart(kind: MultipartFieldKind = "text") {
    setRequest((prev) => ({
      ...prev,
      multipart: [...prev.multipart, emptyMultipartField(kind)],
    }));
  }

  function removeMultipart(index: number) {
    setRequest((prev) => {
      const next = prev.multipart.filter((_, i) => i !== index);
      return {
        ...prev,
        multipart: next.length ? next : [emptyMultipartField()],
      };
    });
  }

  function setBodyType(bodyType: BodyType) {
    setRequest((prev) => ({
      ...prev,
      bodyType,
      multipart:
        prev.multipart.length > 0 ? prev.multipart : [emptyMultipartField()],
    }));
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
    const confirmed = window.confirm(
      "Clear all history entries? This cannot be undone.",
    );
    if (!confirmed) return;
    await clearHistory();
    await loadHistory();
    setStatus("History cleared");
  }

  function clearEditor() {
    setRequest(createEmptyRequest());
    setResponse(null);
    setEvents([]);
    setError(null);
    setCurlDraft("");
    setEditorTab("headers");
    setResultTab("body");
    setStatus("Editor cleared");
  }

  function startTagEdit(entry: HistoryEntry, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    setEditingTagId(entry.id);
    setTagDraft(entry.tag ?? "");
  }

  async function saveTag(id: string) {
    const next = tagDraft.trim();
    try {
      const updated = await updateHistoryTag(id, next || null);
      setHistory((prev) => prev.map((item) => (item.id === id ? updated : item)));
      setStatus(next ? `Tag saved: ${next}` : "Tag removed");
    } catch (err) {
      setStatus(`Tag update failed: ${err}`);
    } finally {
      setEditingTagId(null);
      setTagDraft("");
    }
  }

  function onApplyRoleCookies(cookies: string, profileName: string) {
    setRequest((prev) => ({
      ...prev,
      headers: applyCookiesToHeaders(prev.headers, cookies),
    }));
    setEditorTab("headers");
    setStatus(`Applied cookies: ${profileName}`);
  }

  async function onRoleAuthResult(result: ExecuteResult) {
    setResponse(result.response ?? null);
    setEvents(result.events);
    setError(result.error ?? null);
    setResultTab(result.error ? "trace" : "headers");
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
              <div className="history-content">
                <div className="history-tag-row">
                  {editingTagId === entry.id ? (
                    <input
                      className="history-tag-input"
                      value={tagDraft}
                      autoFocus
                      maxLength={40}
                      placeholder="Tag comment…"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onBlur={() => void saveTag(entry.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveTag(entry.id);
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setEditingTagId(null);
                          setTagDraft("");
                        }
                      }}
                    />
                  ) : entry.tag ? (
                    <button
                      type="button"
                      className="history-tag"
                      title="Edit tag"
                      onClick={(e) => startTagEdit(entry, e)}
                    >
                      {entry.tag}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="history-tag-add"
                      title="Add tag"
                      onClick={(e) => startTagEdit(entry, e)}
                    >
                      + tag
                    </button>
                  )}
                </div>
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
              </div>
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
        <AuthProfilesPane
          onApplyCookies={onApplyRoleCookies}
          onStatus={setStatus}
          onAuthResult={onRoleAuthResult}
        />
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
          <button type="button" onClick={clearEditor}>
            Clear editor
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
                onClick={() => startTransition(() => setEditorTab(id))}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="editor-body">
            <div className={editorTab === "params" ? "tab-panel active" : "tab-panel"}>
              <KeyValueEditor
                rows={request.query}
                onChange={(i, patch) => updateList("query", i, patch)}
                onAdd={() => addRow("query")}
                onRemove={(i) => removeRow("query", i)}
              />
            </div>
            <div className={editorTab === "headers" ? "tab-panel active" : "tab-panel"}>
              <HeadersEditor
                rows={request.headers}
                onChange={(i, patch) => updateList("headers", i, patch)}
                onAdd={() => addRow("headers")}
                onRemove={(i) => removeRow("headers", i)}
              />
            </div>
            <div className={editorTab === "body" ? "tab-panel active" : "tab-panel"}>
              <div className="body-type-bar">
                <button
                  type="button"
                  className={request.bodyType === "raw" ? "active" : undefined}
                  onClick={() => setBodyType("raw")}
                >
                  Raw
                </button>
                <button
                  type="button"
                  className={request.bodyType === "multipart" ? "active" : undefined}
                  onClick={() => setBodyType("multipart")}
                >
                  multipart/form-data
                </button>
              </div>
              {request.bodyType === "multipart" ? (
                <MultipartEditor
                  rows={request.multipart}
                  onChange={updateMultipart}
                  onAdd={addMultipart}
                  onRemove={removeMultipart}
                  onStatus={setStatus}
                />
              ) : (
                <JsonEditor
                  value={request.body}
                  onChange={(body) => updateRequest({ body })}
                  placeholder='{"example": true}'
                />
              )}
            </div>
            <div className={editorTab === "auth" ? "tab-panel active" : "tab-panel"}>
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
            </div>
            <div className={editorTab === "curl" ? "tab-panel active" : "tab-panel"}>
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
            </div>
          </div>
        </section>

        <section className="result">
          <div className="tabs">
            {(
              [
                ["body", "Body"],
                ["headers", "Headers"],
                ["trace", "Trace"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={resultTab === id ? "active" : ""}
                onClick={() => startTransition(() => setResultTab(id))}
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
              <JsonView text={prettyBody} empty="No response yet." />
            )}
            {resultTab === "headers" && <HeadersView headers={response?.headers} />}
            {resultTab === "trace" && (
              <div className="trace-list">
                {events.length === 0 && <p className="muted">No trace events yet.</p>}
                {events.map((event, index) => (
                  <details
                    key={`${event.atMs}-${index}`}
                    className={`trace-item kind-${event.kind}`}
                    open={index < 3 || !!event.detail}
                  >
                    <summary>
                      <span className="trace-time">+{event.atMs} ms</span>
                      <span className={`trace-kind kind-${event.kind}`}>{event.kind}</span>
                      <span className="trace-message">{event.message}</span>
                    </summary>
                    {event.detail && <pre>{event.detail}</pre>}
                  </details>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <ClipboardPane onStatus={setStatus} />
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
