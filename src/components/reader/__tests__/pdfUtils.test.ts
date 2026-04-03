/**
 * Tests for pdfUtils — DOM-based highlight application and selection resolution.
 * We mock pdfjs-dist since these functions don't need the actual PDF library.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdfjs-dist so module-level import doesn't fail
vi.mock('pdfjs-dist', () => ({
  TextLayer: vi.fn(),
}));

import {
  applyHighlightsToTextLayer,
  resolveSelection,
} from '../pdfUtils';
import type { Annotation } from '@/types/annotation';

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'ann_1',
    position: { index: 1 },
    style: { color: 'yellow' },
    note: '',
    voiceIds: [],
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    ...overrides,
  };
}

function createTextLayerDiv(spanCount: number, role = true): HTMLDivElement {
  const div = document.createElement('div');
  for (let i = 0; i < spanCount; i++) {
    const span = document.createElement('span');
    if (role) span.setAttribute('role', 'presentation');
    span.textContent = `word${i}`;
    div.appendChild(span);
  }
  return div;
}

describe('applyHighlightsToTextLayer', () => {
  it('does nothing when highlights array is empty', () => {
    const div = createTextLayerDiv(3);
    applyHighlightsToTextLayer(div, []);
    const spans = div.querySelectorAll('span');
    spans.forEach((s) => {
      expect((s as HTMLElement).style.backgroundColor).toBe('');
    });
  });

  it('does nothing when container is null-like', () => {
    // Should not throw
    applyHighlightsToTextLayer(null as any, [makeAnnotation()]);
  });

  it('applies highlight to single span', () => {
    const div = createTextLayerDiv(5);
    const hl = makeAnnotation({
      textSelection: {
        text: 'word2',
        startItemIdx: 2,
        endItemIdx: 2,
      },
    });
    applyHighlightsToTextLayer(div, [hl]);

    const spans = div.querySelectorAll('span');
    // Only span index 2 should be highlighted
    expect((spans[2] as HTMLElement).style.backgroundColor).toBe('rgba(255, 255, 0, 0.35)');
    expect(spans[2].getAttribute('data-hl-id')).toBe('ann_1');
    // Others should not be highlighted
    expect((spans[0] as HTMLElement).style.backgroundColor).toBe('');
    expect((spans[1] as HTMLElement).style.backgroundColor).toBe('');
    expect((spans[3] as HTMLElement).style.backgroundColor).toBe('');
  });

  it('applies highlight across multiple spans', () => {
    const div = createTextLayerDiv(5);
    const hl = makeAnnotation({
      textSelection: {
        text: 'word1 word2 word3',
        startItemIdx: 1,
        endItemIdx: 3,
      },
    });
    applyHighlightsToTextLayer(div, [hl]);

    const spans = div.querySelectorAll('span');
    for (let i = 1; i <= 3; i++) {
      expect((spans[i] as HTMLElement).style.backgroundColor).toBe('rgba(255, 255, 0, 0.35)');
      expect(spans[i].getAttribute('data-hl-id')).toBe('ann_1');
    }
    expect((spans[0] as HTMLElement).style.backgroundColor).toBe('');
    expect((spans[4] as HTMLElement).style.backgroundColor).toBe('');
  });

  it('applies different colors for different highlights', () => {
    const div = createTextLayerDiv(5);
    const hl1 = makeAnnotation({
      id: 'ann_1',
      style: { color: 'yellow' },
      textSelection: { text: 'word0', startItemIdx: 0, endItemIdx: 0 },
    });
    const hl2 = makeAnnotation({
      id: 'ann_2',
      style: { color: 'blue' },
      textSelection: { text: 'word3', startItemIdx: 3, endItemIdx: 3 },
    });
    applyHighlightsToTextLayer(div, [hl1, hl2]);

    const spans = div.querySelectorAll('span');
    expect((spans[0] as HTMLElement).style.backgroundColor).toBe('rgba(255, 255, 0, 0.35)');
    expect(spans[0].getAttribute('data-hl-id')).toBe('ann_1');
    expect((spans[3] as HTMLElement).style.backgroundColor).toBe('rgba(66, 133, 244, 0.3)');
    expect(spans[3].getAttribute('data-hl-id')).toBe('ann_2');
  });

  it('clears previous highlights before applying new ones', () => {
    const div = createTextLayerDiv(3);
    const hl1 = makeAnnotation({
      textSelection: { text: 'word0', startItemIdx: 0, endItemIdx: 0 },
    });

    // First application
    applyHighlightsToTextLayer(div, [hl1]);
    const span0 = div.querySelectorAll('span')[0] as HTMLElement;
    expect(span0.getAttribute('data-hl-id')).toBe('ann_1');

    // Second application with different highlight
    const hl2 = makeAnnotation({
      id: 'ann_2',
      textSelection: { text: 'word2', startItemIdx: 2, endItemIdx: 2 },
    });
    applyHighlightsToTextLayer(div, [hl2]);

    // Old highlight should be cleared
    expect(span0.getAttribute('data-hl-id')).toBeNull();
    expect(span0.style.backgroundColor).toBe('');
    // New one applied
    const span2 = div.querySelectorAll('span')[2] as HTMLElement;
    expect(span2.getAttribute('data-hl-id')).toBe('ann_2');
  });

  it('falls back to all spans if no role=presentation spans', () => {
    const div = createTextLayerDiv(3, false); // no role attribute
    const hl = makeAnnotation({
      textSelection: { text: 'word1', startItemIdx: 1, endItemIdx: 1 },
    });
    applyHighlightsToTextLayer(div, [hl]);

    const spans = div.querySelectorAll('span');
    expect((spans[1] as HTMLElement).style.backgroundColor).toBe('rgba(255, 255, 0, 0.35)');
  });

  it('handles endItemIdx beyond span count gracefully', () => {
    const div = createTextLayerDiv(2);
    const hl = makeAnnotation({
      textSelection: { text: 'word0 word1 overflow', startItemIdx: 0, endItemIdx: 10 },
    });
    // Should not throw
    applyHighlightsToTextLayer(div, [hl]);

    const spans = div.querySelectorAll('span');
    expect((spans[0] as HTMLElement).style.backgroundColor).toBe('rgba(255, 255, 0, 0.35)');
    expect((spans[1] as HTMLElement).style.backgroundColor).toBe('rgba(255, 255, 0, 0.35)');
  });

  it('defaults to startItemIdx=0, endItemIdx=0 when textSelection is missing indices', () => {
    const div = createTextLayerDiv(3);
    const hl = makeAnnotation({
      textSelection: { text: 'word0' },
    });
    applyHighlightsToTextLayer(div, [hl]);

    const spans = div.querySelectorAll('span');
    expect((spans[0] as HTMLElement).style.backgroundColor).toBe('rgba(255, 255, 0, 0.35)');
    expect((spans[1] as HTMLElement).style.backgroundColor).toBe('');
  });

  it('sets border-radius on highlighted spans', () => {
    const div = createTextLayerDiv(3);
    const hl = makeAnnotation({
      textSelection: { text: 'word1', startItemIdx: 1, endItemIdx: 1 },
    });
    applyHighlightsToTextLayer(div, [hl]);

    const span = div.querySelectorAll('span')[1] as HTMLElement;
    expect(span.style.borderRadius).toBe('2px');
  });

  it('handles empty text layer (no spans at all)', () => {
    const div = document.createElement('div');
    const hl = makeAnnotation({
      textSelection: { text: 'test', startItemIdx: 0, endItemIdx: 0 },
    });
    // Should not throw
    applyHighlightsToTextLayer(div, [hl]);
  });
});

describe('resolveSelection', () => {
  let textLayerDiv: HTMLDivElement;
  let containerEl: HTMLDivElement;

  beforeEach(() => {
    // JSDOM doesn't implement Range.getBoundingClientRect, so polyfill it
    if (!Range.prototype.getBoundingClientRect) {
      Range.prototype.getBoundingClientRect = () => ({
        x: 0, y: 0, width: 100, height: 20,
        top: 0, right: 100, bottom: 20, left: 0,
        toJSON: () => ({}),
      });
    }

    textLayerDiv = createTextLayerDiv(5);
    containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    containerEl.appendChild(textLayerDiv);
  });

  it('returns null when selection has no ranges', () => {
    const sel = {
      rangeCount: 0,
      toString: () => '',
      getRangeAt: vi.fn(),
    } as unknown as Selection;

    const result = resolveSelection(sel, textLayerDiv, 1, containerEl);
    expect(result).toBeNull();
  });

  it('returns null when selected text is too short', () => {
    const range = document.createRange();
    const sel = {
      rangeCount: 1,
      toString: () => 'a', // less than 2 chars
      getRangeAt: () => range,
    } as unknown as Selection;

    const result = resolveSelection(sel, textLayerDiv, 1, containerEl);
    expect(result).toBeNull();
  });

  it('returns null when text layer has no spans', () => {
    const emptyDiv = document.createElement('div');
    const range = document.createRange();
    const sel = {
      rangeCount: 1,
      toString: () => 'some text',
      getRangeAt: () => range,
    } as unknown as Selection;

    const result = resolveSelection(sel, emptyDiv, 1, containerEl);
    expect(result).toBeNull();
  });

  it('returns SelectionInfo with correct page number', () => {
    const spans = textLayerDiv.querySelectorAll('span');
    const range = document.createRange();
    range.selectNodeContents(spans[2]);

    const sel = {
      rangeCount: 1,
      toString: () => 'word2',
      getRangeAt: () => range,
    } as unknown as Selection;

    const result = resolveSelection(sel, textLayerDiv, 5, containerEl);
    expect(result).not.toBeNull();
    expect(result!.page).toBe(5);
    expect(result!.text).toBe('word2');
  });

  it('resolves startItemIdx and endItemIdx from span intersection', () => {
    const spans = textLayerDiv.querySelectorAll('span');
    const range = document.createRange();
    range.setStart(spans[1].firstChild!, 0);
    range.setEnd(spans[3].firstChild!, 5);

    const sel = {
      rangeCount: 1,
      toString: () => 'word1 word2 word3',
      getRangeAt: () => range,
    } as unknown as Selection;

    const result = resolveSelection(sel, textLayerDiv, 1, containerEl);
    expect(result).not.toBeNull();
    expect(result!.startItemIdx).toBe(1);
    expect(result!.endItemIdx).toBe(3);
  });

  it('returns null when range does not intersect any spans', () => {
    const extraDiv = document.createElement('div');
    extraDiv.textContent = 'outside text';
    document.body.appendChild(extraDiv);

    const range = document.createRange();
    range.selectNodeContents(extraDiv);

    const sel = {
      rangeCount: 1,
      toString: () => 'outside text',
      getRangeAt: () => range,
    } as unknown as Selection;

    const result = resolveSelection(sel, textLayerDiv, 1, containerEl);
    expect(result).toBeNull();

    document.body.removeChild(extraDiv);
  });

  it('handles null containerEl gracefully', () => {
    const spans = textLayerDiv.querySelectorAll('span');
    const range = document.createRange();
    range.selectNodeContents(spans[0]);

    const sel = {
      rangeCount: 1,
      toString: () => 'word0',
      getRangeAt: () => range,
    } as unknown as Selection;

    const result = resolveSelection(sel, textLayerDiv, 1, null);
    expect(result).not.toBeNull();
    expect(result!.x).toBeDefined();
    expect(result!.y).toBeDefined();
  });

  it('falls back to all spans when no role=presentation spans exist', () => {
    const noRoleDiv = createTextLayerDiv(3, false);
    containerEl.appendChild(noRoleDiv);

    const spans = noRoleDiv.querySelectorAll('span');
    const range = document.createRange();
    range.selectNodeContents(spans[1]);

    const sel = {
      rangeCount: 1,
      toString: () => 'word1',
      getRangeAt: () => range,
    } as unknown as Selection;

    const result = resolveSelection(sel, noRoleDiv, 1, containerEl);
    expect(result).not.toBeNull();
    expect(result!.startItemIdx).toBe(1);
    expect(result!.endItemIdx).toBe(1);
  });
});
