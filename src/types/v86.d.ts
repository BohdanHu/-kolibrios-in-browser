/**
 * Type declarations for the v86 x86-in-WebAssembly emulator.
 */

export interface V86Options {
  wasm_path: string;
  memory_size?: number;
  vga_memory_size?: number;
  screen_container: HTMLElement | null;
  bios: {
    url?: string;
    buffer?: ArrayBuffer;
  };
  vga_bios: {
    url?: string;
    buffer?: ArrayBuffer;
  };
  cdrom?: {
    url?: string;
    buffer?: ArrayBuffer;
    async?: boolean;
    size?: number;
  };
  fda?: {
    url?: string;
    buffer?: ArrayBuffer;
    async?: boolean;
    size?: number;
  };
  fdb?: {
    url?: string;
    buffer?: ArrayBuffer;
  };
  hda?: {
    url?: string;
    buffer?: ArrayBuffer;
    size?: number;
    async?: boolean;
  };
  initial_state?: {
    url?: string;
    buffer?: ArrayBuffer;
  };
  autostart?: boolean;
  preserve_mac_from_state?: boolean;
  acpi?: boolean;
  mac_address_translation?: boolean;
}

export interface V86Instance {
  run(): void;
  stop(): void;
  restart(): void;
  destroy(): void;
  save_state(): Promise<ArrayBuffer>;
  restore_state(state: ArrayBuffer): Promise<void>;
  is_running(): boolean;
  screen_go_fullscreen(): void;
  screen_set_scale(scaleX: number, scaleY: number): void;
  screen_make_screenshot(): HTMLImageElement;
  lock_mouse(): void;
  mouse_set_status(enabled: boolean): void;
  keyboard_set_status(enabled: boolean): void;
  get_instruction_counter(): number;
  add_listener(event: string, callback: (...args: any[]) => void): void;
  remove_listener(event: string, callback: (...args: any[]) => void): void;
}

export interface V86Constructor {
  new (options: V86Options): V86Instance;
}

declare global {
  interface Window {
    V86?: V86Constructor;
    V86Starter?: V86Constructor;
  }
}
