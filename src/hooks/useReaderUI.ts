import { useCallback, useState } from 'react';

/**
 * Panel names used across readers.
 * Each reader uses a subset. Providing a union type ensures consistency.
 */
export type PanelName = 'annotations' | 'voice' | 'settings' | 'slider' | 'toc' | 'search';

export interface ReaderUIState {
  /** Whether the overlay toolbar/header is visible */
  showUI: boolean;
  /** Toggle overlay visibility */
  toggleUI: () => void;
  setShowUI: React.Dispatch<React.SetStateAction<boolean>>;

  /** Currently open panel (null = none) */
  activePanel: PanelName | null;
  /** Toggle a panel. If it's already open, close it. Otherwise open it and close any other. */
  togglePanel: (panel: PanelName) => void;
  /** Close whatever panel is open */
  closePanel: () => void;
  /** Check if a specific panel is open */
  isPanelOpen: (panel: PanelName) => boolean;

  /**
   * Cascade close — used by Escape key.
   * Closes panels first, then UI, then calls onClose (exit reader).
   * Returns true if something was closed (so the caller knows to stop propagation).
   */
  cascadeClose: (onClose: () => void, extras?: { selectionPopup?: boolean; clearSelection?: () => void; annotateMode?: boolean; clearAnnotateMode?: () => void; voiceAnnotationId?: string | null; clearVoiceAnnotation?: () => void }) => boolean;
}

/**
 * Shared UI state management for all readers.
 *
 * Replaces the pattern of 2-4 independent boolean states per reader
 * with a single `activePanel` value and automatic mutual exclusion.
 */
export function useReaderUI(): ReaderUIState {
  const [showUI, setShowUI] = useState(true);
  const [activePanel, setActivePanel] = useState<PanelName | null>(null);

  const toggleUI = useCallback(() => {
    setShowUI((s) => !s);
  }, []);

  const togglePanel = useCallback((panel: PanelName) => {
    setActivePanel((current) => (current === panel ? null : panel));
  }, []);

  const closePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  const isPanelOpen = useCallback((panel: PanelName) => {
    return activePanel === panel;
  }, [activePanel]);

  const cascadeClose = useCallback((
    onClose: () => void,
    extras?: {
      selectionPopup?: boolean;
      clearSelection?: () => void;
      annotateMode?: boolean;
      clearAnnotateMode?: () => void;
      voiceAnnotationId?: string | null;
      clearVoiceAnnotation?: () => void;
    },
  ): boolean => {
    // 1. Clear voice annotation link mode first
    if (extras?.voiceAnnotationId) {
      extras.clearVoiceAnnotation?.();
      return true;
    }
    // 2. Clear selection popup
    if (extras?.selectionPopup) {
      extras.clearSelection?.();
      return true;
    }
    // 3. Close annotate mode
    if (extras?.annotateMode) {
      extras.clearAnnotateMode?.();
      return true;
    }
    // 4. Close open panel
    if (activePanel !== null) {
      setActivePanel(null);
      return true;
    }
    // 5. Hide UI
    if (showUI) {
      setShowUI(false);
      return true;
    }
    // 6. Exit reader
    onClose();
    return true;
  }, [activePanel, showUI]);

  return {
    showUI,
    toggleUI,
    setShowUI,
    activePanel,
    togglePanel,
    closePanel,
    isPanelOpen,
    cascadeClose,
  };
}
