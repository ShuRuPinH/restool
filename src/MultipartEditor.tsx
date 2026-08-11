import { pickFile } from "./api";
import { MultipartField, MultipartFieldKind } from "./types";

export function MultipartEditor({
  rows,
  onChange,
  onAdd,
  onRemove,
  onStatus,
}: {
  rows: MultipartField[];
  onChange: (index: number, patch: Partial<MultipartField>) => void;
  onAdd: (kind?: MultipartFieldKind) => void;
  onRemove: (index: number) => void;
  onStatus: (message: string) => void;
}) {
  async function onPick(index: number) {
    try {
      const picked = await pickFile();
      if (!picked) {
        onStatus("File pick cancelled");
        return;
      }
      onChange(index, {
        kind: "file",
        filePath: picked.path,
        fileName: picked.fileName,
        contentType: picked.contentType,
        value: "",
      });
      onStatus(`File selected: ${picked.fileName || picked.path}`);
    } catch (err) {
      onStatus(`File pick failed: ${err}`);
    }
  }

  return (
    <div className="multipart-editor">
      <p className="muted multipart-hint">
        multipart/form-data — text fields and files from disk. Content-Type boundary is set automatically.
      </p>
      {rows.map((row, index) => (
        <div className="multipart-row" key={index}>
          <div className="multipart-main">
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={(e) => onChange(index, { enabled: e.target.checked })}
              title="Enabled"
            />
            <select
              value={row.kind}
              onChange={(e) => {
                const kind = e.target.value as MultipartFieldKind;
                onChange(index, {
                  kind,
                  ...(kind === "text"
                    ? { filePath: "", fileName: "", contentType: "" }
                    : { value: "" }),
                });
              }}
              title="Field type"
            >
              <option value="text">Text</option>
              <option value="file">File</option>
            </select>
            <input
              placeholder="Name"
              value={row.key}
              onChange={(e) => onChange(index, { key: e.target.value })}
              spellCheck={false}
            />
            {row.kind === "text" ? (
              <input
                placeholder="Value"
                value={row.value}
                onChange={(e) => onChange(index, { value: e.target.value })}
                spellCheck={false}
              />
            ) : (
              <div className="multipart-file">
                <button type="button" onClick={() => void onPick(index)}>
                  Choose…
                </button>
                <span className="multipart-file-path" title={row.filePath}>
                  {row.fileName || row.filePath || "No file selected"}
                </span>
              </div>
            )}
            <button
              type="button"
              className="ghost"
              onClick={() => onRemove(index)}
              title="Remove"
            >
              ×
            </button>
          </div>
          {row.kind === "file" && (
            <div className="multipart-file-meta">
              <input
                placeholder="Content-Type (optional)"
                value={row.contentType}
                onChange={(e) => onChange(index, { contentType: e.target.value })}
                spellCheck={false}
              />
              <input
                placeholder="Filename override (optional)"
                value={row.fileName}
                onChange={(e) => onChange(index, { fileName: e.target.value })}
                spellCheck={false}
              />
            </div>
          )}
        </div>
      ))}
      <div className="row-actions">
        <button type="button" onClick={() => onAdd("text")}>
          Add text field
        </button>
        <button type="button" onClick={() => onAdd("file")}>
          Add file field
        </button>
      </div>
    </div>
  );
}
