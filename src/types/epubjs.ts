/**
 * Extended type declarations for epubjs.
 *
 * The bundled epubjs types are incomplete:
 * - Event callbacks on Rendition.on() are all `any`
 * - Section.find() returns Element[] but runtime returns {cfi, excerpt}[]
 * - rendition.manager is internal and untyped
 *
 * We export helper types here and use them explicitly in EpubReader.tsx
 * rather than module augmentation (which doesn't work with default-exported classes).
 */

import type Contents from 'epubjs/types/contents';

/** Location event payload from `rendition.on('locationChanged')` */
export interface LocationChangedEvent {
  start: {
    index: number;
    href: string;
    cfi: string;
    location: number;
    percentage: number;
    displayed: { page: number; total: number };
  };
  end: {
    index: number;
    href: string;
    cfi: string;
    location: number;
    percentage: number;
    displayed: { page: number; total: number };
  };
  atStart: boolean;
  atEnd: boolean;
}

/**
 * Spine section with corrected runtime types.
 *
 * The bundled Section types have incorrect signatures:
 * - load() actually returns Promise<Document>, not Document
 * - find() actually returns {cfi, excerpt}[], not Element[]
 *
 * We define a standalone interface matching the actual runtime API.
 */
export interface SpineSection {
  index: number;
  href: string;
  cfiBase: string;
  load(request: Function): Promise<Document>;
  find(query: string): Array<{ cfi: string; excerpt: string }>;
  unload(): void;
}

/** Internal rendition manager (not part of public API but needed for iframe access) */
export interface RenditionManager {
  container: HTMLElement;
}

/** Rendition with `manager` exposed for iframe access */
export interface RenditionWithManager {
  manager?: RenditionManager;
}

// Re-export for convenience
export type { Contents };
