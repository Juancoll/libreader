/**
 * Tauri Filesystem Adapter
 * Used when running as a native app (Linux desktop, Android via Tauri).
 *
 * Replaces the old CapacitorFSAdapter. Same FSAdapter interface so
 * useFileSystem can switch between WebFSAdapter and TauriFSAdapter seamlessly.
 *
 * On native, the vault path is stored in localStorage.
 */

import {
  readDir as tauriReadDir,
  readFile as tauriReadFile,
  readTextFile as tauriReadTextFile,
  writeFile as tauriWriteFile,
  writeTextFile as tauriWriteTextFile,
  mkdir as tauriMkdir,
  exists as tauriExists,
  stat as tauriStat,
} from '@tauri-apps/plugin-fs';
import type { FSAdapter, DirEntry } from './vaultParser';

const VAULT_PATH_KEY = 'libreader-native-vault-path';

export class TauriFSAdapter implements FSAdapter {
  private basePath: string = '';
  private ready: boolean = false;

  // --- Lifecycle methods (matching WebFSAdapter shape) ---

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
    // No resources to clean up
  }

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
    const entries = await tauriReadDir(fullPath);

    return entries
      .filter((e) => !e.name?.startsWith('.'))
      .map((e) => ({
        name: e.name || '',
        isDirectory: e.isDirectory,
        path: path ? `${path}/${e.name}` : (e.name || ''),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async readFile(path: string): Promise<string> {
    const fullPath = this.resolvePath(path);
    return tauriReadTextFile(fullPath);
  }

  async readBinaryFile(path: string): Promise<ArrayBuffer> {
    const fullPath = this.resolvePath(path);
    const data = await tauriReadFile(fullPath);
    return data.buffer as ArrayBuffer;
  }

  async exists(path: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(path);
      return await tauriExists(fullPath);
    } catch {
      return false;
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    // Ensure parent directory exists
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (parentDir) {
      try {
        await tauriMkdir(parentDir, { recursive: true });
      } catch {
        // Already exists
      }
    }
    await tauriWriteTextFile(fullPath, content);
  }

  async writeBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
    const fullPath = this.resolvePath(path);
    // Ensure parent directory exists
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (parentDir) {
      try {
        await tauriMkdir(parentDir, { recursive: true });
      } catch {
        // Already exists
      }
    }
    await tauriWriteFile(fullPath, new Uint8Array(data));
  }

  async mkdir(path: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    await tauriMkdir(fullPath, { recursive: true });
  }

  async getFileUrl(path: string): Promise<string> {
    const fullPath = this.resolvePath(path);
    // Tauri uses asset protocol to serve local files
    // On desktop: use convertFileSrc from @tauri-apps/api
    // Fallback: file:// URL
    try {
      const { convertFileSrc } = await import('@tauri-apps/api/core');
      return convertFileSrc(fullPath);
    } catch {
      return `file://${fullPath}`;
    }
  }

  // --- Private helpers ---

  private async validatePath(path: string): Promise<boolean> {
    try {
      const info = await tauriStat(path);
      return info.isDirectory;
    } catch {
      return false;
    }
  }
}

/**
 * Detect if running inside Tauri native shell.
 */
export function isTauriNative(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).__TAURI_INTERNALS__;
}
