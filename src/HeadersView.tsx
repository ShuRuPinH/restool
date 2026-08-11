import { useMemo, useState } from "react";
import {
  CookieHeaderGroup,
  CookiePart,
  looksLikeJwt,
  splitHeaders,
} from "./cookies";
import { JwtModal } from "./JwtModal";
import { KeyValue } from "./types";

export function HeadersView({ headers }: { headers?: KeyValue[] | null }) {
  const [jwtValue, setJwtValue] = useState<string | null>(null);

  const { cookies, rest } = useMemo(
    () => splitHeaders(headers ?? []),
    [headers],
  );

  if (!headers?.length) {
    return <pre className="code-view">No response headers.</pre>;
  }

  return (
    <div className="headers-view">
      {cookies.length > 0 && (
        <div className="headers-section">
          <div className="headers-section-title">Cookies</div>
          {cookies.map((group, index) => (
            <CookieGroup
              key={`cookie-${index}-${group.key}`}
              group={group}
              onViewJwt={setJwtValue}
            />
          ))}
        </div>
      )}
      <div className="headers-section">
        {cookies.length > 0 && (
          <div className="headers-section-title">Other headers</div>
        )}
        {rest.map((header, index) => (
          <div className="header-line" key={`rest-${index}-${header.key}`}>
            <span className="header-key">{header.key}</span>
            <span className="header-sep">: </span>
            <span className="header-value">{header.value}</span>
          </div>
        ))}
        {rest.length === 0 && cookies.length === 0 && (
          <pre className="code-view">No response headers.</pre>
        )}
      </div>
      {jwtValue && (
        <JwtModal value={jwtValue} onClose={() => setJwtValue(null)} />
      )}
    </div>
  );
}

function CookieGroup({
  group,
  onViewJwt,
}: {
  group: CookieHeaderGroup;
  onViewJwt: (value: string) => void;
}) {
  return (
    <div className="cookie-group">
      <div className="header-line cookie-summary">
        <span className="header-key">{group.key}</span>
        <span className="header-sep">: </span>
        <span className="header-value">{group.value}</span>
      </div>
      <ul className="cookie-parts">
        {group.parts.map((part, index) => (
          <CookiePartRow
            key={`${part.name}-${index}`}
            part={part}
            onViewJwt={onViewJwt}
          />
        ))}
      </ul>
    </div>
  );
}

function CookiePartRow({
  part,
  onViewJwt,
}: {
  part: CookiePart;
  onViewJwt: (value: string) => void;
}) {
  const jwt = looksLikeJwt(part.value);

  return (
    <li className="cookie-part">
      <span className="cookie-part-name">{part.name}</span>
      {part.value !== "" && (
        <>
          <span className="header-sep">=</span>
          <span className="cookie-part-value" title={part.value}>
            {part.value}
          </span>
        </>
      )}
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
    </li>
  );
}
