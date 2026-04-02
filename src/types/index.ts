// Types for the LibReader application
// Maps to Obsidian vault structure

export type FileFormat = 'epub' | 'pdf' | 'cbz' | 'cbr' | 'md' | 'youtube';
export type ReadingStatus = 'to-read' | 'reading' | 'finished' | 'abandoned';

/** A configured folder in the vault that contains library items. */
export interface VaultFolder {
  /** Display name for the folder (e.g. "Libros", "Comics") */
  name: string;
  /** Relative path from vault root (e.g. "books", "comics") */
  path: string;
  /** Show this folder as its own section in the sidebar menu */
  showInMenu: boolean;
  /** Include items from this folder in the main library view */
  showInLibrary: boolean;
}

export interface LibraryItem {
  /** Unique ID derived from vault path */
  id: string;
  title: string;
  subtitle?: string;
  cover?: string;
  year?: string;
  authors: string[];
  isbn?: string;
  publisher?: string;
  language?: string;
  pages?: number;
  status: ReadingStatus;
  rating?: number;
  dateStarted?: string;
  dateFinished?: string;
  tags: string[];
  formats: FileFormat[];
  /** Path to the item's directory in the vault */
  vaultPath: string;
  /** Path to the main .md note */
  notePath: string;
  /** Paths to the actual readable files (epub, pdf, cbz, cbr) */
  filePaths: Record<FileFormat, string>;
  /** Reading progress 0-100 */
  progress?: number;
  /** Number of annotations/highlights */
  annotationCount?: number;
  /** Name of the vault folder this item belongs to (e.g. "Libros") */
  folder?: string;
  /** ISO date of last reading session (from state.json) */
  lastRead?: string;
}

export interface VaultConfig {
  path: string;
  /** Dynamic list of content folders in the vault */
  folders: VaultFolder[];
}

export interface LibraryFilter {
  status?: ReadingStatus[];
  tags?: string[];
  authors?: string[];
  formats?: FileFormat[];
  /** Filter by vault folder name */
  folders?: string[];
  search?: string;
  language?: string;
}

export type SortField = 'title' | 'author' | 'year' | 'rating' | 'dateStarted' | 'progress' | 'lastRead';
export type SortDirection = 'asc' | 'desc';

export interface LibrarySort {
  field: SortField;
  direction: SortDirection;
}

export type ViewMode = 'grid' | 'list';
