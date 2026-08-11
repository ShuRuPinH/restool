# Restool

Desktop REST client for Ubuntu, built with **Tauri 2 + React + TypeScript + Rust**.

## Features

- Edit method, URL, query, headers, body, and auth
- **multipart/form-data** body with text fields and files from disk
- Send requests and inspect status, headers, and body
- Import / export **curl** (including `-F` form fields)
- Live-style **trace log** of request stages
- **History** with one-click restore into the editor (no collections)

## Prerequisites (Ubuntu)

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  librsvg2-dev \
  patchelf \
  build-essential \
  curl wget file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev
```

Also need Rust (`rustup`) and Node.js 18+.

## Develop

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

History is stored at `~/.local/share/restool/history.json`.

## Data storage and migration

- Request history: `~/.local/share/restool/history.json`
- App local data (roles/auth profiles, clipboard, UI localStorage): `~/.local/share/com.restool.app/localstorage/`

For a full backup/migration, close the app first and archive both folders:

```bash
tar -czf restool-backup.tar.gz \
  -C "$HOME/.local/share" restool com.restool.app
```

Restore on another machine:

```bash
tar -xzf restool-backup.tar.gz -C "$HOME/.local/share"
```
