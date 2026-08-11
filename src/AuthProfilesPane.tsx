import { FormEvent, memo, useEffect, useState } from "react";
import { sendRequest } from "./api";
import {
  AuthProfile,
  buildLoginRequest,
  buildRefreshRequest,
  createEmptyAuthProfile,
  loadAuthProfiles,
  profileAfterAuth,
  REFRESH_METHODS,
  saveAuthProfiles,
} from "./authProfiles";
import type { ExecuteResult, HttpMethod } from "./types";

export const AuthProfilesPane = memo(function AuthProfilesPane({
  onApplyCookies,
  onStatus,
  onAuthResult,
}: {
  onApplyCookies: (cookies: string, profileName: string) => void;
  onStatus: (message: string) => void;
  onAuthResult: (result: ExecuteResult) => void | Promise<void>;
}) {
  const [profiles, setProfiles] = useState<AuthProfile[]>(loadAuthProfiles);
  const [draft, setDraft] = useState(createEmptyAuthProfile);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    saveAuthProfiles(profiles);
  }, [profiles]);

  function updateProfile(id: string, patch: Partial<AuthProfile>) {
    setProfiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function onAdd(event: FormEvent) {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      onStatus("Roles: name is required");
      return;
    }
    const entry: AuthProfile = {
      ...draft,
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    };
    setProfiles((prev) => [entry, ...prev]);
    setDraft(createEmptyAuthProfile());
    setExpandedId(entry.id);
    onStatus(`Role added: ${name}`);
  }

  function onRemove(id: string) {
    setProfiles((prev) => prev.filter((item) => item.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function onApply(profile: AuthProfile) {
    const cookies = profile.cookies.trim();
    if (!cookies) {
      onStatus(`Roles: ${profile.name || "role"} has empty cookies`);
      return;
    }
    onApplyCookies(cookies, profile.name || "role");
  }

  async function runAuth(
    profile: AuthProfile,
    kind: "login" | "refresh",
  ) {
    const url = kind === "login" ? profile.loginUrl.trim() : profile.refreshUrl.trim();
    if (!url) {
      onStatus(`Roles: ${kind} URL is required`);
      return;
    }
    if (kind === "login" && !profile.loginBody.trim()) {
      onStatus("Roles: login JSON body is required");
      return;
    }
    if (kind === "refresh" && !profile.cookies.trim()) {
      onStatus("Roles: cookies required for refresh");
      return;
    }

    setBusyId(profile.id);
    onStatus(`${profile.name}: ${kind}…`);
    try {
      const request =
        kind === "login"
          ? buildLoginRequest(profile)
          : buildRefreshRequest(profile);
      const result = await sendRequest(request);
      await onAuthResult(result);
      const next = profileAfterAuth(profile, result);
      updateProfile(profile.id, next);
      if (next.status === "ok") {
        onStatus(
          `${profile.name}: ${kind} ok · cookies updated`,
        );
      } else {
        onStatus(
          `${profile.name}: ${kind} failed · ${next.lastError ?? "error"}`,
        );
      }
    } catch (err) {
      updateProfile(profile.id, {
        status: "error",
        lastError: String(err),
      });
      onStatus(`${profile.name}: ${kind} error · ${err}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="roles-pane" aria-label="Auth roles">
      <div className="pane-title roles-title">
        <span>Roles</span>
      </div>

      <form className="roles-add" onSubmit={onAdd}>
        <input
          value={draft.name}
          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Role name (admin, user…)"
          maxLength={40}
          spellCheck={false}
        />
        <button type="submit" className="primary">
          Add
        </button>
      </form>

      <div className="roles-list">
        {profiles.length === 0 && (
          <p className="muted pad">Role cookies for quick swap while testing.</p>
        )}
        {profiles.map((profile) => {
          const open = expandedId === profile.id;
          const busy = busyId === profile.id;
          return (
            <article
              key={profile.id}
              className={`role-card status-${profile.status}`}
            >
              <div className="role-head">
                <input
                  className="role-name"
                  value={profile.name}
                  onChange={(e) =>
                    updateProfile(profile.id, { name: e.target.value })
                  }
                  placeholder="Name"
                  maxLength={40}
                  spellCheck={false}
                />
                <span className={`role-badge ${profile.status}`} title={profile.lastError ?? undefined}>
                  {profile.status}
                </span>
                <button
                  type="button"
                  className="ghost tiny"
                  onClick={() => onRemove(profile.id)}
                  title="Remove"
                >
                  ×
                </button>
              </div>

              <textarea
                className="role-cookies"
                value={profile.cookies}
                onChange={(e) =>
                  updateProfile(profile.id, { cookies: e.target.value })
                }
                placeholder="Cookie text: a=1; b=2"
                spellCheck={false}
                rows={3}
              />

              <div className="role-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => onApply(profile)}
                  disabled={!profile.cookies.trim()}
                  title="Replace Cookie header in editor"
                >
                  Apply
                </button>
                <button
                  type="button"
                  className={open ? "active" : undefined}
                  onClick={() =>
                    setExpandedId(open ? null : profile.id)
                  }
                >
                  Auth
                </button>
              </div>

              {open && (
                <div className="role-auth">
                  <input
                    value={profile.loginUrl}
                    onChange={(e) =>
                      updateProfile(profile.id, { loginUrl: e.target.value })
                    }
                    placeholder="Login URL"
                    spellCheck={false}
                  />
                  <textarea
                    className="role-login-body"
                    value={profile.loginBody}
                    onChange={(e) =>
                      updateProfile(profile.id, { loginBody: e.target.value })
                    }
                    placeholder={'{\n  "username": "",\n  "password": ""\n}'}
                    spellCheck={false}
                    rows={5}
                  />
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => void runAuth(profile, "login")}
                  >
                    {busy ? "…" : "Login"}
                  </button>

                  {profile.status === "ok" && (
                    <div className="role-refresh">
                      <select
                        className="role-refresh-method"
                        value={profile.refreshMethod}
                        onChange={(e) =>
                          updateProfile(profile.id, {
                            refreshMethod: e.target.value as HttpMethod,
                          })
                        }
                        title="Refresh method"
                      >
                        {REFRESH_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </select>
                      <input
                        value={profile.refreshUrl}
                        onChange={(e) =>
                          updateProfile(profile.id, {
                            refreshUrl: e.target.value,
                          })
                        }
                        placeholder="Refresh URL"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        disabled={busy || !profile.cookies.trim()}
                        onClick={() => void runAuth(profile, "refresh")}
                      >
                        {busy ? "…" : "Refresh"}
                      </button>
                    </div>
                  )}

                  {profile.lastError && (
                    <p className="role-error">{profile.lastError}</p>
                  )}
                  {profile.lastAuthAt && profile.status === "ok" && (
                    <p className="muted role-meta">
                      Auth {new Date(profile.lastAuthAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
});
