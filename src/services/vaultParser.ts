/**
 * Vault Parser Service
 * Reads and parses the Obsidian vault structure for LibReader.
 * Uses the File System Access API for web, can be swapped for
 * Tauri Filesystem on mobile/desktop.
 */

import { parse as parseYaml } from 'yaml';

/**
 * Browser-safe frontmatter parser.
 * Replaces gray-matter which uses Node.js Buffer and crashes in the browser.
 */
function parseFrontmatter(input: string): { data: Record<string, unknown>; content: string } {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith('---')) {
    return { data: {}, content: input };
  }
  // Find closing delimiter
  const closeIdx = trimmed.indexOf('\n---', 3);
  if (closeIdx === -1) {
    return { data: {}, content: input };
  }
  const yamlStr = trimmed.slice(3, closeIdx);
  let data: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(yamlStr);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // If YAML parsing fails, return empty data
  }
  // Content starts after closing --- and optional newline
  let contentStart = closeIdx + 4; // skip \n---
  if (trimmed[contentStart] === '\r') contentStart++;
  if (trimmed[contentStart] === '\n') contentStart++;
  const content = trimmed.slice(contentStart);
  return { data, content };
}
import type {
  LibraryItem,
  FileFormat,
  ReadingStatus,
  VaultFolder,
} from '@/types';

// ---- Frontmatter shape (loosely typed — YAML can contain anything) ----

/** Expected fields in item .md frontmatter. All optional since YAML varies. */
interface BookFrontmatter {
  title?: string;
  subtitle?: string;
  cover?: string;
  authors?: string[];
  formats?: string[];
  status?: string;
  year?: string | number;
  isbn?: string;
  publisher?: string;
  editor?: string;
  language?: string;
  lang?: string;
  pages?: string | number;
  rating?: string | number;
  date_started?: string;
  date_finished?: string;
  tags?: string[];
  [key: string]: unknown;
}

// ---- File System Abstraction ----

