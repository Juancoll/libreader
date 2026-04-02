import { useEffect, useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { FSAdapter } from '@/services/vaultParser';
import { HIGHLIGHT_COLORS, isBookmark as isBookmarkAnnotation } from '@/types/annotation';
import type { Annotation, HighlightColor } from '@/types/annotation';
import { toBookmarkEntries, toHighlightEntries } from '@/services/annotationService';
import { writeAllReadingData } from '@/services/annotationWriter';
import { useReaderUI } from '@/hooks/useReaderUI';
import { useReaderKeyboard } from '@/hooks/useReaderKeyboard';
import { useAnnotations } from '@/hooks/useAnnotations';
import { AnnotationPopup } from './AnnotationPopup';
import { AnnotationsPanel } from './AnnotationsPanel';
import { VoiceCommentsPanel, MicButtonIcon } from './VoiceCommentsPanel';

interface MarkdownViewerProps {
  filePath: string;
  fs: FSAdapter;
  onClose?: () => void;
}

interface MdSelectionInfo {
  text: string;
  startOffset: number;
  endOffset: number;
  x: number;
  y: number;
}

export function MarkdownViewer({ filePath, fs, onClose }: MarkdownViewerProps) {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ui = useReaderUI();
  const articleRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Annotations (shared hook)
  const ann = useAnnotations(filePath);
  const { annotations, bookmarks, highlights } = ann;
  const [selectionPopup, setSelectionPopup] = useState<MdSelectionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        const text = await fs.readFile(filePath);
        if (cancelled) return;

        // Remove YAML frontmatter for rendering
        const cleaned = text.replace(/^---\n[\s\S]*?\n---\n?/, '');

        // Convert Obsidian wikilinks to markdown links
        const withLinks = cleaned.replace(
          /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
          (_match, target, alias) => `**${alias || target}**`
        );

        // Convert Obsidian embeds ![[image.png]] to img tags
        const withImages = withLinks.replace(
          /!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|svg))\]\]/gi,
          (_match, filename) => `![${filename}](${filename})`
        );

        setContent(withImages);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar la nota');
          setIsLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [filePath, fs]);

  // ---- Text offset resolution ----
  // Walk text nodes in the article to compute character offsets relative to the full text content.
  const resolveSelectionOffsets = useCallback((selection: Selection): MdSelectionInfo | null => {
    const article = articleRef.current;
    if (!article || !selection.rangeCount) return null;

    const text = selection.toString().trim();
    if (text.length < 2) return null;

    const range = selection.getRangeAt(0);

    // Walk all text nodes to compute start and end character offsets
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    let charOffset = 0;
    let startOffset = -1;
    let endOffset = -1;
    let node: Text | null;

    while ((node = walker.nextNode() as Text | null)) {
      const nodeLen = node.textContent?.length || 0;

      // Check if range start is in this node
      if (node === range.startContainer) {
        startOffset = charOffset + range.startOffset;
      }
      // Check if range end is in this node
      if (node === range.endContainer) {
        endOffset = charOffset + range.endOffset;
      }

      charOffset += nodeLen;
    }

    if (startOffset === -1 || endOffset === -1 || startOffset >= endOffset) return null;

    // Position for popup
    const rect = range.getBoundingClientRect();
    const containerRect = contentRef.current?.getBoundingClientRect() || { left: 0, top: 0 };

    return {
      text,
      startOffset,
      endOffset,
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 10,
    };
  }, []);

  // ---- Handle mouseup for text selection ----
  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.toString().trim().length < 2) return;

    const info = resolveSelectionOffsets(sel);
    if (info) setSelectionPopup(info);
  }, [resolveSelectionOffsets]);

  // ---- Highlight actions ----
  const addHighlightFromSelection = useCallback((sel: MdSelectionInfo, color: HighlightColor) => {
    const totalLen = articleRef.current?.textContent?.length || 1;
    const fraction = sel.startOffset / totalLen;
    ann.addHighlight({
      position: { fraction },
      textSelection: {
        text: sel.text,
        startOffset: sel.startOffset,
        endOffset: sel.endOffset,
      },
      color,
      chapter: 'Nota',
    });
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
  }, [ann]);

  const removeHighlightAction = useCallback((annotationId: string) => {
    ann.removeHighlight(annotationId);
  }, [ann]);

  // Bookmark at current scroll position
  const addBookmarkAction = useCallback(() => {
    const container = contentRef.current;
    if (!container) return;
    const scrollFraction = container.scrollTop / (container.scrollHeight - container.clientHeight || 1);
    if (bookmarks.some((b) => Math.abs((b.position.fraction ?? 0) - scrollFraction) < 0.01)) return;
    ann.addBookmark({ fraction: scrollFraction }, 'Nota');
  }, [ann, bookmarks]);

  const removeBookmarkAction = useCallback((annotationId: string) => {
    ann.removeBookmark(annotationId);
  }, [ann]);

  // Voice-annotation linking (delegated to hook)
  const handleAutoCreateAnnotation = useCallback((voiceId: string) => {
    const container = contentRef.current;
    const scrollFraction = container
      ? container.scrollTop / (container.scrollHeight - container.clientHeight || 1)
      : 0;
    ann.autoCreateForVoice(voiceId, { fraction: scrollFraction }, 'Nota');
  }, [ann]);

  // ---- Apply highlights to rendered content ----
  useEffect(() => {
    const article = articleRef.current;
    if (!article || highlights.length === 0) return;

    // Clear any previous highlights
    article.querySelectorAll('[data-md-hl]').forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
    });
    // Merge adjacent text nodes that were split by previous highlighting
    article.normalize();

    // Sort highlights by startOffset (descending so we process from end to start
    // to avoid offset shifts)
    const sorted = [...highlights]
      .filter((h) => h.textSelection?.startOffset != null && h.textSelection?.endOffset != null)
      .sort((a, b) => (b.textSelection!.startOffset! - a.textSelection!.startOffset!));

    for (const hl of sorted) {
      const start = hl.textSelection!.startOffset!;
      const end = hl.textSelection!.endOffset!;
      highlightRange(article, start, end, hl.style.color, hl.id);
    }
  }, [highlights, content, isLoading]);

  // Save to vault on close
  const saveToVault = useCallback(async () => {
    try {
      const container = contentRef.current;
      const scrollFraction = container
        ? container.scrollTop / (container.scrollHeight - container.clientHeight || 1)
        : 0;

      await writeAllReadingData(fs, filePath, {
        state: {
          file: filePath.split('/').pop() || filePath,
          format: 'md',
          currentPage: 0,
          totalPages: 0,
          progress: scrollFraction,
          lastRead: new Date().toISOString(),
        },
        bookmarks: toBookmarkEntries(annotations, 1),
        highlights: toHighlightEntries(annotations),
      });
    } catch (err) {
      console.warn('Failed to save MD reading state to vault:', err);
    }
  }, [fs, filePath, annotations]);

  const handleClose = useCallback(async () => {
    await saveToVault();
    onClose?.();
  }, [saveToVault, onClose]);

  // Navigate to highlight by scrolling
  const handleNavigate = useCallback((ann: Annotation) => {
    const article = articleRef.current;
    const container = contentRef.current;
    if (!article || !container) return;

    if (ann.textSelection?.startOffset != null) {
      // Find the highlight mark in DOM
      const mark = article.querySelector(`[data-md-hl="${ann.id}"]`);
      if (mark) {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    // Bookmark: scroll to fraction
    if (ann.position.fraction != null) {
      const scrollTarget = ann.position.fraction * (container.scrollHeight - container.clientHeight);
      container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    }
  }, []);

  // Keyboard
  useReaderKeyboard({
    escape: () => ui.cascadeClose(handleClose, {
      selectionPopup: !!selectionPopup,
      clearSelection: () => setSelectionPopup(null),
    }),
    bookmark: addBookmarkAction,
  });

  const title = filePath.split('/').pop()?.replace('.md', '') || 'Nota';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors"
              title="Cerrar (Esc)"
            >
              <svg className="w-5 h-5 text-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          <h2 className="text-sm font-semibold text-text truncate max-w-[50vw]">{title}</h2>
        </div>

        <div className="flex items-center gap-1">
          {/* Bookmark */}
          <button
            onClick={addBookmarkAction}
            className="p-2 rounded-lg text-text-secondary hover:bg-surface-hover transition-colors"
            title="Marcador (B)"
          >
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          {/* Annotations panel toggle */}
          <button
            onClick={() => ui.togglePanel('annotations')}
            className={`p-2 rounded-lg transition-colors ${ui.isPanelOpen('annotations') ? 'bg-primary/20' : 'hover:bg-surface-hover'}`}
            title="Anotaciones"
          >
            <svg className="w-4.5 h-4.5 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </button>

          {/* Voice panel toggle */}
          <button
            onClick={() => ui.togglePanel('voice')}
            className={`p-2 rounded-lg transition-colors ${ui.isPanelOpen('voice') ? 'bg-primary/20' : 'hover:bg-surface-hover'}`}
            title="Comentarios de voz"
          >
            <MicButtonIcon size={18} />
          </button>
        </div>
      </header>

      {/* Content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Annotations sidebar */}
        {ui.isPanelOpen('annotations') && (
          <AnnotationsPanel
            annotations={annotations}
            onNavigate={handleNavigate}
            onDelete={(id) => {
              const ann = annotations.find((a) => a.id === id);
              if (ann && !isBookmarkAnnotation(ann)) {
                removeHighlightAction(id);
              } else {
                removeBookmarkAction(id);
              }
            }}
            onEditNote={(id, note) => {
              ann.updateNote(id, note);
            }}
            formatBookmarkLocation={(ann) => ({
              title: 'Nota',
              detail: ann.position.fraction != null
                ? `${Math.round(ann.position.fraction * 100)}%`
                : undefined,
            })}
            formatHighlightLocation={() => 'Nota'}
            fs={fs}
            filePath={filePath}
            currentLocation={`scroll:${Math.round((contentRef.current ? contentRef.current.scrollTop / (contentRef.current.scrollHeight - contentRef.current.clientHeight || 1) : 0) * 100)}%`}
            onVoiceLinked={ann.voiceLinked}
            onVoiceUnlinked={ann.voiceUnlinked}
          />
        )}

        {/* Voice comments sidebar */}
        {ui.isPanelOpen('voice') && (
          <aside className="w-80 border-r border-border overflow-y-auto shrink-0 bg-surface">
            <VoiceCommentsPanel
              fs={fs}
              filePath={filePath}
              currentLocation={`scroll:${Math.round((contentRef.current ? contentRef.current.scrollTop / (contentRef.current.scrollHeight - contentRef.current.clientHeight || 1) : 0) * 100)}%`}
              variant="panel"
              onVoiceLinked={ann.voiceLinked}
              onVoiceUnlinked={ann.voiceUnlinked}
              onAutoCreateAnnotation={handleAutoCreateAnnotation}
            />
          </aside>
        )}

        {/* Main content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-4 lg:p-8 relative" onMouseUp={handleMouseUp}>
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-danger/10 text-danger text-sm">
              {error}
            </div>
          )}

          {!isLoading && !error && (
            <article
              ref={articleRef}
              className="prose prose-slate dark:prose-invert max-w-none
                [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-text [&_h1]:mt-8 [&_h1]:mb-4
                [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-text [&_h2]:mt-6 [&_h2]:mb-3
                [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-text [&_h3]:mt-4 [&_h3]:mb-2
                [&_p]:text-text-secondary [&_p]:mb-4 [&_p]:leading-relaxed
                [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:text-text-secondary
                [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_ol]:text-text-secondary
                [&_li]:mb-1
                [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-text-muted [&_blockquote]:my-4
                [&_code]:bg-surface-alt [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono
                [&_pre]:bg-surface-alt [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-4
                [&_a]:text-primary [&_a]:underline
                [&_table]:w-full [&_table]:border-collapse [&_table]:my-4
                [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:bg-surface-alt [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold
                [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-sm
                [&_hr]:border-border [&_hr]:my-6
                [&_img]:rounded-lg [&_img]:max-w-full [&_img]:my-4
                [&_strong]:text-text [&_strong]:font-semibold
              "
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
              >
                {content}
              </ReactMarkdown>
            </article>
          )}

          {/* Selection popup */}
          {selectionPopup && (
            <AnnotationPopup
              x={selectionPopup.x}
              y={selectionPopup.y}
              onHighlight={(color) => addHighlightFromSelection(selectionPopup, color)}
              onDismiss={() => { setSelectionPopup(null); window.getSelection()?.removeAllRanges(); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Highlight rendering helper ----

/**
 * Walk text nodes in the container and wrap the character range [start, end)
 * with a <mark> element.
 */
function highlightRange(
  container: HTMLElement,
  start: number,
  end: number,
  color: HighlightColor,
  id: string,
) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let charOffset = 0;
  let node: Text | null;

  // Collect text nodes that overlap with [start, end)
  const nodesToWrap: { node: Text; nodeStart: number; nodeEnd: number }[] = [];

  while ((node = walker.nextNode() as Text | null)) {
    const nodeLen = node.textContent?.length || 0;
    const nodeStart = charOffset;
    const nodeEnd = charOffset + nodeLen;

    // Check overlap
    if (nodeEnd > start && nodeStart < end) {
      nodesToWrap.push({
        node,
        nodeStart: Math.max(start - charOffset, 0),
        nodeEnd: Math.min(end - charOffset, nodeLen),
      });
    }

    charOffset += nodeLen;
    if (charOffset >= end) break;
  }

  // Wrap each overlapping text node segment
  for (const { node: textNode, nodeStart, nodeEnd } of nodesToWrap) {
    const text = textNode.textContent || '';
    if (nodeStart === 0 && nodeEnd === text.length) {
      // Wrap entire node
      const mark = document.createElement('mark');
      mark.setAttribute('data-md-hl', id);
      mark.style.backgroundColor = HIGHLIGHT_COLORS[color].fill;
      mark.style.borderRadius = '2px';
      mark.style.padding = '0 1px';
      textNode.parentNode?.replaceChild(mark, textNode);
      mark.appendChild(textNode);
    } else {
      // Split and wrap partial
      const before = text.slice(0, nodeStart);
      const middle = text.slice(nodeStart, nodeEnd);
      const after = text.slice(nodeEnd);

      const parent = textNode.parentNode;
      if (!parent) continue;

      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));

      const mark = document.createElement('mark');
      mark.setAttribute('data-md-hl', id);
      mark.style.backgroundColor = HIGHLIGHT_COLORS[color].fill;
      mark.style.borderRadius = '2px';
      mark.style.padding = '0 1px';
      mark.appendChild(document.createTextNode(middle));
      frag.appendChild(mark);

      if (after) frag.appendChild(document.createTextNode(after));

      parent.replaceChild(frag, textNode);
    }
  }
}
