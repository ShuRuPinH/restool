const TOKEN_RE =
  /("(?:\\.|[^"\\])*")\s*(:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}\[\].,:])|(\s+)/g;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function span(kind: string, text: string): string {
  return `<span class="jh-${kind}">${escapeHtml(text)}</span>`;
}

/** Fast HTML highlighter — avoids thousands of React nodes. */
export function highlightJsonHtml(source: string): string {
  let html = "";
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(source)) !== null) {
    if (match.index > last) {
      html += span("plain", source.slice(last, match.index));
    }

    const [full, str, colon, num, lit, punct, ws] = match;

    if (str !== undefined) {
      if (colon) {
        html += span("key", str) + span("punct", colon);
      } else {
        html += span("string", str);
      }
    } else if (num !== undefined) {
      html += span("number", num);
    } else if (lit !== undefined) {
      html += span(lit === "null" ? "null" : "boolean", lit);
    } else if (punct !== undefined) {
      html += span("punct", punct);
    } else {
      html += span("plain", ws ?? full);
    }

    last = match.index + full.length;
  }

  if (last < source.length) {
    html += span("plain", source.slice(last));
  }

  return html;
}

export function tryParseJson(text: string): string | null {
  if (!text.trim()) return null;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

export function JsonView({ text, empty }: { text: string; empty?: string }) {
  if (!text) {
    return <pre className="code-view">{empty ?? "No response yet."}</pre>;
  }

  const pretty = tryParseJson(text);
  if (!pretty) {
    return <pre className="code-view">{text}</pre>;
  }

  return (
    <pre
      className="code-view json-view"
      data-lang="json"
      dangerouslySetInnerHTML={{ __html: highlightJsonHtml(pretty) }}
    />
  );
}
