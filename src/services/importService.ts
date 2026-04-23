/**
 * importService.ts — Metadata extraction, vault queries, and import for new items.
 *
 * Supports: EPUB, PDF, CBZ, CBR, YouTube URLs, video files (mp4, mkv, avi, webm).
 * Extracts metadata deterministically from file contents/names.
 * Creates complete item + author structure in the vault.
 */

import type { FSAdapter } from './vaultParser';

// ---- Types ----

export type ImportFormat = 'epub' | 'pdf' | 'cbz' | 'cbr' | 'youtube' | 'video';

const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'avi', 'webm', 'mov', 'flv', 'wmv'];

export interface ImportMetadata {
  title: string;
  subtitle?: string;
  authors: string[];
  year?: string;
  publisher?: string;
  language?: string;
  pages?: number;
  isbn?: string;
  tags: string[];
  format: ImportFormat;
  /** Cover image as ArrayBuffer (extracted from file or uploaded) */
  coverData?: ArrayBuffer;
  /** Cover file extension (e.g. "jpg", "png") */
  coverExt?: string;
  /** AI-generated summary */
  summary?: string;
}

export interface ImportItem {
  metadata: ImportMetadata;
  /** The original file as ArrayBuffer */
  fileData?: ArrayBuffer;
  /** Original filename (e.g. "My Book.epub") */
  fileName: string;
  /** For YouTube: the URL */
  url?: string;
}

// ---- Format detection ----

export function detectFormat(fileName: string): ImportFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  switch (ext) {
    case 'epub': return 'epub';
    case 'pdf': return 'pdf';
    case 'cbz': return 'cbz';
    case 'cbr': return 'cbr';
    default:
      if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
      return null;
  }
}

export function isYouTubeUrl(text: string): boolean {
  return /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/.test(text.trim());
}

/** File extensions accepted by the file picker */
export const ACCEPTED_EXTENSIONS = ['.epub', '.pdf', '.cbz', '.cbr', ...VIDEO_EXTENSIONS.map(e => `.${e}`)].join(',');

// ---- Vault queries ----

