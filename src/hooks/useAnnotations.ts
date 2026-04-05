/**
 * useAnnotations — shared annotation state hook for all readers.
 *
 * Encapsulates:
 * - Loading/saving annotations from localStorage
 * - Bookmark CRUD (add, remove, toggle, isBookmarked)
 * - Highlight/region CRUD
 * - Note editing
 * - Voice comment linking
 * - Auto-create annotation for voice comments
 *
 * Each reader consumes this hook instead of duplicating 50-80 lines of
 * annotation boilerplate. Format-specific logic (vault write-back,
 * rendition highlight sync) stays in the reader.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Annotation, HighlightColor } from '@/types/annotation';
import type { DocumentPosition, TextSelection, SpatialRegion } from '@/types/annotation';
import {
  loadAnnotations,
  saveAnnotations,
  addAnnotation,
  removeAnnotation,
  getHighlights,
  getBookmarks,
  linkVoiceToAnnotation,
  unlinkVoiceFromAnnotation,
  updateAnnotationNote,
} from '@/services/annotationService';

/** Predicate to find a matching bookmark (reader-specific matching logic). */
export type BookmarkMatcher = (bookmark: Annotation) => boolean;

export interface UseAnnotationsReturn {
  /** Current annotations list */
  annotations: Annotation[];
  /** Direct setter — use sparingly; prefer the action methods below */
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  /** Derived: only bookmarks */
  bookmarks: Annotation[];
  /** Derived: only highlights (text selections + regions) */
  highlights: Annotation[];

  // ---- Bookmark actions ----
  addBookmark: (position: DocumentPosition, chapter?: string) => void;
  removeBookmark: (annotationId: string) => void;
  /** Toggle bookmark: removes if matcher finds one, adds otherwise. Returns the new bookmarked state. */
  toggleBookmark: (matcher: BookmarkMatcher, position: DocumentPosition, chapter?: string) => boolean;
  /** Check if any bookmark matches */
  isBookmarked: (matcher: BookmarkMatcher) => boolean;
  /** Find the matching bookmark (useful to get its id) */
  findBookmark: (matcher: BookmarkMatcher) => Annotation | undefined;

  // ---- Highlight / region actions ----
  addHighlight: (params: {
    position: DocumentPosition;
    textSelection?: TextSelection;
    region?: SpatialRegion;
    color: HighlightColor;
    categoryId?: string;
    chapter?: string;
    note?: string;
  }) => Annotation;
  removeHighlight: (annotationId: string) => Annotation | undefined;

  // ---- General actions ----
  removeAnnotationById: (annotationId: string) => void;
  updateNote: (annotationId: string, note: string) => void;

  // ---- Voice linking ----
  voiceLinked: (annotationId: string, voiceId: string) => void;
  voiceUnlinked: (annotationId: string, voiceId: string) => void;
  /** Create a new annotation and immediately link a voice comment to it. */
  autoCreateForVoice: (voiceId: string, position: DocumentPosition, chapter?: string) => void;
}

export function useAnnotations(filePath: string): UseAnnotationsReturn {
  const [annotations, setAnnotations] = useState<Annotation[]>(() => loadAnnotations(filePath));

  // Persist on change
  useEffect(() => {
    saveAnnotations(filePath, annotations);
  }, [annotations, filePath]);

  // Derived
  const bookmarks = useMemo(() => getBookmarks(annotations), [annotations]);
  const highlights = useMemo(() => getHighlights(annotations), [annotations]);

  // ---- Bookmark actions ----

  const addBookmark = useCallback((position: DocumentPosition, chapter?: string) => {
    setAnnotations((prev) => {
      const { annotations: updated } = addAnnotation(filePath, prev, {
        position,
        color: 'yellow',
        chapter,
      });
      return updated;
    });
  }, [filePath]);

  const removeBookmark = useCallback((annotationId: string) => {
    setAnnotations((prev) => removeAnnotation(filePath, prev, annotationId));
  }, [filePath]);

  const toggleBookmark = useCallback((
    matcher: BookmarkMatcher,
    position: DocumentPosition,
    chapter?: string,
  ): boolean => {
    let nowBookmarked = false;
    setAnnotations((prev) => {
      const existing = getBookmarks(prev).find(matcher);
      if (existing) {
        nowBookmarked = false;
        return removeAnnotation(filePath, prev, existing.id);
      }
      nowBookmarked = true;
      const { annotations: updated } = addAnnotation(filePath, prev, {
        position,
        color: 'yellow',
        chapter,
      });
      return updated;
    });
    return nowBookmarked;
  }, [filePath]);

  const isBookmarkedFn = useCallback((matcher: BookmarkMatcher): boolean => {
    return bookmarks.some(matcher);
  }, [bookmarks]);

  const findBookmark = useCallback((matcher: BookmarkMatcher): Annotation | undefined => {
    return bookmarks.find(matcher);
  }, [bookmarks]);

  // ---- Highlight / region actions ----

  const addHighlightAction = useCallback((params: {
    position: DocumentPosition;
    textSelection?: TextSelection;
    region?: SpatialRegion;
    color: HighlightColor;
    categoryId?: string;
    chapter?: string;
    note?: string;
  }): Annotation => {
    let added!: Annotation;
    setAnnotations((prev) => {
      const result = addAnnotation(filePath, prev, params);
      added = result.added;
      return result.annotations;
    });
    return added;
  }, [filePath]);

  const removeHighlightAction = useCallback((annotationId: string): Annotation | undefined => {
    let found: Annotation | undefined;
    setAnnotations((prev) => {
      found = prev.find((a) => a.id === annotationId);
      return removeAnnotation(filePath, prev, annotationId);
    });
    return found;
  }, [filePath]);

  // ---- General ----

  const removeAnnotationById = useCallback((annotationId: string) => {
    setAnnotations((prev) => removeAnnotation(filePath, prev, annotationId));
  }, [filePath]);

  const updateNote = useCallback((annotationId: string, note: string) => {
    setAnnotations((prev) => updateAnnotationNote(filePath, prev, annotationId, note));
  }, [filePath]);

  // ---- Voice linking ----

  const voiceLinked = useCallback((annotationId: string, voiceId: string) => {
    setAnnotations((prev) => linkVoiceToAnnotation(filePath, prev, annotationId, voiceId));
  }, [filePath]);

  const voiceUnlinked = useCallback((annotationId: string, voiceId: string) => {
    setAnnotations((prev) => unlinkVoiceFromAnnotation(filePath, prev, annotationId, voiceId));
  }, [filePath]);

  const autoCreateForVoice = useCallback((
    voiceId: string,
    position: DocumentPosition,
    chapter?: string,
  ) => {
    setAnnotations((prev) => {
      const { annotations: updated, added } = addAnnotation(filePath, prev, {
        position,
        color: 'yellow',
        note: '',
        chapter,
      });
      return linkVoiceToAnnotation(filePath, updated, added.id, voiceId);
    });
  }, [filePath]);

  return {
    annotations,
    setAnnotations,
    bookmarks,
    highlights,
    addBookmark,
    removeBookmark,
    toggleBookmark,
    isBookmarked: isBookmarkedFn,
    findBookmark,
    addHighlight: addHighlightAction,
    removeHighlight: removeHighlightAction,
    removeAnnotationById,
    updateNote,
    voiceLinked,
    voiceUnlinked,
    autoCreateForVoice,
  };
}
