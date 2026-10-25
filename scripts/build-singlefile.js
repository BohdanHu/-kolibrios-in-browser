import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const cacheDir = path.resolve(rootDir, '.cache_assets');
const publicDir = path.resolve(rootDir, 'public');

if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

async function fetchOrGetCached(name, url, isText = false) {
  const filePath = path.join(cacheDir, name);
  if (fs.existsSync(filePath)) {
    console.log(`Using cached ${name}`);
    return isText ? fs.readFileSync(filePath, 'utf-8') : fs.readFileSync(filePath);
  }
  console.log(`Downloading ${name} from ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.statusText}`);
  }
  if (isText) {
    const text = await res.text();
    fs.writeFileSync(filePath, text, 'utf-8');
    return text;
  } else {
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buf);
    return buf;
  }
}

async function main() {
  console.log('--- Generating Standalone Offline KolibriOS Single-File HTML ---');

  let libv86Js = await fetchOrGetCached(
    'libv86.js',
    'https://copy.sh/v86/build/libv86.js',
    true
  );

  const targetExportP = '"undefined"!==typeof module&&"undefined"!==typeof module.exports?module.exports.V86=P:"undefined"!==typeof window?window.V86=P:"function"===typeof importScripts&&(self.V86=P);';
  const cleanExportP = 'var _v86_export=P;if(typeof window!=="undefined"){window.V86=_v86_export;window.V86Starter=_v86_export;}if(typeof globalThis!=="undefined"){globalThis.V86=_v86_export;globalThis.V86Starter=_v86_export;}if(typeof self!=="undefined"){self.V86=_v86_export;self.V86Starter=_v86_export;}if(typeof module!=="undefined"&&typeof module.exports!=="undefined"){module.exports.V86=_v86_export;module.exports.V86Starter=_v86_export;};';
  if (libv86Js.includes(targetExportP)) {
    libv86Js = libv86Js.replace(targetExportP, cleanExportP);
  }

  const v86Wasm = await fetchOrGetCached(
    'v86.wasm',
    'https://copy.sh/v86/build/v86.wasm',
    false
  );

  const seaBios = await fetchOrGetCached(
    'seabios.bin',
    'https://copy.sh/v86/bios/seabios.bin',
    false
  );

  const vgaBios = await fetchOrGetCached(
    'vgabios.bin',
    'https://copy.sh/v86/bios/vgabios.bin',
    false
  );

  const kolibriImgPath = path.join(publicDir, 'kolibri.img');
  if (!fs.existsSync(kolibriImgPath)) {
    throw new Error(`Kolibri image not found at ${kolibriImgPath}`);
  }
  const kolibriImg = fs.readFileSync(kolibriImgPath);

  console.log(`Kolibri image size: ${(kolibriImg.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`v86 WASM size: ${(v86Wasm.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`SeaBIOS size: ${(seaBios.length / 1024).toFixed(1)} KB`);
  console.log(`VGABIOS size: ${(vgaBios.length / 1024).toFixed(1)} KB`);
  console.log(`libv86 JS size: ${(libv86Js.length / 1024).toFixed(1)} KB`);

  const v86WasmB64 = v86Wasm.toString('base64');
  const seaBiosB64 = seaBios.toString('base64');
  const vgaBiosB64 = vgaBios.toString('base64');
  const kolibriImgB64 = kolibriImg.toString('base64');

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KolibriOS - 100% Standalone Offline Edition (v86 + IndexedDB)</title>
  <!-- Zero external dependencies: All CSS, JS, WASM, BIOS, and OS images are embedded directly in this single file -->
  <style>
    :root {
      --bg: #09090b;
      --card-bg: #18181b;
      --card-border: #27272a;
      --card-header: #141416;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --emerald: #10b981;
      --emerald-dark: #064e3b;
      --emerald-light: #6ee7b7;
      --danger: #e11d48;
      --danger-hover: #be123c;
      --amber: #f59e0b;
      --sky: #0ea5e9;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      user-select: none;
      -webkit-user-select: none;
      overflow-x: hidden;
    }

    header {
      background-color: var(--card-bg);
      border-bottom: 1px solid var(--card-border);
      padding: 10px 18px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      position: sticky;
      top: 0;
      z-index: 40;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-logo {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #6366f1, #06b6d4, #10b981);
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 14px;
      color: white;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
      flex-shrink: 0;
    }

    .brand-title {
      font-size: 15px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
      letter-spacing: -0.02em;
    }

    .brand-subtitle {
      font-size: 11px;
      color: var(--text-muted);
    }

    .badge-offline {
      font-size: 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      padding: 2px 7px;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.35);
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .badge-offline::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
    }

    .status-group {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 9999px;
      background: #27272a;
      border: 1px solid #3f3f46;
      font-size: 11px;
      font-weight: 500;
      color: #e4e4e7;
    }

    .pill.idb-active {
      background: rgba(99, 102, 241, 0.12);
      border-color: rgba(99, 102, 241, 0.4);
      color: #c7d2fe;
    }

    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--text-muted);
    }
    .dot.running { background: var(--emerald); box-shadow: 0 0 8px var(--emerald); }
    .dot.paused { background: var(--amber); }
    .dot.loading { background: var(--sky); animation: pulse 1s infinite; }
    .dot.error { background: var(--danger); }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 13px;
      border-radius: 7px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
      white-space: nowrap;
      font-family: inherit;
    }

    button:active {
      transform: scale(0.97);
    }

    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .btn-primary {
      background: var(--primary);
      color: white;
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
    }
    .btn-primary:hover:not(:disabled) {
      background: var(--primary-hover);
    }

    .btn-danger {
      background: #27272a;
      color: #fda4af;
      border: 1px solid #4c1d24;
    }
    .btn-danger:hover:not(:disabled) {
      background: rgba(225, 29, 72, 0.25);
      border-color: var(--danger);
      color: #fff;
    }

    .btn-secondary {
      background: #27272a;
      color: var(--text);
      border: 1px solid #3f3f46;
    }
    .btn-secondary:hover:not(:disabled) {
      background: #3f3f46;
      color: #fff;
    }

    .toast {
      padding: 4px 12px;
      background: var(--emerald-dark);
      border: 1px solid var(--emerald);
      color: var(--emerald-light);
      border-radius: 9999px;
      font-size: 11px;
      display: none;
      animation: fadeIn 0.2s ease-in-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 14px;
      max-width: 1100px;
      margin: 0 auto;
      width: 100%;
    }

    .screen-card {
      width: 100%;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.65);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .screen-card.fullscreen {
      position: fixed;
      inset: 0;
      z-index: 9999;
      border-radius: 0;
      border: none;
      max-width: none;
      width: 100vw;
      height: 100vh;
    }

    .card-topbar {
      background: var(--card-header);
      border-bottom: 1px solid var(--card-border);
      padding: 7px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .card-topbar-left, .card-topbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    #screen_container {
      background: #000;
      width: 100%;
      min-height: 480px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      cursor: crosshair;
      overflow: hidden;
    }

    .fullscreen #screen_container {
      flex: 1;
      height: 100%;
      min-height: 0;
    }

    #screen_container canvas {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }

    #screen_container div {
      white-space: pre;
      font-family: monospace;
      font-size: 14px;
      line-height: 14px;
      color: #fff;
    }

    .scale-1x #screen_container canvas {
      transform: scale(1);
    }
    .scale-15x #screen_container canvas {
      transform: scale(1.5);
    }

    .loading-overlay {
      position: absolute;
      inset: 0;
      background: rgba(9, 9, 11, 0.92);
      backdrop-filter: blur(6px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      z-index: 10;
      text-align: center;
      padding: 24px;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255, 255, 255, 0.12);
      border-top-color: var(--sky);
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .mouse-chip {
      position: absolute;
      bottom: 12px;
      background: rgba(24, 24, 27, 0.92);
      border: 1px solid #3f3f46;
      padding: 5px 14px;
      border-radius: 9999px;
      font-size: 11px;
      color: var(--text);
      pointer-events: none;
      backdrop-filter: blur(4px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    footer.info-bar {
      background: var(--card-header);
      border-top: 1px solid var(--card-border);
      padding: 8px 14px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-size: 11px;
      color: var(--text-muted);
    }

    .scale-selector {
      display: flex;
      background: #27272a;
      border-radius: 6px;
      padding: 2px;
      border: 1px solid #3f3f46;
    }

    .scale-btn {
      padding: 2px 7px;
      font-size: 10px;
      background: transparent;
      color: var(--text-muted);
      border-radius: 4px;
    }

    .scale-btn.active {
      background: #3f3f46;
      color: #fff;
    }

    .info-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
      width: 100%;
      margin-top: 16px;
    }

    .info-card {
      background: rgba(24, 24, 27, 0.6);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 12px;
    }

    .info-icon {
      font-size: 16px;
      flex-shrink: 0;
    }

    .info-title {
      font-weight: 600;
      color: #f4f4f5;
      margin-bottom: 2px;
    }

    .info-desc {
      color: var(--text-muted);
      font-size: 11px;
      line-height: 1.45;
    }

    /* Modal styling */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 50;
      padding: 16px;
    }

    .modal-content {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      max-width: 480px;
      width: 100%;
      padding: 20px;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.75);
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      font-weight: 700;
      font-size: 15px;
    }

    .modal-body {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.5;
      margin-bottom: 18px;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  </style>
</head>
<body>

  <!-- Top App Bar -->
  <header>
    <div class="brand">
      <div class="brand-logo">K</div>
      <div>
        <div class="brand-title">
          KolibriOS
          <span class="badge-offline">100% Offline Standalone</span>
        </div>
        <div class="brand-subtitle">v86 x86 WASM • Zero External Network Requests • USB-Ready</div>
      </div>
    </div>

    <div class="status-group">
      <div class="pill">
        <span id="status-dot" class="dot loading"></span>
        <span id="status-text">Booting KolibriOS...</span>
      </div>
      <div class="pill idb-active" id="idb-pill" title="Local browser storage for machine state and virtual files">
        <span>💾 IndexedDB:</span>
        <strong id="idb-size">Checking...</strong>
      </div>
      <div id="save-toast" class="toast">State Saved to IndexedDB!</div>
    </div>

    <div class="actions">
      <button id="save-btn" class="btn-primary" title="Save current machine and disk state to browser IndexedDB">
        💾 Save to IndexedDB
      </button>
      <button id="reset-btn" class="btn-danger" title="Clear IndexedDB storage and cold boot from embedded KolibriOS image">
        🔄 Reset / Cold Boot
      </button>
      <button id="backup-btn" class="btn-secondary" title="Export state to .bin file or restore state">
        📦 Backup / Restore
      </button>
      <button id="fullscreen-btn" class="btn-secondary" title="Toggle Fullscreen">
        ⛶ Fullscreen
      </button>
    </div>
  </header>

  <!-- Main Viewport Area -->
  <main>
    <div id="emulator-card" class="screen-card">
      <div class="card-topbar">
        <div class="card-topbar-left">
          <button id="pause-btn" class="btn-secondary" style="padding: 3px 8px; font-size: 11px;">
            ⏸ Pause
          </button>
          <button id="mouse-lock-btn" class="btn-secondary" style="padding: 3px 8px; font-size: 11px;">
            🖱 Capture Mouse
          </button>
          <span id="boot-info" style="font-size: 11px; color: #a1a1aa;">Boot source: Embedded KolibriOS Floppy</span>
        </div>

        <div class="card-topbar-right">
          <!-- Screen scaling -->
          <div class="scale-selector">
            <button class="scale-btn active" data-scale="fit">Fit</button>
            <button class="scale-btn" data-scale="1x">1x</button>
            <button class="scale-btn" data-scale="15x">1.5x</button>
          </div>
        </div>
      </div>

      <div id="screen_container">
        <!-- v86 creates canvas and text mode elements dynamically -->
        <div id="loading-overlay" class="loading-overlay">
          <div class="spinner"></div>
          <h3 id="loading-title" style="font-size: 16px; font-weight: 700; color: #fff;">Launching KolibriOS...</h3>
          <p id="loading-desc" style="font-size: 12px; color: #a1a1aa; max-width: 360px;">
            Decoding embedded WebAssembly engine and booting KolibriOS...
          </p>
        </div>

        <div id="mouse-chip" class="mouse-chip" style="display: none;">
          Click screen to capture mouse • Press <strong>ESC</strong> to release
        </div>
      </div>

      <footer class="info-bar">
        <span>RAM: 128MB • VRAM: 8MB • Virtual Disk: 32MB IDE (/hd0/)</span>
        <span id="cycles-info">Cycles: WebAssembly Active</span>
        <span id="last-saved-info">Last saved: Never</span>
      </footer>
    </div>

    <!-- Feature & Offline Info Cards -->
    <div class="info-cards">
      <div class="info-card">
        <div class="info-icon">⚡</div>
        <div>
          <div class="info-title">100% Standalone & Offline</div>
          <div class="info-desc">
            All components (v86 JIT emulator, WebAssembly, SeaBIOS, VGABIOS, and KolibriOS OS image) are completely inlined into this single file. You can run this directly from a USB flash drive or offline laptop without any internet connection.
          </div>
        </div>
      </div>

      <div class="info-card">
        <div class="info-icon">💾</div>
        <div>
          <div class="info-title">Persistent Virtual Drive</div>
          <div class="info-desc">
            Changes to your files, desktop icons, and OS configuration are preserved in IndexedDB. Click <strong>"Save to IndexedDB"</strong> anytime, and everything will reload automatically when you reopen this file.
          </div>
        </div>
      </div>

      <div class="info-card">
        <div class="info-icon">🎮</div>
        <div>
          <div class="info-title">Pre-loaded Applications</div>
          <div class="info-desc">
            KolibriOS includes a complete graphical desktop with Eolite file manager, Tinypad text editor, Paint, Calculator, terminal, and over 30 games (Minesweeper, Gomoku, Kosilka, 3D Doom demo).
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Backup & Restore Modal -->
  <div id="backup-modal" class="modal-backdrop">
    <div class="modal-content">
      <div class="modal-header">
        <span>State Backup & Custom Media</span>
        <button id="close-backup-modal" style="background:transparent; border:none; color:#a1a1aa; font-size:16px; cursor:pointer;">✕</button>
      </div>
      <div class="modal-body">
        <p style="margin-bottom: 12px;">
          Export your entire KolibriOS state (memory + virtual hard disk) as a standalone <code>.bin</code> snapshot file, or restore a previously saved state:
        </p>
        <div style="display: flex; gap: 8px; margin-bottom: 16px;">
          <button id="export-bin-btn" class="btn-primary" style="flex: 1; justify-content: center;">
            📥 Export State (.bin)
          </button>
          <label class="btn-secondary" style="flex: 1; justify-content: center; cursor: pointer;">
            📤 Import State (.bin)
            <input type="file" id="import-bin-input" accept=".bin" style="display: none;">
          </label>
        </div>
        <div style="border-top: 1px solid var(--card-border); padding-top: 12px;">
          <div style="font-weight: 600; color: #fff; margin-bottom: 4px;">Boot Custom Disk Image</div>
          <p style="font-size: 11px; margin-bottom: 8px;">
            Load an alternate <code>.img</code> or <code>.iso</code> file from your computer:
          </p>
          <label class="btn-secondary" style="width: 100%; justify-content: center; cursor: pointer;">
            💿 Select .img / .iso File
            <input type="file" id="custom-image-input" accept=".img,.iso,.bin" style="display: none;">
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button id="done-backup-modal" class="btn-secondary">Close</button>
      </div>
    </div>
  </div>

  <!-- EMBEDDED ENGINE: LIBV86 JAVASCRIPT -->
  <script>
    ${libv86Js}
  </script>

  <!-- EMBEDDED BINARIES (BASE64) & EMULATOR ORCHESTRATION -->
  <script>
    // Embedded asset base64 strings
    const V86_WASM_BASE64 = "${v86WasmB64}";
    const SEABIOS_BASE64 = "${seaBiosB64}";
    const VGABIOS_BASE64 = "${vgaBiosB64}";
    const KOLIBRI_IMG_BASE64 = "${kolibriImgB64}";

    // Fast Base64 to ArrayBuffer decoder
    function base64ToArrayBuffer(base64) {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    function formatBytes(bytes) {
      if (!bytes || bytes <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
    }

    // Local IndexedDB Persistence Implementation
    const DB_NAME = 'kolibri_v86_offline_db';
    const DB_VERSION = 1;
    const STORE_NAME = 'snapshots';
    const KEY_SESSION = 'active_session';

    function openDB() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    async function loadSnapshot() {
      try {
        const db = await openDB();
        return new Promise((resolve) => {
          const tx = db.transaction([STORE_NAME], 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(KEY_SESSION);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });
      } catch (e) {
        console.warn('IDB load error:', e);
        return null;
      }
    }

    async function saveSnapshot(buffer) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record = {
          id: KEY_SESSION,
          state: buffer,
          timestamp: Date.now(),
          sizeBytes: buffer.byteLength
        };
        const req = store.put(record);
        req.onsuccess = () => resolve(record);
        req.onerror = () => reject(req.error);
      });
    }

    async function clearStorage() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(KEY_SESSION);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    function showToast(text) {
      const toast = document.getElementById('save-toast');
      toast.textContent = text;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 3500);
    }

    // Emulator Controller
    let emulator = null;
    let isSaving = false;
    let isRunning = false;
    let wasmBlobUrl = null;
    let customImageBuffer = null;

    async function initEmulator(useSaved = false) {
      const overlay = document.getElementById('loading-overlay');
      const statusDot = document.getElementById('status-dot');
      const statusText = document.getElementById('status-text');
      const bootInfo = document.getElementById('boot-info');
      const idbSize = document.getElementById('idb-size');
      const lastSavedInfo = document.getElementById('last-saved-info');

      overlay.style.display = 'flex';
      statusDot.className = 'dot loading';
      statusText.textContent = useSaved ? 'Restoring Session...' : 'Starting KolibriOS...';

      if (emulator) {
        try { emulator.destroy(); } catch (e) {}
        emulator = null;
      }

      const V86Engine = window.V86 || window.V86Starter;
      if (!V86Engine) {
        alert('Internal error: v86 engine missing.');
        return;
      }

      // Check for saved state in IndexedDB
      let savedBuffer = null;
      if (useSaved) {
        const snap = await loadSnapshot();
        if (snap && snap.state) {
          savedBuffer = snap.state;
          bootInfo.textContent = 'Boot source: Restored from IndexedDB';
          idbSize.textContent = formatBytes(snap.sizeBytes);
          lastSavedInfo.textContent = 'Last saved: ' + new Date(snap.timestamp).toLocaleTimeString();
        }
      }

      // Prepare in-memory binaries
      const wasmBuffer = base64ToArrayBuffer(V86_WASM_BASE64);
      if (!wasmBlobUrl) {
        const wasmBlob = new Blob([wasmBuffer], { type: 'application/wasm' });
        wasmBlobUrl = URL.createObjectURL(wasmBlob);
      }

      const seabiosBuffer = base64ToArrayBuffer(SEABIOS_BASE64);
      const vgabiosBuffer = base64ToArrayBuffer(VGABIOS_BASE64);
      const mediaBuffer = customImageBuffer || base64ToArrayBuffer(KOLIBRI_IMG_BASE64);

      const options = {
        wasm_fn: async (param) => {
          const { instance } = await WebAssembly.instantiate(wasmBuffer, param);
          return instance.exports;
        },
        wasm_path: wasmBlobUrl,
        memory_size: 64 * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        screen_container: document.getElementById('screen_container'),
        bios: {
          buffer: seabiosBuffer,
        },
        vga_bios: {
          buffer: vgabiosBuffer,
        },
        fda: {
          buffer: mediaBuffer,
        },
        autostart: true,
      };

      if (savedBuffer) {
        options.initial_state = { buffer: savedBuffer };
      }

      try {
        emulator = new V86Engine(options);

        const onStarted = () => {
          overlay.style.display = 'none';
          const chip = document.getElementById('mouse-chip');
          if (chip) chip.style.display = 'block';
          statusDot.className = 'dot running';
          statusText.textContent = 'Running';
          isRunning = true;
          document.getElementById('pause-btn').textContent = '⏸ Pause';
        };

        emulator.add_listener('emulator-ready', onStarted);
        emulator.add_listener('emulator-started', onStarted);
        emulator.add_listener('screen-set-size', onStarted);

        emulator.add_listener('emulator-stopped', () => {
          statusDot.className = 'dot paused';
          statusText.textContent = 'Paused';
          isRunning = false;
          document.getElementById('pause-btn').textContent = '▶ Resume';
        });

      } catch (err) {
        console.error('v86 launch failed:', err);
        statusDot.className = 'dot error';
        statusText.textContent = 'Boot error';
        document.getElementById('loading-title').textContent = 'Boot Error';
        document.getElementById('loading-desc').textContent = err?.message || 'Error initializing emulator';
      }
    }

    async function handleSave(isAuto = false) {
      if (!emulator || isSaving) return;
      isSaving = true;
      const saveBtn = document.getElementById('save-btn');
      saveBtn.textContent = '⏳ Saving...';
      saveBtn.disabled = true;

      try {
        const buffer = await emulator.save_state();
        const record = await saveSnapshot(buffer);
        document.getElementById('idb-size').textContent = formatBytes(record.sizeBytes);
        document.getElementById('last-saved-info').textContent = 'Last saved: ' + new Date(record.timestamp).toLocaleTimeString();
        showToast(isAuto ? 'Auto-saved to IndexedDB!' : 'State & Disk Saved to IndexedDB!');
      } catch (e) {
        console.error('Save failed:', e);
        if (!isAuto) alert('Save error: ' + e.message);
      } finally {
        isSaving = false;
        saveBtn.textContent = '💾 Save to IndexedDB';
        saveBtn.disabled = false;
      }
    }

    // Export state snapshot to downloadable .bin file
    async function handleExportBin() {
      if (!emulator) return;
      try {
        let buffer = null;
        if (isRunning) {
          buffer = await emulator.save_state();
        } else {
          const record = await loadSnapshot();
          buffer = record?.state;
        }

        if (!buffer) {
          alert('No state available to export. Start KolibriOS first.');
          return;
        }

        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kolibrios-offline-state-' + new Date().toISOString().slice(0, 10) + '.bin';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('State exported as .bin file');
      } catch (err) {
        alert('Export failed: ' + err.message);
      }
    }

    // UI event listeners
    document.getElementById('save-btn').onclick = () => handleSave(false);

    document.getElementById('reset-btn').onclick = async () => {
      if (confirm('Clear local IndexedDB storage and cold boot fresh KolibriOS from embedded image?')) {
        await clearStorage();
        document.getElementById('idb-size').textContent = '0 B';
        document.getElementById('last-saved-info').textContent = 'Last saved: Never';
        customImageBuffer = null;
        initEmulator(false);
      }
    };

    document.getElementById('pause-btn').onclick = () => {
      if (!emulator) return;
      if (isRunning) {
        emulator.stop();
      } else {
        emulator.run();
      }
    };

    document.getElementById('mouse-lock-btn').onclick = () => {
      if (emulator) emulator.lock_mouse();
    };

    document.getElementById('screen_container').onclick = () => {
      if (emulator && isRunning) emulator.lock_mouse();
    };

    // Fullscreen toggle
    document.getElementById('fullscreen-btn').onclick = () => {
      const card = document.getElementById('emulator-card');
      if (!document.fullscreenElement) {
        card.requestFullscreen().then(() => {
          card.classList.add('fullscreen');
        }).catch(console.warn);
      } else {
        document.exitFullscreen().then(() => {
          card.classList.remove('fullscreen');
        }).catch(console.warn);
      }
    };

    document.addEventListener('fullscreenchange', () => {
      const card = document.getElementById('emulator-card');
      if (!document.fullscreenElement) {
        card.classList.remove('fullscreen');
      }
    });

    // Display scale buttons
    document.querySelectorAll('.scale-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const card = document.getElementById('emulator-card');
        card.classList.remove('scale-1x', 'scale-15x');
        const scale = btn.getAttribute('data-scale');
        if (scale === '1x') card.classList.add('scale-1x');
        if (scale === '15x') card.classList.add('scale-15x');
      });
    });

    // Modal controls
    const backupModal = document.getElementById('backup-modal');
    document.getElementById('backup-btn').onclick = () => { backupModal.style.display = 'flex'; };
    document.getElementById('close-backup-modal').onclick = () => { backupModal.style.display = 'none'; };
    document.getElementById('done-backup-modal').onclick = () => { backupModal.style.display = 'none'; };
    document.getElementById('export-bin-btn').onclick = handleExportBin;

    // Import .bin snapshot file
    document.getElementById('import-bin-input').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const buffer = reader.result;
          await saveSnapshot(buffer);
          backupModal.style.display = 'none';
          showToast('State imported from ' + file.name);
          initEmulator(true);
        } catch (err) {
          alert('Import failed: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    };

    // Custom ISO / Floppy image loader
    document.getElementById('custom-image-input').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        customImageBuffer = reader.result;
        backupModal.style.display = 'none';
        document.getElementById('boot-info').textContent = 'Boot source: ' + file.name;
        showToast('Booting ' + file.name + '...');
        initEmulator(false);
      };
      reader.readAsArrayBuffer(file);
    };

    // Cycles count update
    setInterval(() => {
      if (emulator && isRunning) {
        try {
          const count = emulator.get_instruction_counter();
          if (count > 0) {
            document.getElementById('cycles-info').textContent = 'Cycles: ' + (count / 1000000).toFixed(1) + 'M (x86 JIT)';
          }
        } catch (e) {}
      }
    }, 2000);

    // Auto-save every 60 seconds
    setInterval(() => {
      if (emulator && isRunning) handleSave(true);
    }, 60000);

    // Auto-save on page hide / unload
    window.addEventListener('beforeunload', () => {
      if (emulator && isRunning) {
        emulator.save_state().then(buf => saveSnapshot(buf)).catch(console.warn);
      }
    });

    // Start on load: check for existing IndexedDB session
    window.addEventListener('DOMContentLoaded', async () => {
      const existing = await loadSnapshot();
      if (existing && existing.state) {
        document.getElementById('idb-size').textContent = formatBytes(existing.sizeBytes);
        initEmulator(true);
      } else {
        document.getElementById('idb-size').textContent = 'Cold boot';
        initEmulator(false);
      }
    });
  </script>
</body>
</html>
`;

  const outputPath = path.join(publicDir, 'kolibri-singlefile.html');
  fs.writeFileSync(outputPath, htmlContent, 'utf-8');
  const finalSize = fs.statSync(outputPath).size;

  console.log(`Successfully generated ${outputPath}`);
  console.log(`Single-file HTML size: ${(finalSize / 1024 / 1024).toFixed(2)} MB (${finalSize} bytes)`);
  console.log('--- Done ---');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
