# KolibriOS Web x86 Emulator

[![KolibriOS Web Emulator](https://img.shields.io/badge/KolibriOS-WebAssembly-blue.svg)](https://kolibrios.org)
[![v86 Emulator](https://img.shields.io/badge/Emulator-v86-green.svg)](https://github.com/copy/v86)
[![Status](https://img.shields.io/badge/Status-Production%20Ready-success.svg)]()

A high-performance in-browser x86 PC emulator running **KolibriOS** (and other x86-compatible operating systems) entirely client-side using WebAssembly and the `v86` emulator engine.

---

## 🚀 What is this and what is it for?

### 1. Project Overview
This project is a fully featured, client-side x86 virtualization environment running directly inside your web browser. No plugins, complex VM installations (like VirtualBox or VMware), or local hypervisors are required.

It boots **KolibriOS**—an extraordinarily fast, lightweight 32-bit preemptive multitasking operating system written entirely in FASM assembly language. KolibriOS boots in seconds and demonstrates remarkable performance and responsiveness directly in web browsers.

### 2. Key Features & Capabilities
* ⚡ **Instant In-Browser Boot**: Runs entirely client-side via WebAssembly (`v86`), leveraging modern browser performance.
* 💾 **Persistent Storage (IndexedDB)**: Automatically saves virtual hard disk changes and machine state to browser IndexedDB storage so your work is never lost on refresh.
* 📥 **State Export & Import**: Easily download machine state snapshots (`.bin`) to your local machine or restore them anytime, with options for clean cold boots.
* 🎛 **Display & Mouse Controls**:
  * Flexible screen scaling (`Fit`, `1x`, `1.5x`, `2x`).
  * Fullscreen display mode.
  * Mouse capture / Pointer Lock support for precise OS interaction.
  * Audio toggle (PC Speaker / Sound Blaster emulation).
* ⚙️ **Advanced Boot Options**:
  * Switch between live CD images (`/kolibri.img`), custom ISO/img URLs, or restored states.
  * Configurable auto-save intervals.
  * Live instruction counter and system metrics monitoring.
* 📦 **Offline Capable**: Fully self-contained assets ready for offline usage once cached.

---

## 🛠 Tech Stack

* **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons.
* **Emulator Engine**: `v86` (WebAssembly x86 virtualization).
* **Persistence**: IndexedDB (client-side virtual disk and state storage).
* **Build Tooling & Server**: Vite, Express (`server.ts`).

---

## 📂 Project Structure

```text
├── .cache_assets/          # Cached v86 binary assets (BIOS, WASM)
├── public/
│   ├── kolibri.img         # KolibriOS bootable floppy/disk image
│   ├── kolibri-singlefile.html # Single-file standalone build template
│   ├── libv86.js           # v86 client library
│   ├── seabios.bin         # SeaBIOS ROM
│   ├── v86.wasm            # v86 WebAssembly runtime core
│   └── vgabios.bin         # VGA BIOS ROM
├── scripts/
│   └── build-singlefile.js # Script to bundle into a single standalone HTML file
├── server.ts               # Express development server
├── src/
│   ├── App.tsx             # Main React UI and emulator controller
│   ├── index.css           # Tailwind CSS styling
│   ├── main.tsx            # Application entry point
│   ├── services/
│   │   └── storage.ts      # IndexedDB persistence and preference management
│   └── types/
│       └── v86.d.ts        # TypeScript definitions for v86
└── package.json            # Dependencies and npm scripts
```

---

## 🚀 Getting Started Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run the development server**:
   ```bash
   npm run dev
   ```

3. **Build for production**:
   ```bash
   npm run build
   ```

---

## 🎯 Use Cases
* **Education & Demonstrations**: Showcase WebAssembly, low-level OS architecture, and x86 virtualization interactively in any modern browser.
* **Retro Computing & Enthusiasts**: Instantly explore KolibriOS, test assembly applications, and enjoy lightning-fast legacy x86 environments without configuration hassle.
* **Web-based Sandbox**: Safe, sandboxed operating system environment running entirely client-side.
