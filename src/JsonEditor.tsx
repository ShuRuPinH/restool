import { UIEvent, useDeferredValue, useMemo, useRef } from "react";
import { highlightJsonHtml } from "./jsonHighlight";

export function JsonEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const deferred = useDeferredValue(value);
  const html = useMemo(() => {
    if (!deferred) {
      return `<span class="jh-plain">${escapeAttr(placeholder ?? "")}</span>`;
    }
    return highlightJsonHtml(deferred);
  }, [deferred, placeholder]);

  function syncScroll(event: UIEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = target.scrollTop;
      highlightRef.current.scrollLeft = target.scrollLeft;
    }
  }

  return (
    <div className="json-editor">
      <pre
        ref={highlightRef}
        className="json-editor-highlight json-view"
        aria-hidden
        dangerouslySetInnerHTML={{ __html: html + "\n" }}
      />
      <textarea
        className="json-editor-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  );
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