/** List existing author names from the authors/ folder */
export async function listExistingAuthors(fs: FSAdapter, authorsPath: string): Promise<string[]> {
  try {
    const entries = await fs.readDir(authorsPath);
    return entries
      .filter((e) => e.isDirectory)
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** Collect all unique tags from all .md files in the vault */
export async function listExistingTags(fs: FSAdapter, folderPaths: string[]): Promise<string[]> {
  const tagSet = new Set<string>();

  for (const folderPath of folderPaths) {
    try {
      const dirs = await fs.readDir(folderPath);
      for (const dir of dirs) {
        if (!dir.isDirectory || dir.name.startsWith('_')) continue;
        try {
          const files = await fs.readDir(dir.path);
          const mdFile = files.find((f) => !f.isDirectory && f.name.endsWith('.md') && !f.name.startsWith('_'));
          if (!mdFile) continue;
          const content = await fs.readFile(mdFile.path);
          // Quick YAML tag extraction
          const match = content.match(/^---\n([\s\S]*?)\n---/);
          if (!match) continue;
          const yaml = match[1];
          const tagMatches = yaml.matchAll(/^\s+-\s+"?(#[^"\n]+)"?/gm);
          for (const m of tagMatches) {
            tagSet.add(m[1].trim().replace(/^"|"$/g, ''));
          }
        } catch {
          // Skip unreadable items
        }
      }
    } catch {
      // Skip unreadable folders
    }
  }

  return [...tagSet].sort((a, b) => a.localeCompare(b));
}

// ---- Metadata extraction ----

/** Extract metadata from an EPUB file */
export async function extractEpubMetadata(data: ArrayBuffer): Promise<Partial<ImportMetadata>> {
  const { default: ePub } = await import('epubjs');
  const book = ePub({ encoding: 'binary' });
  await book.open(data);
  await book.loaded.metadata;

  const meta = book.packaging.metadata;
  const metaAny = meta as unknown as Record<string, unknown>;

  const result: Partial<ImportMetadata> = {
    title: meta.title || undefined,
    authors: meta.creator ? [meta.creator] : [],
    language: meta.language || undefined,
    publisher: meta.publisher || undefined,
    tags: metaAny.subject ? String(metaAny.subject).split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : [],
  };

  try {
    const coverUrl = await book.coverUrl();
    if (coverUrl) {
      const resp = await fetch(coverUrl);
      const blob = await resp.blob();
      result.coverData = await blob.arrayBuffer();
      const mime = blob.type;
      if (mime.includes('png')) result.coverExt = 'png';
      else if (mime.includes('webp')) result.coverExt = 'webp';
      else result.coverExt = 'jpg';
    }
  } catch {
    // Cover extraction failed — not critical
  }

  book.destroy();
  return result;
}

/** Extract metadata from a PDF file */
export async function extractPdfMetadata(data: ArrayBuffer): Promise<Partial<ImportMetadata>> {
  const pdfjsLib = await import('pdfjs-dist');
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const meta = await doc.getMetadata();
  const info = (meta.info ?? {}) as Record<string, unknown>;

  const result: Partial<ImportMetadata> = {
    title: info.Title ? String(info.Title) : undefined,
    authors: info.Author ? [String(info.Author)] : [],
    pages: doc.numPages,
    language: info.Language ? String(info.Language) : undefined,
  };

  doc.destroy();
  return result;
}

/** Extract metadata from a CBZ/CBR filename (convention: "Serie - T## - Titulo") */
export function extractComicMetadata(fileName: string): Partial<ImportMetadata> {
  const name = fileName.replace(/\.(cbz|cbr)$/i, '');
  const match = name.match(/^(.+?)\s*-\s*T(\d+)\s*-\s*(.+)$/);
  if (match) {
    return { title: match[3].trim(), tags: [match[1].trim()] };
  }
  return { title: name };
}

/** Extract metadata from a video filename */
export function extractVideoMetadata(fileName: string): Partial<ImportMetadata> {
  const name = fileName.replace(/\.[^.]+$/, '');
  return { title: name };
}

/** Extract metadata from a YouTube URL via oEmbed */
export async function extractYouTubeMetadata(url: string): Promise<Partial<ImportMetadata>> {
  try {
    const resp = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    const data = await resp.json();

    const result: Partial<ImportMetadata> = {
      title: data.title || undefined,
      authors: data.author_name ? [data.author_name] : [],
    };

    if (data.thumbnail_url) {
      try {
        const videoId = url.match(/(?:v=|youtu\.be\/|shorts\/)([^&?/]+)/)?.[1];
        const thumbUrl = videoId
          ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
          : data.thumbnail_url;
        const thumbResp = await fetch(thumbUrl);
        if (thumbResp.ok) {
          const blob = await thumbResp.blob();
          result.coverData = await blob.arrayBuffer();
          result.coverExt = 'jpg';
        }
      } catch {
        // Thumbnail fetch failed
      }
    }

    return result;
  } catch {
    return {};
  }
}

// ---- Frontmatter generation ----

/** Generate Obsidian-compatible frontmatter YAML matching vault conventions */
export function generateFrontmatter(meta: ImportMetadata): string {
  const lines: string[] = ['---'];

  lines.push(`title: "${meta.title.replace(/"/g, '\\"')}"`);
  if (meta.subtitle) lines.push(`subtitle: "${meta.subtitle.replace(/"/g, '\\"')}"`);

  // Cover wikilink — same base name as the .md
  if (meta.coverData && meta.coverExt) {
    const safeName = sanitizeName(meta.title);
    lines.push(`cover: "[[${safeName}.${meta.coverExt}]]"`);
  }

  lines.push(`year: "${meta.year || ''}"`);

  if (meta.authors.length > 0) {
    lines.push('authors:');
    for (const a of meta.authors) {
      lines.push(`  - "[[${a}]]"`);
    }
  }

  lines.push(`isbn: "${meta.isbn || ''}"`);
  lines.push(`publisher: "${meta.publisher ? meta.publisher.replace(/"/g, '\\"') : ''}"`);
  lines.push(`language: "${meta.language || ''}"`);
  lines.push(`pages: ${meta.pages || ''}`);
  lines.push(`status: "to-read"`);
  lines.push(`rating:`);
  lines.push(`date_started:`);
  lines.push(`date_finished:`);

  if (meta.tags.length > 0) {
    lines.push('tags:');
    for (const t of meta.tags) {
      // Ensure tags start with #
      const tag = t.startsWith('#') ? t : `#${t}`;
      lines.push(`  - "${tag.replace(/"/g, '\\"')}"`);
    }
  } else {
    lines.push('tags:');
  }

  // Formats array
  lines.push('formats:');
  lines.push(`  - ${meta.format}`);

  lines.push('---');
  return lines.join('\n');
}

/** Generate .md body with standard sections */
export function generateMdBody(summary?: string): string {
  return `
# Resumen

${summary || ''}

# Notas



# Citas

> 

# Relacionados

`;
}

// ---- Author creation ----

/** Generate an author .md frontmatter */
export function generateAuthorFrontmatter(name: string): string {
  return `---
name: ${name}
birth_date:
death_date:
photo:
nationality:
website:
tags:
---

# Biografia



# Obras



# Enlaces

`;
}

/** Create author folder + .md if it doesn't exist */
export async function ensureAuthor(fs: FSAdapter, authorsPath: string, authorName: string): Promise<void> {
  const authorFolder = `${authorsPath}/${authorName}`;
  const authorMd = `${authorFolder}/${authorName}.md`;

  const exists = await fs.exists(authorFolder);
  if (exists) return;

  await fs.mkdir(authorFolder);
  await fs.writeFile(authorMd, generateAuthorFrontmatter(authorName));
}

// ---- Vault write ----

/** Sanitize a name for use as folder/file name */
export function sanitizeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Import an item into the vault:
 * 1. Create folder: {targetFolder}/{itemName}/
 * 2. Copy content file
 * 3. Write cover image if available
 * 4. Write .md metadata file with frontmatter + body
 * 5. For YouTube: write .youtube file with URL
 * 6. Create author folders for any new authors
 *
 * Returns: { folderPath, createdAuthors[] }
 */
export async function importToVault(
  fs: FSAdapter,
  item: ImportItem,
  targetFolder: string,
  authorsPath: string,
): Promise<{ folderPath: string; createdAuthors: string[] }> {
  const { metadata, fileData, fileName, url } = item;
  const safeName = sanitizeName(metadata.title);
  const folderPath = `${targetFolder}/${safeName}`;

  // 1. Create item folder
  await fs.mkdir(folderPath);

  // 2. Copy content file
  if (metadata.format === 'youtube' && url) {
    await fs.writeFile(`${folderPath}/${safeName}.youtube`, url.trim());
  } else if (fileData) {
    const ext = fileName.split('.').pop()?.toLowerCase() || metadata.format;
    await fs.writeBinaryFile(`${folderPath}/${safeName}.${ext}`, fileData);
  }

  // 3. Write cover image
  if (metadata.coverData && metadata.coverExt) {
    await fs.writeBinaryFile(
      `${folderPath}/${safeName}.${metadata.coverExt}`,
      metadata.coverData,
    );
  }

  // 4. Write .md metadata file
  const frontmatter = generateFrontmatter(metadata);
  const body = generateMdBody(item.metadata.summary);
  await fs.writeFile(`${folderPath}/${safeName}.md`, `${frontmatter}\n${body}`);

  // 5. Create author folders for new authors
  const createdAuthors: string[] = [];
  for (const author of metadata.authors) {
    const authorFolder = `${authorsPath}/${author}`;
    const exists = await fs.exists(authorFolder);
    if (!exists) {
      await ensureAuthor(fs, authorsPath, author);
      createdAuthors.push(author);
    }
  }

  return { folderPath, createdAuthors };
}
