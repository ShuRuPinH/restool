# Restool

Desktop REST client for Ubuntu, built with **Tauri 2 + React + TypeScript + Rust**.

## Features

- Edit method, URL, query, headers, body, and auth
- Send requests and inspect status, headers, and body
- Import / export **curl**
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
