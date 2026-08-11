import { decodeJwt, formatJwtJson } from "./cookies";
import { highlightJsonHtml } from "./jsonHighlight";

export function JwtModal({ value, onClose }: { value: string; onClose: () => void }) {
  const decoded = decodeJwt(value);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="JWT viewer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <strong>JWT</strong>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {!decoded ? (
          <p className="muted">Could not decode this value as JWT.</p>
        ) : (
          <div className="jwt-sections">
            <section>
              <h4>Header</h4>
              <pre
                className="code-view json-view"
                dangerouslySetInnerHTML={{
                  __html: highlightJsonHtml(formatJwtJson(decoded.header)),
                }}
              />
            </section>
            <section>
              <h4>Payload</h4>
              <pre
                className="code-view json-view"
                dangerouslySetInnerHTML={{
                  __html: highlightJsonHtml(formatJwtJson(decoded.payload)),
                }}
              />
            </section>
            <section>
              <h4>Signature</h4>
              <pre className="code-view">{decoded.signature}</pre>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
