/**
 * Capacitor Filesystem Adapter
 * Used when running as a native app (iOS, Android, Desktop via Capacitor).
 * Falls back to WebFSAdapter on web.
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import type { FSAdapter, DirEntry } from './vaultParser';

export class CapacitorFSAdapter implements FSAdapter {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

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
    return (window as any).Capacitor?.convertFileSrc(result.uri) || result.uri;
  }
}

/**
 * Detect if running inside Capacitor native shell.
 */
export function isCapacitorNative(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform();
}
