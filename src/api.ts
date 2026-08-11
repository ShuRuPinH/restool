import { invoke } from "@tauri-apps/api/core";
import type { ExecuteResult, HistoryEntry, HttpRequest, PickedFile } from "./types";

export function parseCurlCommand(command: string) {
  return invoke<HttpRequest>("parse_curl_command", { command });
}

export function exportCurlCommand(request: HttpRequest) {
  return invoke<string>("export_curl_command", { request });
}

export function pickFile() {
  return invoke<PickedFile | null>("pick_file");
}

export function sendRequest(request: HttpRequest) {
  return invoke<ExecuteResult>("send_request", { request });
}

export function listHistory() {
  return invoke<HistoryEntry[]>("list_history");
}

export function deleteHistory(id: string) {
  return invoke<void>("delete_history", { id });
}

export function updateHistoryTag(id: string, tag: string | null) {
  return invoke<HistoryEntry>("update_history_tag", { id, tag });
}

export function clearHistory() {
  return invoke<void>("clear_history");
}
