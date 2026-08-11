import { useMemo, useState } from "react";
import {
  CookiePart,
  isCookieHeader,
  joinCookieParts,
  looksLikeJwt,
  parseCookieParts,
} from "./cookies";
import { JwtModal } from "./JwtModal";
import { KeyValue } from "./types";

export function HeadersEditor({
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
  const [jwtValue, setJwtValue] = useState<string | null>(null);

  const ordered = useMemo(() => {
    const indexed = rows.map((row, index) => ({ row, index }));
    const cookies = indexed.filter(({ row }) => isCookieHeader(row.key));
    const rest = indexed.filter(({ row }) => !isCookieHeader(row.key));
    return [...cookies, ...rest];
  }, [rows]);

  return (
    <div className="kv-editor">
      {ordered.map(({ row, index }) => {
        const cookie = isCookieHeader(row.key);
        return (
          <div
            key={index}
            className={cookie ? "kv-block cookie-block" : "kv-block"}
          >
            <div className="kv-row">
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
              <button
                type="button"
                className="ghost"
                onClick={() => onRemove(index)}
              >
                ×
              </button>
            </div>
            {cookie && row.value.trim() !== "" && (
              <CookiePartsEditor
                headerKey={row.key}
                value={row.value}
                onChangeValue={(value) => onChange(index, { value })}
                onViewJwt={setJwtValue}
              />
            )}
          </div>
        );
      })}
      <button type="button" onClick={onAdd}>
        Add row
      </button>
      {jwtValue && (
        <JwtModal value={jwtValue} onClose={() => setJwtValue(null)} />
      )}
    </div>
  );
}

function CookiePartsEditor({
  headerKey,
  value,
  onChangeValue,
  onViewJwt,
}: {
  headerKey: string;
  value: string;
  onChangeValue: (value: string) => void;
  onViewJwt: (value: string) => void;
}) {
  const parts = parseCookieParts(headerKey, value);

  function updatePart(index: number, patch: Partial<CookiePart>) {
    const next = parts.map((part, i) =>
      i === index ? { ...part, ...patch } : part,
    );
    onChangeValue(joinCookieParts(next));
  }

  function removePart(index: number) {
    const next = parts.filter((_, i) => i !== index);
    onChangeValue(joinCookieParts(next));
  }

  function addPart() {
    onChangeValue(joinCookieParts([...parts, { name: "", value: "", raw: "" }]));
  }

  return (
    <div className="cookie-parts-editor">
      <ul className="cookie-parts">
        {parts.map((part, index) => {
          const jwt = looksLikeJwt(part.value);
          return (
            <li className="cookie-part cookie-part-edit" key={index}>
              <input
                className="cookie-part-name-input"
                value={part.name}
                placeholder="name"
                onChange={(e) => updatePart(index, { name: e.target.value })}
                spellCheck={false}
              />
              <span className="header-sep">=</span>
              <input
                className="cookie-part-value-input"
                value={part.value}
                placeholder="value"
                onChange={(e) => updatePart(index, { value: e.target.value })}
                spellCheck={false}
              />
              {jwt && (
                <button
                  type="button"
                  className="ghost tiny jwt-btn"
                  onClick={() => onViewJwt(part.value)}
                  title="Decode JWT"
                >
                  JWT
                </button>
              )}
              <button
                type="button"
                className="ghost tiny"
                onClick={() => removePart(index)}
                title="Remove cookie"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="ghost tiny" onClick={addPart}>
        Add cookie
      </button>
    </div>
  );
}
