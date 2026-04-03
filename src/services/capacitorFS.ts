/**
 * Capacitor Filesystem Adapter
 * Used when running as a native app (Android via Capacitor).
 *
 * Lifecycle methods (requestAccess, tryRestore, disconnect, isReady, getRootName, cleanup)
 * mirror WebFSAdapter's interface so useFileSystem can switch between them seamlessly.
 *
 * On native, the vault path is stored in localStorage (no IndexedDB handles needed).
 * The user configures the path via Settings; requestAccess() is a no-op that returns
 * true if a path is already set (the actual path selection happens in the UI).
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import type { FSAdapter, DirEntry } from './vaultParser';

/** Capacitor global injected by the native shell. */
interface CapacitorGlobal {
  isNativePlatform(): boolean;
  convertFileSrc(uri: string): string;
}

/** Access the Capacitor global safely. */
function getCapacitorGlobal(): CapacitorGlobal | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).Capacitor as CapacitorGlobal | undefined;
}

const VAULT_PATH_KEY = 'libreader-native-vault-path';

export class CapacitorFSAdapter implements FSAdapter {
  private basePath: string = '';
  private ready: boolean = false;

  // --- Lifecycle methods (matching WebFSAdapter shape) ---

  /**
   * On native, requestAccess is called after the user sets a path via setVaultPath().
   * Returns true if the path exists and is accessible.
   */
  async requestAccess(): Promise<boolean> {
    const stored = localStorage.getItem(VAULT_PATH_KEY);
    if (!stored) return false;

    const accessible = await this.validatePath(stored);
    if (accessible) {
      this.basePath = stored;
      this.ready = true;
    }
    return accessible;
  }

  /**
   * Restore vault connection from persisted path on app restart.
   */
  async tryRestore(): Promise<boolean> {
    const stored = localStorage.getItem(VAULT_PATH_KEY);
    if (!stored) return false;

    const accessible = await this.validatePath(stored);
    if (accessible) {
      this.basePath = stored;
      this.ready = true;
      return true;
    }
    return false;
  }

  /**
   * Disconnect: clear the stored path and reset state.
   */
  async disconnect(): Promise<void> {
    this.basePath = '';
    this.ready = false;
    localStorage.removeItem(VAULT_PATH_KEY);
  }

  isReady(): boolean {
    return this.ready;
  }

  getRootName(): string {
    if (!this.basePath) return '';
    const parts = this.basePath.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }

  cleanup(): void {
    // No resources to clean up on native
  }

  /**
   * Set the vault path (called from UI). Stores in localStorage and validates.
   * Returns true if the path is valid and accessible.
   */
  async setVaultPath(path: string): Promise<boolean> {
    const trimmed = path.trim();
    if (!trimmed) return false;

    const accessible = await this.validatePath(trimmed);
    if (accessible) {
      localStorage.setItem(VAULT_PATH_KEY, trimmed);
      this.basePath = trimmed;
      this.ready = true;
    }
    return accessible;
  }

  /**
   * Get the currently configured vault path.
   */
  getVaultPath(): string {
    return this.basePath || localStorage.getItem(VAULT_PATH_KEY) || '';
  }

  // --- FSAdapter interface ---

  private resolvePath(path: string): string {
    if (path.startsWith('/')) return path;
    return `${this.basePath}/${path}`;
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const fullPath = this.resolvePath(path);
    const result = await Filesystem.readdir({
      path: fullPath,
      directory: Directory.External,
    });

    return result.files
      .filter((f) => !f.name.startsWith('.'))
      .map((f) => ({
        name: f.name,
        isDirectory: f.type === 'directory',
        path: path ? `${path}/${f.name}` : f.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async readFile(path: string): Promise<string> {
    const fullPath = this.resolvePath(path);
    const result = await Filesystem.readFile({
      path: fullPath,
      directory: Directory.External,
      encoding: Encoding.UTF8,
    });
    return result.data as string;
  }

  async readBinaryFile(path: string): Promise<ArrayBuffer> {
    const fullPath = this.resolvePath(path);
    const result = await Filesystem.readFile({
      path: fullPath,
      directory: Directory.External,
    });

    // Capacitor returns base64 for binary files
    const base64 = result.data as string;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async exists(path: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(path);
      await Filesystem.stat({
        path: fullPath,
        directory: Directory.External,
      });
      return true;
    } catch {
      return false;
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    await Filesystem.writeFile({
      path: fullPath,
      data: content,
      directory: Directory.External,
      encoding: Encoding.UTF8,
      recursive: true,
    });
  }

  async mkdir(path: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    await Filesystem.mkdir({
      path: fullPath,
      directory: Directory.External,
      recursive: true,
    });
  }

  async getFileUrl(path: string): Promise<string> {
    const fullPath = this.resolvePath(path);
    const result = await Filesystem.getUri({
      path: fullPath,
      directory: Directory.External,
    });
    // Convert to web-viewable URL
    const cap = getCapacitorGlobal();
    return cap ? cap.convertFileSrc(result.uri) : result.uri;
  }

  // --- Private helpers ---

  private async validatePath(path: string): Promise<boolean> {
    try {
      await Filesystem.readdir({
        path,
        directory: Directory.External,
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Detect if running inside Capacitor native shell.
 */
export function isCapacitorNative(): boolean {
  try {
    const cap = getCapacitorGlobal();
    return !!cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();
  } catch {
    return false;
  }
}
