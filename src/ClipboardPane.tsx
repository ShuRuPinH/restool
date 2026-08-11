import { FormEvent, memo, useEffect, useState } from "react";

export interface ClipboardSnippet {
  id: string;
  name: string;
  text: string;
  createdAt: string;
}

const STORAGE_KEY = "restool.clipboard";
const OPEN_KEY = "restool.clipboardOpen";

function loadSnippets(): ClipboardSnippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ClipboardSnippet[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadOpen(): boolean {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

export const ClipboardPane = memo(function ClipboardPane({
  onStatus,
}: {
  onStatus: (message: string) => void;
}) {
  const [open, setOpen] = useState(loadOpen);
  const [snippets, setSnippets] = useState<ClipboardSnippet[]>(loadSnippets);
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
  }, [snippets]);

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  }, [open]);

  function onAdd(event: FormEvent) {
    event.preventDefault();
    const nextName = name.trim();
    const nextText = text.trim();
    if (!nextName || !nextText) {
      onStatus("Clipboard: name and text are required");
      return;
    }
    const entry: ClipboardSnippet = {
      id: crypto.randomUUID(),
      name: nextName,
      text: nextText,
      createdAt: new Date().toISOString(),
    };
    setSnippets((prev) => [entry, ...prev]);
    setName("");
    setText("");
    onStatus(`Clipboard saved: ${nextName}`);
  }

  async function onCopy(snippet: ClipboardSnippet) {
    try {
      await navigator.clipboard.writeText(snippet.text);
      onStatus(`Copied: ${snippet.name}`);
    } catch (err) {
      onStatus(`Copy failed: ${err}`);
    }
  }

  function onRemove(id: string) {
    setSnippets((prev) => prev.filter((item) => item.id !== id));
  }

  if (!open) {
    return (
      <aside className="clipboard-pane collapsed" aria-label="Clipboard collapsed">
        <button
          type="button"
          className="clipboard-toggle"
          onClick={() => setOpen(true)}
          title="Show clipboard"
        >
          Clipboard
        </button>
      </aside>
    );
  }

  return (
    <aside className="clipboard-pane">
      <div className="pane-title">
        <span>Clipboard</span>
        <button
          type="button"
          className="ghost"
          onClick={() => setOpen(false)}
          title="Hide clipboard"
        >
          Hide
        </button>
      </div>

      <form className="clipboard-form" onSubmit={onAdd}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          maxLength={60}
          spellCheck={false}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Text to copy (cookie, token…)"
          spellCheck={false}
          rows={4}
        />
        <button type="submit" className="primary">
          Add
        </button>
      </form>

      <div className="clipboard-list">
        {snippets.length === 0 && (
          <p className="muted pad">Saved snippets will appear here.</p>
        )}
        {snippets.map((snippet) => (
          <div className="clipboard-item" key={snippet.id}>
            <button
              type="button"
              className="clipboard-copy"
              onClick={() => void onCopy(snippet)}
              title={snippet.text}
            >
              <span className="clipboard-name">{snippet.name}</span>
              <span className="clipboard-time">
                {new Date(snippet.createdAt).toLocaleString()}
              </span>
            </button>
            <button
              type="button"
              className="ghost tiny"
              onClick={() => onRemove(snippet.id)}
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
});
