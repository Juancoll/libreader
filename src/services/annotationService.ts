/**
 * Annotation Service
 *
 * Central CRUD layer for the unified Annotation type.
 * Handles localStorage persistence and migration from legacy formats.
 *
 * Each reader calls this service instead of managing its own highlight/bookmark state.
 * The service also provides conversion to annotationWriter's HighlightEntry/BookmarkEntry
 * for vault write-back.
 */

import type {
  Annotation,
  HighlightColor,
  DocumentPosition,
  TextSelection,
  SpatialRegion,
  AnnotationCategory,
} from '@/types/annotation';
import { generateAnnotationId, isBookmark, resolveAnnotationCategoryName } from '@/types/annotation';
import type { BookmarkEntry, HighlightEntry } from './annotationWriter';
import { loadFromStorage, saveToStorage } from '@/hooks/useReaderStorage';

// ---- Storage ----

/** Unified storage key for all annotations of a file */
function getAnnotationsKey(filePath: string): string {
  return `libreader:annotations:${filePath}`;
}

// ---- CRUD Operations ----

/**
 * Load all annotations for a file.
 * First tries the unified key. If empty, attempts migration from legacy keys.
 */
export function loadAnnotations(filePath: string): Annotation[] {
  const key = getAnnotationsKey(filePath);
  const existing = loadFromStorage<Annotation[]>(key, []);
  if (existing.length > 0) return existing;

  // Try migrating from legacy formats
  const migrated = migrateLegacy(filePath);
  if (migrated.length > 0) {
    saveToStorage(key, migrated);
  }
  return migrated;
}

/**
 * Save all annotations for a file.
 */
export function saveAnnotations(filePath: string, annotations: Annotation[]): void {
  saveToStorage(getAnnotationsKey(filePath), annotations);
}

/**
 * Add a new annotation. Returns the updated list.
 */
export function addAnnotation(
  filePath: string,
  annotations: Annotation[],
  params: {
    position: DocumentPosition;
    textSelection?: TextSelection;
    region?: SpatialRegion;
    color: HighlightColor;
    categoryId?: string;
    note?: string;
    chapter?: string;
  },
): { annotations: Annotation[]; added: Annotation } {
  const now = new Date().toISOString();
  const annotation: Annotation = {
    id: generateAnnotationId(),
    position: params.position,
    textSelection: params.textSelection,
    region: params.region,
    style: { color: params.color, categoryId: params.categoryId },
    note: params.note || '',
    voiceIds: [],
    chapter: params.chapter,
    createdAt: now,
    updatedAt: now,
  };

  const updated = [...annotations, annotation];
  saveAnnotations(filePath, updated);
  return { annotations: updated, added: annotation };
}

/**
 * Remove an annotation by ID. Returns the updated list.
 */
export function removeAnnotation(
  filePath: string,
  annotations: Annotation[],
  annotationId: string,
): Annotation[] {
  const updated = annotations.filter((a) => a.id !== annotationId);
  saveAnnotations(filePath, updated);
  return updated;
}

/**
 * Update an annotation's note text. Returns the updated list.
 */
export function updateAnnotationNote(
  filePath: string,
  annotations: Annotation[],
  annotationId: string,
  note: string,
): Annotation[] {
  const updated = annotations.map((a) =>
    a.id === annotationId
      ? { ...a, note, updatedAt: new Date().toISOString() }
      : a,
  );
  saveAnnotations(filePath, updated);
  return updated;
}

/**
 * Link a voice comment to an annotation. Returns the updated list.
 */
export function linkVoiceToAnnotation(
  filePath: string,
  annotations: Annotation[],
  annotationId: string,
  voiceId: string,
): Annotation[] {
  const updated = annotations.map((a) =>
    a.id === annotationId
      ? { ...a, voiceIds: [...a.voiceIds, voiceId], updatedAt: new Date().toISOString() }
      : a,
  );
  saveAnnotations(filePath, updated);
  return updated;
}

/**
 * Unlink a voice comment from an annotation. Returns the updated list.
 */
export function unlinkVoiceFromAnnotation(
  filePath: string,
  annotations: Annotation[],
  annotationId: string,
  voiceId: string,
): Annotation[] {
  const updated = annotations.map((a) =>
    a.id === annotationId
      ? { ...a, voiceIds: a.voiceIds.filter((v) => v !== voiceId), updatedAt: new Date().toISOString() }
      : a,
  );
  saveAnnotations(filePath, updated);
  return updated;
}

// ---- Queries ----

/** Get all highlights (annotations with text or region, i.e. not bookmarks) */
export function getHighlights(annotations: Annotation[]): Annotation[] {
  return annotations.filter((a) => !isBookmark(a));
}

/** Get all bookmarks (annotations with only position) */
export function getBookmarks(annotations: Annotation[]): Annotation[] {
  return annotations.filter(isBookmark);
}

/** Get highlights for specific page(s) */
export function getHighlightsForPages(annotations: Annotation[], pages: number[]): Annotation[] {
  const pageSet = new Set(pages);
  return annotations.filter((a) => !isBookmark(a) && a.position.index != null && pageSet.has(a.position.index));
}

// ---- Conversion to annotationWriter types (for vault write-back) ----

/**
 * Convert unified annotations to BookmarkEntry[] for vault persistence.
 */
