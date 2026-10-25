/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Save,
  Database,
  HardDrive,
  Maximize2,
  Minimize2,
  MousePointer,
  Download,
  Upload,
  Info,
  CheckCircle2,
  AlertTriangle,
  Monitor,
  Cpu,
  Clock,
  Sparkles,
  RefreshCw,
  FileText,
  X,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  saveSessionToIndexedDB,
  loadSessionFromIndexedDB,
  clearIndexedDBStorage,
  getStorageStats,
  formatBytes,
  loadUserPreferences,
  saveUserPreferences,
  UserPreferences,
} from './services/storage';
import { V86Instance } from './types/v86';

type EmulatorStatus = 'uninitialized' | 'checking_storage' | 'restoring_state' | 'loading_iso' | 'running' | 'paused' | 'saving' | 'error';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const emulatorRef = useRef<V86Instance | null>(null);

  // System and emulator states
  const [status, setStatus] = useState<EmulatorStatus>('checking_storage');
  const [statusMessage, setStatusMessage] = useState('Initializing emulator environment...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMouseLocked, setIsMouseLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [screenScale, setScreenScale] = useState<'fit' | '1x' | '1.5x' | '2x'>('fit');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // IndexedDB persistence states
  const [idbConnected, setIdbConnected] = useState(false);
  const [hasSavedState, setHasSavedState] = useState(false);
  const [savedSizeBytes, setSavedSizeBytes] = useState(0);
  const [lastSavedTime, setLastSavedTime] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Boot configuration & preferences
  const [bootSource, setBootSource] = useState<'restored_state' | 'iso_livecd' | 'custom_url'>('iso_livecd');
  const [isoUrl, setIsoUrl] = useState('/kolibri.img');
  const [isDownloadingOffline, setIsDownloadingOffline] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [instructionsCount, setInstructionsCount] = useState(0);

  // Load preferences and check IndexedDB stats
  useEffect(() => {
    async function initCheck() {
      try {
        const prefs = await loadUserPreferences();
        setAutoSaveEnabled(prefs.autoSaveEnabled);
        setScreenScale(prefs.displayScale);
        setSoundEnabled(prefs.soundEnabled);
        if (prefs.customIsoUrl && prefs.customIsoUrl !== '/kolibri.iso') {
          setIsoUrl(prefs.customIsoUrl);
        } else {
          setIsoUrl('/kolibri.img');
        }

        const stats = await getStorageStats();
        setIdbConnected(stats.connected);
        setHasSavedState(stats.hasSavedSession);
        setSavedSizeBytes(stats.sizeBytes);
        setLastSavedTime(stats.timestamp);

        // Start emulator once container and scripts are ready
        startEmulator(stats.hasSavedSession);
      } catch (err: any) {
        console.error('Initialization error:', err);
        startEmulator(false);
      }
    }

    initCheck();

    return () => {
      if (emulatorRef.current) {
        try {
          emulatorRef.current.destroy();
        } catch (e) {
          console.warn('Error destroying emulator:', e);
        }
      }
    };
  }, []);

  // Update instruction counter every 2 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (emulatorRef.current && status === 'running') {
        try {
          const count = emulatorRef.current.get_instruction_counter();
          if (count > 0) {
            setInstructionsCount(count);
          }
        } catch {
          // ignore
        }
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [status]);

  // Auto-save session periodically if enabled
  useEffect(() => {
    if (!autoSaveEnabled || status !== 'running') return;

    const interval = setInterval(async () => {
      if (emulatorRef.current && status === 'running' && !isSaving) {
        console.log('[KolibriOS] Auto-saving virtual hard drive & machine state to IndexedDB...');
        await handleSaveState(true);
      }
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [autoSaveEnabled, status, isSaving]);

  // Auto-save on page hide / unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (emulatorRef.current && status === 'running' && autoSaveEnabled) {
        // Trigger non-blocking save
        emulatorRef.current.save_state().then((buf) => {
          saveSessionToIndexedDB(buf, 'Auto-save on tab close').catch(console.error);
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [status, autoSaveEnabled]);

  // Pointer lock change detection
  useEffect(() => {
    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement !== null;
      setIsMouseLocked(locked);
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, []);

  // Start or restart the v86 emulator
  const startEmulator = async (restoreFromSaved: boolean) => {
    if (!containerRef.current) return;

    // Clean up any existing emulator instance
    if (emulatorRef.current) {
      try {
        emulatorRef.current.destroy();
        emulatorRef.current = null;
      } catch (e) {
        console.warn('Destroy error:', e);
      }
    }

    // Ensure v86 is available
    const V86 = (window as any).V86 || (window as any).V86Starter || (globalThis as any).V86;
    if (!V86) {
      setStatus('error');
      setErrorMessage('v86 WebAssembly emulator library failed to load. Please refresh the page.');
      return;
    }

    // Clear previous screen elements in container
    containerRef.current.innerHTML = `
      <div style="white-space: pre; font: 14px monospace; line-height: 14px;"></div>
      <canvas></canvas>
    `;

    try {
      let savedBuffer: ArrayBuffer | null = null;

      if (restoreFromSaved) {
        setStatus('restoring_state');
        setStatusMessage('Loading saved state and virtual hard drive from IndexedDB...');
        try {
          const record = await loadSessionFromIndexedDB();
          if (record && record.state) {
            savedBuffer = record.state;
            setBootSource('restored_state');
            setSavedSizeBytes(record.sizeBytes);
            setLastSavedTime(record.timestamp);
          } else {
            console.warn('Saved session not found in IndexedDB, falling back to clean boot.');
            restoreFromSaved = false;
          }
        } catch (dbErr) {
          console.warn('Failed to load session from IndexedDB, clearing and falling back to clean boot:', dbErr);
          try {
            await clearIndexedDBStorage();
          } catch {}
          restoreFromSaved = false;
        }
      }

      if (!restoreFromSaved) {
        setStatus('loading_iso');
        setStatusMessage('Loading KolibriOS system files...');
        setBootSource(isoUrl === '/kolibri.img' ? 'iso_livecd' : 'custom_url');
      }

      const baseUrl = import.meta.env.BASE_URL || './';
      const resolveUrl = (u: string) => {
        if (!u) return baseUrl;
        if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('blob:')) return u;
        const clean = u.startsWith('/') ? u.slice(1) : u;
        return baseUrl.endsWith('/') ? baseUrl + clean : baseUrl + '/' + clean;
      };

      // Preload binaries into memory ArrayBuffers to guarantee instant zero-range-abort startup
      const [wasmRes, biosRes, vgaBiosRes, mediaRes] = await Promise.all([
        fetch(resolveUrl('v86.wasm')),
        fetch(resolveUrl('seabios.bin')),
        fetch(resolveUrl('vgabios.bin')),
        fetch(resolveUrl(isoUrl)),
      ]);

      if (!wasmRes.ok || !biosRes.ok || !vgaBiosRes.ok || !mediaRes.ok) {
        throw new Error('Failed to load emulator core binaries or OS image.');
      }

      const [wasmBuf, biosBuf, vgaBiosBuf, mediaBuf] = await Promise.all([
        wasmRes.arrayBuffer(),
        biosRes.arrayBuffer(),
        vgaBiosRes.arrayBuffer(),
        mediaRes.arrayBuffer(),
      ]);

      const isFloppy = isoUrl.endsWith('.img') || isoUrl.endsWith('.bin');
      const virtualHda = new ArrayBuffer(16 * 1024 * 1024); // 16MB persistent virtual disk

      // Configure v86 options with 100% in-memory buffers
      const options: any = {
        wasm_fn: async (param: any) => {
          const { instance } = await WebAssembly.instantiate(wasmBuf, param);
          return instance.exports;
        },
        wasm_path: resolveUrl('v86.wasm'),
        memory_size: 64 * 1024 * 1024, // 64MB RAM
        vga_memory_size: 8 * 1024 * 1024,
        screen_container: containerRef.current,
        bios: {
          buffer: biosBuf,
        },
        vga_bios: {
          buffer: vgaBiosBuf,
        },
        autostart: true,
      };

      if (isFloppy) {
        options.fda = {
          buffer: mediaBuf,
        };
      } else {
        options.cdrom = {
          buffer: mediaBuf,
        };
      }

      // If restoring from state snapshot
      if (savedBuffer) {
        options.initial_state = {
          buffer: savedBuffer,
        };
      } else {
        // On clean boot, include virtual hda for file saves
        options.hda = {
          buffer: virtualHda,
        };
      }

      let emulator: any;
      try {
        emulator = new V86(options);
      } catch (stateErr) {
        if (savedBuffer) {
          console.warn('[KolibriOS] Saved state snapshot incompatible or corrupted, clearing IndexedDB and falling back to clean boot...', stateErr);
          await clearIndexedDBStorage();
          setHasSavedState(false);
          setSavedSizeBytes(0);
          return startEmulator(false);
        } else {
          throw stateErr;
        }
      }
      emulatorRef.current = emulator;

      // Event listeners
      const onStarted = () => {
        setStatus('running');
        setStatusMessage('KolibriOS is running');
        setIdbConnected(true);
      };

      emulator.add_listener('emulator-ready', onStarted);
      emulator.add_listener('emulator-started', onStarted);
      emulator.add_listener('screen-set-size', onStarted);

      emulator.add_listener('emulator-stopped', () => {
        setStatus((prev) => (prev === 'running' ? 'paused' : prev));
      });

      // Handle download errors
      emulator.add_listener('download-error', (e: any) => {
        console.error('Download error:', e);
        setStatus('error');
        setErrorMessage(
          `Failed to load media image: ${e?.url || isoUrl}.`
        );
      });
    } catch (err: any) {
      console.error('Failed to start v86:', err);
      setStatus('error');
      setErrorMessage(err?.message || 'Unexpected error while launching v86 WebAssembly emulator.');
    }
  };

  // Save current state snapshot and virtual hard drive to IndexedDB
  const handleSaveState = async (isAuto = false) => {
    if (!emulatorRef.current || isSaving) return;

    try {
      setIsSaving(true);
      if (!isAuto) {
        setStatusMessage('Serializing machine state and hard drive to IndexedDB...');
      }

      const stateBuffer = await emulatorRef.current.save_state();
      const meta = await saveSessionToIndexedDB(
        stateBuffer,
        isAuto ? 'Automatic Background Save' : 'Manual User Save'
      );

      setHasSavedState(true);
      setSavedSizeBytes(meta.sizeBytes);
      setLastSavedTime(meta.timestamp);
      setIdbConnected(true);

      const formatted = formatBytes(meta.sizeBytes);
      const timeStr = new Date(meta.timestamp).toLocaleTimeString();
      setSaveSuccessNotice(
        isAuto ? `Auto-saved (${formatted} at ${timeStr})` : `Saved ${formatted} to IndexedDB at ${timeStr}`
      );

      setTimeout(() => {
        setSaveSuccessNotice(null);
      }, 4000);
    } catch (err: any) {
      console.error('Save state failed:', err);
      alert('Failed to save to IndexedDB: ' + (err?.message || String(err)));
    } finally {
      setIsSaving(false);
      if (!isAuto && status !== 'error') {
        setStatus('running');
        setStatusMessage('KolibriOS is running');
      }
    }
  };

  // Reset / Clear IndexedDB storage and Cold Boot
  const handleColdBootReset = async () => {
    setShowResetModal(false);
    try {
      setStatus('checking_storage');
      setStatusMessage('Clearing local IndexedDB storage for cold boot...');
      await clearIndexedDBStorage();

      setHasSavedState(false);
      setSavedSizeBytes(0);
      setLastSavedTime(null);
      setBootSource('iso_livecd');

      // Start fresh boot from ISO
      await startEmulator(false);
    } catch (err: any) {
      console.error('Reset error:', err);
      alert('Failed to reset storage: ' + (err?.message || String(err)));
    }
  };

  // Toggle Pause / Resume
  const handleTogglePause = () => {
    if (!emulatorRef.current) return;
    try {
      if (status === 'running') {
        emulatorRef.current.stop();
        setStatus('paused');
        setStatusMessage('Emulator paused');
      } else if (status === 'paused') {
        emulatorRef.current.run();
        setStatus('running');
        setStatusMessage('KolibriOS is running');
      }
    } catch (e) {
      console.warn('Pause toggle error:', e);
    }
  };

  // Capture / Lock Mouse
  const handleLockMouse = () => {
    if (!emulatorRef.current || !containerRef.current) return;
    try {
      emulatorRef.current.lock_mouse();
    } catch {
      // Fallback to standard requestPointerLock
      const canvas = containerRef.current.querySelector('canvas');
      if (canvas) {
        canvas.requestPointerLock();
      }
    }
  };

  // Release Mouse Pointer
  const handleUnlockMouse = () => {
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
  };

  // Fullscreen toggle
  const handleToggleFullscreen = () => {
    const el = document.getElementById('emulator-frame');
    if (!el) return;

    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.warn);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.warn);
    }
  };

  // Export saved state to a .bin file for local backup
  const handleExportStateFile = async () => {
    try {
      let buffer: ArrayBuffer | null = null;
      if (emulatorRef.current && status === 'running') {
        buffer = await emulatorRef.current.save_state();
      } else {
        const record = await loadSessionFromIndexedDB();
        buffer = record?.state || null;
      }

      if (!buffer) {
        alert('No saved state found to export. Try running KolibriOS and saving state first.');
        return;
      }

      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kolibrios-v86-state-${new Date().toISOString().slice(0, 10)}.bin`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Export failed: ' + e.message);
    }
  };

  // Import state from a local .bin file into IndexedDB and boot from it
  const handleImportStateFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        setStatusMessage('Importing state into IndexedDB...');
        const meta = await saveSessionToIndexedDB(buffer, `Imported from ${file.name}`);
        setHasSavedState(true);
        setSavedSizeBytes(meta.sizeBytes);
        setLastSavedTime(meta.timestamp);
        setShowConfigModal(false);
        // Reboot with imported state
        startEmulator(true);
      } catch (err: any) {
        alert('Failed to import state file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Download 100% Standalone Offline Single-File HTML
  const handleDownloadOfflineHtml = async () => {
    try {
      setIsDownloadingOffline(true);
      const res = await fetch('/kolibri-singlefile.html');
      if (!res.ok) throw new Error('Offline file not found on server');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kolibri-singlefile.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSaveSuccessNotice('Downloaded standalone kolibri-singlefile.html!');
      setTimeout(() => setSaveSuccessNotice(null), 4000);
    } catch (err: any) {
      console.warn('Direct fetch download error, using fallback link:', err);
      const a = document.createElement('a');
      a.href = '/kolibri-singlefile.html';
      a.download = 'kolibri-singlefile.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setIsDownloadingOffline(false);
    }
  };

  // Change scale mode
  const handleScaleChange = (scale: 'fit' | '1x' | '1.5x' | '2x') => {
    setScreenScale(scale);
    const prefs: UserPreferences = {
      autoSaveEnabled,
      autoSaveIntervalSec: 60,
      displayScale: scale,
      soundEnabled,
      bootMedia: 'iso',
      customIsoUrl: isoUrl,
    };
    saveUserPreferences(prefs);
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Navigation & Control Bar */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/95 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-6 py-2.5 transition-colors">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Logo & System Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-600 via-sky-500 to-teal-400 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-zinc-900 rounded-[7px] flex items-center justify-center">
                <span className="text-sky-400 font-black text-sm tracking-tighter">K-OS</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm sm:text-base tracking-tight text-white flex items-center gap-1.5">
                  KolibriOS
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 uppercase">
                    v86 x86 WASM
                  </span>
                </h1>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block">
                Lightweight Assembly OS • Persistent Virtual Storage in IndexedDB
              </p>
            </div>
          </div>

          {/* Center Status Indicators */}
          <div className="flex items-center gap-2.5">
            {/* System Engine Status */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/50 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  status === 'running'
                    ? 'bg-emerald-400 animate-pulse'
                    : status === 'paused'
                    ? 'bg-amber-400'
                    : status === 'error'
                    ? 'bg-rose-500'
                    : 'bg-sky-400 animate-ping'
                }`}
              />
              <span className="capitalize text-zinc-300 font-medium text-[11px]">
                {status === 'running'
                  ? 'System Running'
                  : status === 'paused'
                  ? 'Paused'
                  : status === 'restoring_state'
                  ? 'Restoring Session...'
                  : status === 'loading_iso'
                  ? 'Booting ISO...'
                  : status === 'saving'
                  ? 'Writing Disk...'
                  : status === 'error'
                  ? 'Error'
                  : 'Starting...'}
              </span>
            </div>

            {/* IndexedDB Storage Indicator */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                idbConnected
                  ? hasSavedState
                    ? 'bg-indigo-950/60 border-indigo-700/60 text-indigo-300'
                    : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-300'
                  : 'bg-rose-950/60 border-rose-800 text-rose-300'
              }`}
              title={
                hasSavedState
                  ? `IndexedDB active. Virtual drive state: ${formatBytes(savedSizeBytes)}`
                  : 'IndexedDB ready. State will persist upon saving.'
              }
            >
              <Database className="w-3 h-3 text-indigo-400" />
              <span>
                {hasSavedState ? `IndexedDB: ${formatBytes(savedSizeBytes)}` : 'IndexedDB: Connected'}
              </span>
              {hasSavedState && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
              )}
            </div>

            {/* Save Success Flash Toast */}
            {saveSuccessNotice && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/90 border border-emerald-600/80 text-emerald-300 text-[11px] animate-fade-in shadow-md">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>{saveSuccessNotice}</span>
              </div>
            )}
          </div>

          {/* Action Buttons: Download Offline HTML, Save & Reset/Cold Boot */}
          <div className="flex items-center gap-2">
            {/* Download Offline Single-File HTML Button */}
            <button
              onClick={handleDownloadOfflineHtml}
              disabled={isDownloadingOffline}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-950/40 active:scale-95 transition-all border border-emerald-500/30 cursor-pointer disabled:opacity-50"
              title="Download 100% standalone single-file HTML (runs offline without internet from local disk or USB)"
            >
              <Download className={`w-3.5 h-3.5 ${isDownloadingOffline ? 'animate-bounce' : 'text-emerald-200'}`} />
              <span>{isDownloadingOffline ? 'Downloading...' : 'Download Offline HTML'}</span>
              <span className="hidden lg:inline text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/20">
                100% Offline
              </span>
            </button>

            {/* Manual Save Button */}
            <button
              onClick={() => handleSaveState(false)}
              disabled={status !== 'running' || isSaving}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all ${
                status === 'running' && !isSaving
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95 shadow-indigo-600/20 hover:shadow-indigo-500/30'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/40'
              }`}
              title="Save current memory, desktop state, and virtual hard drive changes to IndexedDB"
            >
              <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{isSaving ? 'Saving...' : 'Save to IndexedDB'}</span>
            </button>

            {/* Reset / Cold Boot Button */}
            <button
              onClick={() => setShowResetModal(true)}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-800/90 hover:bg-rose-950/80 hover:text-rose-200 hover:border-rose-700/60 border border-zinc-700/70 transition-all active:scale-95"
              title="Clear stored data from IndexedDB and start a fresh cold boot from the ISO"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset / Cold Boot</span>
              <span className="sm:hidden">Reset</span>
            </button>

            {/* Info & Guide Button */}
            <button
              onClick={() => setShowInfoModal(true)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 transition-colors"
              title="KolibriOS Information and shortcuts"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Emulator Viewport Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
        <div
          id="emulator-frame"
          className={`w-full max-w-5xl rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-2xl flex flex-col overflow-hidden relative transition-all ${
            isFullscreen ? 'fixed inset-0 z-50 rounded-none max-w-none border-none' : ''
          }`}
        >
          {/* Quick Emulator Bar above screen */}
          <div className="bg-zinc-900 px-3 py-2 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
            {/* Left Controls: Pause/Resume, Mouse lock */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleTogglePause}
                disabled={status !== 'running' && status !== 'paused'}
                className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors disabled:opacity-40"
                title={status === 'running' ? 'Pause emulation' : 'Resume emulation'}
              >
                {status === 'running' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={isMouseLocked ? handleUnlockMouse : handleLockMouse}
                disabled={status !== 'running'}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                  isMouseLocked
                    ? 'bg-amber-950/80 border-amber-600/70 text-amber-300'
                    : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700/60 text-zinc-300'
                }`}
                title={isMouseLocked ? 'Click to release mouse (or press ESC)' : 'Capture mouse pointer inside KolibriOS'}
              >
                <MousePointer className="w-3 h-3" />
                <span>{isMouseLocked ? 'Mouse Captured (ESC to release)' : 'Capture Mouse'}</span>
              </button>

              {/* Sound Toggle (AC97 emulation) */}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                title={soundEnabled ? 'Mute AC97 sound' : 'Unmute sound'}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Center: Boot Source Label */}
            <div className="hidden md:flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-sky-400" />
                Boot:
                <strong className="text-zinc-200 font-mono">
                  {bootSource === 'restored_state'
                    ? 'IndexedDB Saved State'
                    : bootSource === 'iso_livecd'
                    ? 'Official KolibriOS ISO'
                    : 'Custom Image'}
                </strong>
              </span>
              <span className="text-zinc-600">•</span>
              <span>Virtual HDD: 32MB IDE (/hd0/)</span>
            </div>

            {/* Right Controls: Scale, Fullscreen, Backup */}
            <div className="flex items-center gap-1.5">
              {/* Display scale toggle */}
              <div className="flex items-center bg-zinc-800 rounded p-0.5 border border-zinc-700/60 text-[11px]">
                {(['fit', '1x', '1.5x'] as const).map((sc) => (
                  <button
                    key={sc}
                    onClick={() => handleScaleChange(sc)}
                    className={`px-1.5 py-0.5 rounded uppercase font-mono ${
                      screenScale === sc
                        ? 'bg-zinc-700 text-white font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    title={`Display scale: ${sc}`}
                  >
                    {sc}
                  </button>
                ))}
              </div>

              {/* Advanced configuration / backup modal */}
              <button
                onClick={() => setShowConfigModal(true)}
                className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                title="Storage and ISO backup settings"
              >
                <HardDrive className="w-3.5 h-3.5" />
              </button>

              {/* Fullscreen Button */}
              <button
                onClick={handleToggleFullscreen}
                className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Screen Container */}
          <div
            className={`relative w-full bg-black flex items-center justify-center cursor-crosshair overflow-hidden ${
              isFullscreen ? 'flex-1' : 'min-h-[380px] sm:min-h-[480px] max-h-[720px]'
            }`}
            onClick={() => {
              if (emulatorRef.current) {
                try {
                  emulatorRef.current.run();
                  setStatus('running');
                  setStatusMessage('KolibriOS is running');
                } catch (e) {
                  console.warn('Resume error:', e);
                }
              }
            }}
          >
            {/* The Actual v86 Container where canvas/div are inserted */}
            <div
              id="screen_container"
              ref={containerRef}
              className={`flex items-center justify-center max-w-full max-h-full ${
                screenScale === 'fit'
                  ? 'scale-fit'
                  : screenScale === '1x'
                  ? 'scale-1x'
                  : 'scale-150'
              }`}
            >
              {/* Inner elements required by v86 library */}
              <div style={{ whiteSpace: 'pre', font: '14px monospace', lineHeight: '14px', display: 'none' }}></div>
              <canvas style={{ display: 'none' }}></canvas>
            </div>

            {/* Overlay during loading or restoring */}
            {(status === 'checking_storage' ||
              status === 'restoring_state' ||
              status === 'loading_iso' ||
              status === 'uninitialized') && (
              <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                <div className="w-16 h-16 rounded-2xl bg-indigo-900/30 border border-indigo-500/30 flex items-center justify-center mb-4 shadow-xl shadow-indigo-950">
                  <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2 tracking-tight">
                  {status === 'restoring_state'
                    ? 'Restoring Session from IndexedDB'
                    : 'Launching KolibriOS in Browser'}
                </h3>
                <p className="text-sm text-zinc-400 max-w-md mb-6 leading-relaxed">
                  {statusMessage}
                </p>

                <div className="flex flex-col gap-2 w-full max-w-xs text-xs text-zinc-400 bg-zinc-900/80 p-3 rounded-lg border border-zinc-800">
                  <div className="flex justify-between">
                    <span>Virtual Machine:</span>
                    <span className="text-zinc-200 font-mono">v86 WebAssembly JIT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Target Architecture:</span>
                    <span className="text-zinc-200 font-mono">x86 (i586)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Persistent Storage:</span>
                    <span className="text-indigo-400 font-mono">IndexedDB Drive</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Media:</span>
                    <span className="text-emerald-400 font-mono">
                      {status === 'restoring_state' ? 'Snapshot.bin' : (isoUrl.split('/').pop() || 'kolibri.img')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Error Overlay */}
            {status === 'error' && (
              <div className="absolute inset-0 bg-zinc-950/95 flex flex-col items-center justify-center p-6 text-center z-20">
                <div className="w-14 h-14 rounded-xl bg-rose-950/60 border border-rose-700/60 flex items-center justify-center mb-4 text-rose-400">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-rose-300 mb-2">Emulation Boot Error</h3>
                <p className="text-sm text-zinc-400 max-w-md mb-5 leading-relaxed">
                  {errorMessage || 'Unable to boot the KolibriOS virtual machine.'}
                </p>
                <div className="flex flex-wrap gap-2.5 justify-center">
                  <button
                    onClick={() => {
                      setIsoUrl('/kolibri.img');
                      startEmulator(false);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-indigo-900/30 transition-all flex items-center gap-1.5"
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    Boot with Floppy Image (1.44 MB)
                  </button>
                  <button
                    onClick={() => startEmulator(false)}
                    className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium border border-zinc-700 transition-all"
                  >
                    Retry ISO
                  </button>
                  <button
                    onClick={() => setShowConfigModal(true)}
                    className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium border border-zinc-700 transition-all"
                  >
                    Configure URL
                  </button>
                </div>
              </div>
            )}

            {/* Floating Mouse Capture Chip indicator */}
            {status === 'running' && !isMouseLocked && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-700/70 text-[11px] text-zinc-300 backdrop-blur-md shadow-lg pointer-events-none flex items-center gap-1.5">
                <MousePointer className="w-3.5 h-3.5 text-sky-400 animate-bounce" />
                <span>Click canvas to capture mouse</span>
              </div>
            )}
          </div>

          {/* Bottom Diagnostics / Status Bar */}
          <div className="bg-zinc-900/95 px-3 py-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-[11px] text-zinc-400">
            {/* Storage Info */}
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-zinc-300">
                <Database className="w-3.5 h-3.5 text-indigo-400" />
                <span>Storage:</span>
                <strong className="text-zinc-100 font-mono">
                  {hasSavedState ? formatBytes(savedSizeBytes) : 'Empty (Cold state)'}
                </strong>
              </span>

              {lastSavedTime && (
                <span className="hidden sm:flex items-center gap-1 text-zinc-400">
                  <Clock className="w-3 h-3 text-zinc-500" />
                  <span>Saved: {new Date(lastSavedTime).toLocaleTimeString()}</span>
                </span>
              )}
            </div>

            {/* Instruction / CPU count */}
            <div className="hidden md:flex items-center gap-3 font-mono text-[10px] text-zinc-400">
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-sky-400" />
                Cycles: {(instructionsCount / 1_000_000).toFixed(1)}M
              </span>
              <span>•</span>
              <span className="text-emerald-400">JIT WebAssembly Active</span>
            </div>

            {/* Auto-save switch */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="autosave-toggle"
                className="flex items-center gap-1.5 cursor-pointer select-none text-[11px]"
              >
                <span>Auto-save:</span>
                <input
                  id="autosave-toggle"
                  type="checkbox"
                  checked={autoSaveEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setAutoSaveEnabled(next);
                    saveUserPreferences({
                      autoSaveEnabled: next,
                      autoSaveIntervalSec: 60,
                      displayScale: screenScale,
                      soundEnabled,
                      bootMedia: 'iso',
                      customIsoUrl: isoUrl,
                    });
                  }}
                  className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span className={autoSaveEnabled ? 'text-indigo-400 font-medium' : 'text-zinc-500'}>
                  {autoSaveEnabled ? 'Every 60s' : 'Off'}
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Quick Tips / KolibriOS Feature highlights */}
        <div className="w-full max-w-5xl mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 flex items-start gap-2.5">
            <div className="p-2 rounded bg-indigo-950/50 text-indigo-400 shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-semibold text-zinc-200 mb-0.5">Persistent Storage</h4>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Click <strong>"Save to IndexedDB"</strong> anytime. All open windows, created files, and virtual drive state are stored locally and reloaded on page refresh.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-600/30 flex items-start gap-2.5">
            <div className="p-2 rounded bg-emerald-950/60 text-emerald-400 shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <h4 className="font-semibold text-emerald-300">100% Offline File</h4>
                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  USB-Ready
                </span>
              </div>
              <p className="text-zinc-400 text-[11px] leading-relaxed mb-2">
                All engine files, WebAssembly, BIOS, and OS floppy image embedded. Zero network calls.
              </p>
              <button
                onClick={handleDownloadOfflineHtml}
                disabled={isDownloadingOffline}
                className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 underline underline-offset-2 cursor-pointer"
              >
                <span>Download HTML (5 MB)</span>
                <span>→</span>
              </button>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 flex items-start gap-2.5">
            <div className="p-2 rounded bg-sky-950/50 text-sky-400 shrink-0">
              <MousePointer className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-semibold text-zinc-200 mb-0.5">Mouse & Keyboard</h4>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Click anywhere on the screen to capture mouse for smooth desktop navigation. Press <strong>ESC</strong> on your keyboard to release pointer anytime.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 flex items-start gap-2.5">
            <div className="p-2 rounded bg-indigo-950/50 text-indigo-400 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-semibold text-zinc-200 mb-0.5">Bundled Apps</h4>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Includes <strong>Eolite file manager</strong>, <strong>Tinypad editor</strong>, paint, and over 30 games (Minesweeper, Kosilka, Gomoku, Doom 3D demo).
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Reset / Cold Boot Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <div className="p-2 bg-rose-950/50 border border-rose-800/60 rounded-lg">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Reset & Cold Boot</h3>
            </div>
            <p className="text-sm text-zinc-300 mb-4 leading-relaxed">
              This will clear your stored KolibriOS snapshot and virtual disk from browser IndexedDB, then restart the emulator cleanly from the official ISO image.
            </p>
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-400 mb-5 font-mono">
              <div>Database: kolibri_v86_db</div>
              <div>Current saved state: {formatBytes(savedSizeBytes)}</div>
              <div>Action: DROP snapshot & Cold boot</div>
            </div>
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleColdBootReset}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30 transition-all"
              >
                Confirm Cold Boot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Storage and Backup Management Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
              <div className="flex items-center gap-2 text-indigo-400">
                <HardDrive className="w-5 h-5" />
                <h3 className="font-bold text-base text-white">Storage & Snapshot Backup</h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-zinc-500 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* IndexedDB Statistics */}
              <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                <div className="font-semibold text-zinc-200 flex items-center justify-between">
                  <span>IndexedDB Local Storage</span>
                  <span className={idbConnected ? 'text-emerald-400' : 'text-rose-400'}>
                    {idbConnected ? 'Active' : 'Offline'}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Stored State Size:</span>
                  <span className="text-zinc-200 font-mono">{formatBytes(savedSizeBytes)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Last Saved:</span>
                  <span className="text-zinc-200 font-mono">
                    {lastSavedTime ? new Date(lastSavedTime).toLocaleString() : 'Never'}
                  </span>
                </div>
              </div>

              {/* State Export / Import */}
              <div className="space-y-2">
                <h4 className="font-semibold text-zinc-200">File Backup / Restore</h4>
                <p className="text-zinc-400 text-[11px]">
                  Download your entire virtual machine state to your physical hard drive or upload an existing state snapshot.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={handleExportStateFile}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium border border-zinc-700 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-sky-400" />
                    <span>Export State (.bin)</span>
                  </button>

                  <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium border border-zinc-700 transition-colors cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Import State (.bin)</span>
                    <input
                      type="file"
                      accept=".bin"
                      onChange={handleImportStateFile}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* 100% Standalone Offline Single-File HTML */}
              <div className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-600/35 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>100% Standalone Offline Single-File</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 font-semibold">
                    5.0 MB Single File
                  </span>
                </div>
                <p className="text-zinc-300 text-[11px] leading-relaxed">
                  Entire v86 WebAssembly emulator, BIOS, VGABIOS, and KolibriOS OS floppy inlined into one standalone HTML file. Zero network requests, runs from USB or offline local disk. Virtual disk saving via IndexedDB works completely offline!
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleDownloadOfflineHtml}
                    disabled={isDownloadingOffline}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-950 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Download className={`w-3.5 h-3.5 ${isDownloadingOffline ? 'animate-bounce' : ''}`} />
                    <span>{isDownloadingOffline ? 'Downloading Single-File...' : 'Download Offline HTML'}</span>
                  </button>
                  <a
                    href="/kolibri-singlefile.html"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium border border-zinc-700 transition-colors flex items-center gap-1"
                    title="Open standalone offline single-file in new browser tab"
                  >
                    <span>Preview</span>
                  </a>
                </div>
              </div>

              {/* Custom ISO URL setting */}
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <h4 className="font-semibold text-zinc-200">Boot Disk / ISO Image</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={isoUrl}
                    onChange={(e) => setIsoUrl(e.target.value)}
                    placeholder="/kolibri.img or custom URL"
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => {
                      saveUserPreferences({
                        autoSaveEnabled,
                        autoSaveIntervalSec: 60,
                        displayScale: screenScale,
                        soundEnabled,
                        bootMedia: 'img',
                        customIsoUrl: isoUrl,
                      });
                      setShowConfigModal(false);
                      startEmulator(false);
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold"
                  >
                    Apply & Boot
                  </button>
                </div>
                <div className="flex gap-2 text-[10px] text-zinc-400 pt-1">
                  <button
                    onClick={() => setIsoUrl('/kolibri.img')}
                    className="hover:text-indigo-400 underline"
                  >
                    Preset: Official KolibriOS Image (1.44MB)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info & Help Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
              <div className="flex items-center gap-2 text-sky-400">
                <Info className="w-5 h-5" />
                <h3 className="font-bold text-base text-white">About KolibriOS & v86</h3>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="text-zinc-500 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-zinc-300 max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <h4 className="font-semibold text-white mb-1">What is KolibriOS?</h4>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  KolibriOS is an operating system written 100% in x86 assembly language (FASM). It boots in seconds, runs with only 12 MB of RAM, and includes a full graphical desktop, rich utilities, media players, and games.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-white mb-1">How Virtual Storage & IndexedDB Work</h4>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  The emulator creates a 32 MB virtual hard drive mapped to <code>/hd0/</code>. When you click <strong>Save to IndexedDB</strong>, the entire CPU state, memory, and virtual disk sectors are compressed and stored locally in your browser's IndexedDB. When you refresh or return later, your exact state is seamlessly restored!
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-white mb-1">Keyboard & Mouse Controls</h4>
                <ul className="list-disc pl-4 space-y-1 text-zinc-400 text-[11px]">
                  <li><strong>Capture Mouse:</strong> Click inside the canvas or click "Capture Mouse".</li>
                  <li><strong>Release Mouse:</strong> Press the <code>ESC</code> key anytime.</li>
                  <li><strong>Start Menu:</strong> Click the blue icon in the bottom-left corner of the KolibriOS desktop or right-click the desktop.</li>
                  <li><strong>File System:</strong> Open <em>Eolite</em> or <em>KFM</em> from the desktop to create, edit, or copy files.</li>
                </ul>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-emerald-600/30 text-[11px] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    100% Standalone Offline Single-File:
                  </span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/20">
                    Zero-Network
                  </span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  The entire operating system, v86 JIT emulator, WebAssembly runtime, and BIOS are embedded into <code>kolibri-singlefile.html</code>. You can copy it to a USB flash drive or offline laptop and boot instantly with full IndexedDB storage persistence.
                </p>
                <div className="pt-1 flex gap-2">
                  <button
                    onClick={handleDownloadOfflineHtml}
                    disabled={isDownloadingOffline}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-semibold text-[11px] flex items-center gap-1.5 shadow-sm"
                  >
                    <Download className="w-3 h-3" />
                    <span>{isDownloadingOffline ? 'Downloading...' : 'Download Offline HTML'}</span>
                  </button>
                  <a
                    href="/kolibri-singlefile.html"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md font-medium text-[11px] flex items-center gap-1 border border-zinc-700"
                  >
                    <span>Open in Tab</span>
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setShowInfoModal(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