export interface FSAdapter {
  readDir(path: string): Promise<DirEntry[]>;
  readFile(path: string): Promise<string>;
  readBinaryFile(path: string): Promise<ArrayBuffer>;
  writeFile(path: string, content: string): Promise<void>;
  writeBinaryFile(path: string, data: ArrayBuffer): Promise<void>;
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getFileUrl(path: string): Promise<string>;
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

// ---- IndexedDB helpers for persisting FileSystemDirectoryHandle ----

const IDB_NAME = 'libreader-fs';
const IDB_STORE = 'handles';
const IDB_KEY = 'vault-root';

function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandleToDB(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function loadHandleFromDB(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

async function clearHandleFromDB(): Promise<void> {
  try {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // Not critical
  }
}

// ---- Web File System Access API Adapter ----

export class WebFSAdapter implements FSAdapter {
  private root: FileSystemDirectoryHandle | null = null;
  private handleCache = new Map<string, FileSystemDirectoryHandle | FileSystemFileHandle>();
  private urlCache = new Map<string, string>();

  async requestAccess(): Promise<boolean> {
    try {
      this.root = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });
      this.handleCache.clear();
      this.urlCache.clear();
      // Persist the handle for next session
      await saveHandleToDB(this.root!);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Try to restore a previously saved directory handle from IndexedDB.
   * Returns true if the handle was restored and permission was granted.
   * This allows the app to reconnect to the vault without user interaction.
   */
  async tryRestore(): Promise<boolean> {
    try {
      const handle = await loadHandleFromDB();
      if (!handle) return false;

      // Verify we still have permission (may prompt once per session)
      const perm = await (handle as any).requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        return false;
      }

      this.root = handle;
      this.handleCache.clear();
      this.urlCache.clear();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear the persisted handle (disconnect vault).
   */
  async disconnect(): Promise<void> {
    this.root = null;
    this.handleCache.clear();
    this.urlCache.clear();
    await clearHandleFromDB();
  }

  isReady(): boolean {
    return this.root !== null;
  }

  getRootName(): string {
    return this.root?.name ?? '';
  }

  private async resolveHandle(
    pathStr: string
  ): Promise<FileSystemDirectoryHandle | FileSystemFileHandle> {
    if (!this.root) throw new Error('No filesystem access');
    if (pathStr === '' || pathStr === '.') return this.root;

    const cached = this.handleCache.get(pathStr);
    if (cached) return cached;

    const parts = pathStr.split('/').filter(Boolean);
    let current: FileSystemDirectoryHandle = this.root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      try {
        if (isLast) {
          // Try as directory first, then as file
          try {
            const dirHandle = await current.getDirectoryHandle(part);
            this.handleCache.set(pathStr, dirHandle);
            return dirHandle;
          } catch {
            const fileHandle = await current.getFileHandle(part);
            this.handleCache.set(pathStr, fileHandle);
            return fileHandle;
          }
        } else {
          current = await current.getDirectoryHandle(part);
        }
      } catch {
        throw new Error(`Path not found: ${pathStr} (failed at ${part})`);
      }
    }

    this.handleCache.set(pathStr, current);
    return current;
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const handle = await this.resolveHandle(path);
    if (handle.kind !== 'directory') throw new Error(`Not a directory: ${path}`);

    const entries: DirEntry[] = [];
    const dirHandle = handle as FileSystemDirectoryHandle;

    for await (const [name, entry] of (dirHandle as any).entries()) {
      if (name.startsWith('.')) continue; // skip hidden files
      entries.push({
        name,
        isDirectory: entry.kind === 'directory',
        path: path ? `${path}/${name}` : name,
      });
    }

    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async readFile(path: string): Promise<string> {
    const handle = await this.resolveHandle(path);
    if (handle.kind !== 'file') throw new Error(`Not a file: ${path}`);
    const file = await (handle as FileSystemFileHandle).getFile();
    return file.text();
  }

  async readBinaryFile(path: string): Promise<ArrayBuffer> {
    const handle = await this.resolveHandle(path);
    if (handle.kind !== 'file') throw new Error(`Not a file: ${path}`);
    const file = await (handle as FileSystemFileHandle).getFile();
    return file.arrayBuffer();
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.resolveHandle(path);
      return true;
    } catch {
      return false;
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.root) throw new Error('No filesystem access');
    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) throw new Error('Invalid path');

    // Navigate to parent directory, creating dirs as needed
    let current: FileSystemDirectoryHandle = this.root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }

    const fileHandle = await current.getFileHandle(fileName, { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(content);
    await writable.close();

    // Invalidate handle cache for this path
    this.handleCache.delete(path);
  }

  async writeBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
    if (!this.root) throw new Error('No filesystem access');
    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) throw new Error('Invalid path');

    let current: FileSystemDirectoryHandle = this.root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }

    const fileHandle = await current.getFileHandle(fileName, { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(data);
    await writable.close();

    this.handleCache.delete(path);
  }

  async mkdir(path: string): Promise<void> {
    if (!this.root) throw new Error('No filesystem access');
    const parts = path.split('/').filter(Boolean);
    let current: FileSystemDirectoryHandle = this.root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }
  }

  async getFileUrl(path: string): Promise<string> {
    const cached = this.urlCache.get(path);
    if (cached) return cached;

    const handle = await this.resolveHandle(path);
    if (handle.kind !== 'file') throw new Error(`Not a file: ${path}`);
    const file = await (handle as FileSystemFileHandle).getFile();
    const url = URL.createObjectURL(file);
    this.urlCache.set(path, url);
    return url;
  }

  cleanup(): void {
    for (const url of this.urlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.urlCache.clear();
  }
}

// ---- Vault Parser ----

function sanitizeTag(tag: string): string {
  return tag.replace(/^#/, '').trim();
}

function extractWikilink(value: string): string {
  const match = value.match(/\[\[([^\]|]+)/);
  return match ? match[1] : value;
}

function pathToId(path: string): string {
  return path.replace(/[/\\]/g, '__').replace(/\.[^.]+$/, '');
}

function detectFormat(filename: string): FileFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'epub') return 'epub';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'cbz') return 'cbz';
  if (ext === 'cbr') return 'cbr';
  if (ext === 'md') return 'md';
  if (ext === 'youtube') return 'youtube';
  return null;
}

function isImageFile(filename: string): boolean {
  return /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(filename);
}

/** Map of filename -> full vault path. Used to resolve Obsidian wikilinks. */
type FileIndex = Map<string, string>;

/**
 * Build an index of all image files in the vault for wikilink resolution.
 * Scans up to maxDepth levels deep.
 */
async function buildImageIndex(
  fs: FSAdapter,
  rootDirs: string[],
  maxDepth = 3
): Promise<FileIndex> {
  const index: FileIndex = new Map();

  async function scan(dirPath: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const entries = await fs.readDir(dirPath);
      const subdirs: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory) {
          subdirs.push(entry.path);
        } else if (isImageFile(entry.name)) {
          // Only store first occurrence (closest to root wins for Obsidian resolution)
          if (!index.has(entry.name)) {
            index.set(entry.name, entry.path);
          }
        }
      }
      // Scan subdirectories in parallel instead of sequential
      if (subdirs.length > 0) {
        await Promise.all(subdirs.map((p) => scan(p, depth + 1)));
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  await Promise.all(rootDirs.map((dir) => scan(dir, 0)));
  return index;
}


async function parseBookDir(
  fs: FSAdapter,
  dirPath: string,
  imageIndex?: FileIndex,
  folderName?: string
): Promise<LibraryItem | null> {
  try {
    const entries = await fs.readDir(dirPath);
    const mdFile = entries.find(
      (e) => !e.isDirectory && e.name.endsWith('.md') && !e.name.startsWith('_')
    );

    if (!mdFile) {
      return null;
    }

    const content = await fs.readFile(mdFile.path);
    const { data: rawData } = parseFrontmatter(content);
    const data = rawData as BookFrontmatter;

    // Find cover image
    let cover: string | undefined;
    const attachDir = entries.find(
      (e) => e.isDirectory && e.name === '_attachments'
    );
    // Read _attachments once and reuse
    let attachFiles: DirEntry[] | null = null;
    if (attachDir) {
      try { attachFiles = await fs.readDir(attachDir.path); } catch { /* ok */ }
    }

    if (data.cover) {
      const coverName = extractWikilink(data.cover);
      // 1. Look in item directory
      const coverEntry = entries.find(
        (e) => !e.isDirectory && e.name === coverName
      );
      if (coverEntry) {
        cover = coverEntry.path;
      }
      // 2. Look in _attachments subdirectory
      if (!cover && attachFiles) {
        const attachCover = attachFiles.find(
          (f) => !f.isDirectory && f.name === coverName
        );
        if (attachCover) cover = attachCover.path;
      }
      // 3. Look in vault-wide image index (resolves Obsidian wikilinks)
      if (!cover && imageIndex) {
        const resolved = imageIndex.get(coverName);
        if (resolved) cover = resolved;
      }
    }
    // Fallback: look for any image in item directory
    if (!cover) {
      const imgEntry = entries.find(
        (e) => !e.isDirectory && isImageFile(e.name)
      );
      if (imgEntry) cover = imgEntry.path;
    }
    // Fallback: look for any image in _attachments
    if (!cover && attachFiles) {
      const attachImg = attachFiles.find(
        (f) => !f.isDirectory && isImageFile(f.name)
      );
      if (attachImg) cover = attachImg.path;
    }

    // Find readable files in item directory
    const filePaths: Partial<Record<FileFormat, string>> = {};
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const fmt = detectFormat(entry.name);
      if (fmt && fmt !== 'md') {
        filePaths[fmt] = entry.path;
      }
    }

    // Parse authors
    const authors: string[] = (data.authors || []).map((a: string) =>
      extractWikilink(a)
    );

    // Parse formats from frontmatter
    const formats: FileFormat[] = (data.formats || [])
      .map((f: string) => f.toLowerCase().trim())
      .filter((f: string): f is FileFormat =>
        ['epub', 'pdf', 'cbz', 'cbr', 'youtube'].includes(f)
      );

    // If no formats in frontmatter, detect from files
    if (formats.length === 0) {
      for (const fmt of Object.keys(filePaths) as FileFormat[]) {
        formats.push(fmt);
      }
    }

    // Parse reading progress from .epub.reading or .sdr directories
    let progress: number | undefined;
    let annotationCount = 0;
    let lastRead: string | undefined;

    const readingDir = entries.find(
      (e) => e.isDirectory && e.name.endsWith('.reading')
    );
    if (readingDir) {
      try {
        const readingFiles = await fs.readDir(readingDir.path);
        const stateFile = readingFiles.find((f) => f.name === 'state.json');
        if (stateFile) {
          const stateContent = await fs.readFile(stateFile.path);
          const state = JSON.parse(stateContent);
          if (state.progress) {
            progress = Math.round(state.progress * 100);
          }
          if (state.lastRead) {
            lastRead = state.lastRead;
          }
        }
        const annotationsFile = readingFiles.find(
          (f) => f.name === 'annotations.md'
        );
        if (annotationsFile) {
          const annotationsContent = await fs.readFile(annotationsFile.path);
          // Count annotation markers
          annotationCount = (annotationsContent.match(/^##\s/gm) || []).length;
        }
      } catch {
        // Reading dir parsing is optional
      }
    }

    // Determine real status based on progress
    let status: ReadingStatus = (data.status as ReadingStatus) || 'to-read';
    if (progress !== undefined && progress > 0 && status === 'to-read') {
      status = 'reading';
    }
    if (progress !== undefined && progress >= 100) {
      status = 'finished';
    }

    return {
      id: pathToId(dirPath),
      title: data.title || mdFile.name.replace('.md', ''),
      subtitle: data.subtitle && data.subtitle !== '-' ? data.subtitle : undefined,
      cover,
      year: data.year?.toString(),
      authors,
      isbn: data.isbn,
      publisher: data.publisher || data.editor,
      language: data.language || data.lang,
      pages: data.pages ? Number(data.pages) : undefined,
      status,
      rating: data.rating ? Number(data.rating) : undefined,
      dateStarted: data.date_started,
      dateFinished: data.date_finished,
      tags: (data.tags || []).map(sanitizeTag),
      formats,
      vaultPath: dirPath,
      notePath: mdFile.path,
      filePaths: filePaths as Record<FileFormat, string>,
      progress,
      annotationCount,
      folder: folderName,
      lastRead,
    };
  } catch (err) {
    console.warn(`Failed to parse book directory: ${dirPath}`, err);
    return null;
  }
}

/**
 * Safely read a directory, returning [] if the path is empty or doesn't exist.
 */
async function safeReadDir(fs: FSAdapter, path: string): Promise<DirEntry[]> {
  if (!path || !path.trim()) {
    return [];
  }
  try {
    return await fs.readDir(path);
  } catch {
    return [];
  }
}

/**
 * Parse a "flat" directory where each subdirectory is an item (like books/).
 */
async function parseFlatDir(
  fs: FSAdapter,
  dirPath: string,
  imageIndex: FileIndex,
  folderName?: string
): Promise<LibraryItem[]> {
  const entries = await safeReadDir(fs, dirPath);
  const itemDirs = entries.filter((e) => e.isDirectory);
  if (itemDirs.length === 0) return [];

  const promises = itemDirs.map((e) => parseBookDir(fs, e.path, imageIndex, folderName));
  const results = await Promise.all(promises);
  const items = results.filter((b): b is LibraryItem => b !== null);
  return items;
}

export interface ParseVaultConfig {
  /** Dynamic list of folders to parse */
  folders: VaultFolder[];
  /** Called after each folder is fully parsed, with items from that folder */
  onBatch?: (items: LibraryItem[], folderName: string) => void;
}

export async function parseVault(
  fs: FSAdapter,
  config: ParseVaultConfig
): Promise<LibraryItem[]> {
  const items: LibraryItem[] = [];

  // Collect all non-empty dirs for image indexing
  const dirsToIndex = config.folders
    .map((f) => f.path)
    .filter((d) => d && d.trim() !== '');

  // Build vault-wide image index for resolving Obsidian cover wikilinks
  const imageIndex = await buildImageIndex(fs, dirsToIndex);

  // Parse all configured folders in parallel, emitting batches as they complete
  await Promise.all(config.folders.map(async (folder) => {
    if (!folder.path?.trim()) return;
    try {
      const folderItems = await parseFlatDir(fs, folder.path, imageIndex, folder.name);
      items.push(...folderItems);
      if (folderItems.length > 0 && config.onBatch) {
        config.onBatch(folderItems, folder.name);
      }
    } catch (err) {
      console.warn(`Failed to parse folder "${folder.name}" (${folder.path}):`, err);
    }
  }));

  return items;
}

/** Reading progress data returned by parseReadingProgress. */
export interface ReadingProgressData {
  itemId: string;
  format: string;
  position: string;
  percentage: number;
  lastRead: string;
}

export async function parseReadingProgress(
  fs: FSAdapter,
  item: LibraryItem
): Promise<ReadingProgressData | null> {
  // Look for .epub.reading/state.json or .sdr/ directories
  try {
    const entries = await fs.readDir(item.vaultPath);

    for (const entry of entries) {
      if (!entry.isDirectory) continue;

      if (entry.name.endsWith('.reading')) {
        const readingFiles = await fs.readDir(entry.path);
        const stateFile = readingFiles.find((f) => f.name === 'state.json');
        if (stateFile) {
          const content = await fs.readFile(stateFile.path);
          const state = JSON.parse(content);
          return {
            itemId: item.id,
            format: entry.name.includes('.epub') ? 'epub' : 'pdf',
            position: state.location || '',
            percentage: state.progress ? Math.round(state.progress * 100) : 0,
            lastRead: state.lastRead || new Date().toISOString(),
          };
        }
      }
    }
  } catch {
    // Not critical
  }

  return null;
}