export function toBookmarkEntries(annotations: Annotation[], totalPages: number): BookmarkEntry[] {
  return getBookmarks(annotations).map((a) => ({
    id: a.id,
    cfi: a.position.cfi,
    page: a.position.index,
    timestamp: a.position.timeStart,
    chapter: a.chapter || (a.position.index ? `Pagina ${a.position.index}` : 'Sin titulo'),
    percentage: a.position.fraction != null
      ? Math.round(a.position.fraction * 100)
      : (a.position.index && totalPages > 0 ? Math.round((a.position.index / totalPages) * 100) : 0),
    createdAt: a.createdAt,
  }));
}

/**
 * Convert unified annotations to HighlightEntry[] for vault persistence.
 * Accepts optional categories to resolve category names.
 */
export function toHighlightEntries(annotations: Annotation[], categories: AnnotationCategory[] = []): HighlightEntry[] {
  return getHighlights(annotations).map((a) => {
    let text = a.textSelection?.text || '';
    if (!text && a.region) {
      text = `[Region ${Math.round(a.region.x * 100)}%,${Math.round(a.region.y * 100)}%]`;
    }
    if (!text && a.position.timeStart != null) {
      const start = formatSeconds(a.position.timeStart);
      const end = a.position.timeEnd != null ? formatSeconds(a.position.timeEnd) : '';
      text = end ? `[${start} - ${end}]` : `[${start}]`;
    }
    return {
      id: a.id,
      cfiRange: a.textSelection?.cfiRange,
      page: a.position.index,
      text,
      color: a.style.color,
      category: resolveAnnotationCategoryName(a.style, categories),
      note: a.note,
      chapter: a.chapter,
      createdAt: a.createdAt,
    };
  });
}

/** Format seconds as MM:SS or H:MM:SS */
function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---- Legacy migration ----

/**
 * Migrate from old per-reader localStorage formats to unified Annotation[].
 * Reads from legacy keys, converts, but does NOT delete old keys (non-destructive).
 */
function migrateLegacy(filePath: string): Annotation[] {
  const annotations: Annotation[] = [];

  // Try EPUB legacy format: libreader:{filePath}:highlights / :bookmarks
  annotations.push(...migrateEpubLegacy(filePath));

  // Try PDF legacy format: libreader:pdf:{filePath}:highlights / :bookmarks
  annotations.push(...migratePdfLegacy(filePath));

  return annotations;
}

interface LegacyEpubHighlight {
  cfiRange: string;
  text: string;
  color: HighlightColor;
  note: string;
  createdAt: string;
}

interface LegacyEpubBookmark {
  cfi: string;
  chapter: string;
  percentage: number;
  createdAt: string;
}

function migrateEpubLegacy(filePath: string): Annotation[] {
  const annotations: Annotation[] = [];

  const highlights = loadFromStorage<LegacyEpubHighlight[]>(
    `libreader:${filePath}:highlights`, [],
  );
  for (const hl of highlights) {
    annotations.push({
      id: generateAnnotationId(),
      position: { cfi: hl.cfiRange },
      textSelection: { text: hl.text, cfiRange: hl.cfiRange },
      style: { color: hl.color },
      note: hl.note || '',
      voiceIds: [],
      createdAt: hl.createdAt,
      updatedAt: hl.createdAt,
    });
  }

  const bookmarks = loadFromStorage<LegacyEpubBookmark[]>(
    `libreader:${filePath}:bookmarks`, [],
  );
  for (const bm of bookmarks) {
    annotations.push({
      id: generateAnnotationId(),
      position: { cfi: bm.cfi, fraction: bm.percentage / 100 },
      style: { color: 'yellow' },
      note: '',
      voiceIds: [],
      chapter: bm.chapter,
      createdAt: bm.createdAt,
      updatedAt: bm.createdAt,
    });
  }

  return annotations;
}

interface LegacyPdfHighlight {
  id: string;
  page: number;
  text: string;
  color: HighlightColor;
  note: string;
  startItemIdx: number;
  startCharOffset: number;
  endItemIdx: number;
  endCharOffset: number;
  createdAt: string;
}

interface LegacyPdfBookmark {
  page: number;
  createdAt: string;
}

function migratePdfLegacy(filePath: string): Annotation[] {
  const annotations: Annotation[] = [];

  const highlights = loadFromStorage<LegacyPdfHighlight[]>(
    `libreader:pdf:${filePath}:highlights`, [],
  );
  for (const hl of highlights) {
    annotations.push({
      id: generateAnnotationId(),
      position: { index: hl.page },
      textSelection: {
        text: hl.text,
        startItemIdx: hl.startItemIdx,
        startCharOffset: hl.startCharOffset,
        endItemIdx: hl.endItemIdx,
        endCharOffset: hl.endCharOffset,
      },
      style: { color: hl.color },
      note: hl.note || '',
      voiceIds: [],
      chapter: `Pagina ${hl.page}`,
      createdAt: hl.createdAt,
      updatedAt: hl.createdAt,
    });
  }

  const bookmarks = loadFromStorage<LegacyPdfBookmark[]>(
    `libreader:pdf:${filePath}:bookmarks`, [],
  );
  for (const bm of bookmarks) {
    annotations.push({
      id: generateAnnotationId(),
      position: { index: bm.page },
      style: { color: 'yellow' },
      note: '',
      voiceIds: [],
      chapter: `Pagina ${bm.page}`,
      createdAt: bm.createdAt,
      updatedAt: bm.createdAt,
    });
  }

  return annotations;
}
