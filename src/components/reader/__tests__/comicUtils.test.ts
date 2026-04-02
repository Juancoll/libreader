/**
 * Tests for comic utility functions.
 */

import { describe, it, expect } from 'vitest';
import { getImageContentRect, findImgElement } from '../comicUtils';

// ---- Helpers to mock HTMLImageElement and DOMRect ----

function makeMockImg(opts: {
  boxLeft: number;
  boxTop: number;
  boxWidth: number;
  boxHeight: number;
  naturalWidth: number;
  naturalHeight: number;
}): HTMLImageElement {
  const img = document.createElement('img');
  Object.defineProperty(img, 'naturalWidth', { value: opts.naturalWidth });
  Object.defineProperty(img, 'naturalHeight', { value: opts.naturalHeight });
  // Override getBoundingClientRect
  img.getBoundingClientRect = () =>
    new DOMRect(opts.boxLeft, opts.boxTop, opts.boxWidth, opts.boxHeight);
  return img;
}

describe('getImageContentRect', () => {
  it('returns full box when image fits perfectly (same aspect ratio)', () => {
    const img = makeMockImg({
      boxLeft: 0, boxTop: 0, boxWidth: 800, boxHeight: 600,
      naturalWidth: 800, naturalHeight: 600,
    });
    const rect = getImageContentRect(img);
    expect(rect.left).toBeCloseTo(0);
    expect(rect.top).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(800);
    expect(rect.height).toBeCloseTo(600);
  });

  it('computes letterbox (bars top/bottom) for wider image', () => {
    // Natural: 1600x900 (16:9), Box: 800x800 (1:1)
    // Image is wider → content fills width, bars top/bottom
    const img = makeMockImg({
      boxLeft: 0, boxTop: 0, boxWidth: 800, boxHeight: 800,
      naturalWidth: 1600, naturalHeight: 900,
    });
    const rect = getImageContentRect(img);
    // contentW = 800, contentH = 800 / (1600/900) = 450
    expect(rect.width).toBeCloseTo(800);
    expect(rect.height).toBeCloseTo(450);
    // Centered vertically: offsetY = (800 - 450) / 2 = 175
    expect(rect.left).toBeCloseTo(0);
    expect(rect.top).toBeCloseTo(175);
  });

  it('computes pillarbox (bars left/right) for taller image', () => {
    // Natural: 600x1200 (1:2), Box: 800x800 (1:1)
    // Image is taller → content fills height, bars left/right
    const img = makeMockImg({
      boxLeft: 0, boxTop: 0, boxWidth: 800, boxHeight: 800,
      naturalWidth: 600, naturalHeight: 1200,
    });
    const rect = getImageContentRect(img);
    // contentH = 800, contentW = 800 * (600/1200) = 400
    expect(rect.height).toBeCloseTo(800);
    expect(rect.width).toBeCloseTo(400);
    // Centered horizontally: offsetX = (800 - 400) / 2 = 200
    expect(rect.left).toBeCloseTo(200);
    expect(rect.top).toBeCloseTo(0);
  });

  it('handles offset box (not at origin)', () => {
    const img = makeMockImg({
      boxLeft: 100, boxTop: 50, boxWidth: 800, boxHeight: 800,
      naturalWidth: 1600, naturalHeight: 900,
    });
    const rect = getImageContentRect(img);
    // Same as letterbox case but offset
    expect(rect.width).toBeCloseTo(800);
    expect(rect.height).toBeCloseTo(450);
    expect(rect.left).toBeCloseTo(100); // boxLeft + 0
    expect(rect.top).toBeCloseTo(225); // boxTop(50) + offsetY(175)
  });

  it('returns full box when naturalWidth is 0 (not loaded)', () => {
    const img = makeMockImg({
      boxLeft: 10, boxTop: 20, boxWidth: 300, boxHeight: 200,
      naturalWidth: 0, naturalHeight: 0,
    });
    const rect = getImageContentRect(img);
    expect(rect.left).toBe(10);
    expect(rect.top).toBe(20);
    expect(rect.width).toBe(300);
    expect(rect.height).toBe(200);
  });

  it('handles square image in non-square box (landscape box)', () => {
    // Natural: 500x500 (1:1), Box: 1000x500 (2:1)
    // Image is taller relative to box → pillarbox
    const img = makeMockImg({
      boxLeft: 0, boxTop: 0, boxWidth: 1000, boxHeight: 500,
      naturalWidth: 500, naturalHeight: 500,
    });
    const rect = getImageContentRect(img);
    // imgAspect=1, boxAspect=2 → imgAspect < boxAspect → pillarbox
    // contentH = 500, contentW = 500
    expect(rect.width).toBeCloseTo(500);
    expect(rect.height).toBeCloseTo(500);
    // offsetX = (1000 - 500) / 2 = 250
    expect(rect.left).toBeCloseTo(250);
    expect(rect.top).toBeCloseTo(0);
  });

  it('handles square image in non-square box (portrait box)', () => {
    // Natural: 500x500 (1:1), Box: 500x1000 (0.5:1)
    // Image is wider relative to box → letterbox
    const img = makeMockImg({
      boxLeft: 0, boxTop: 0, boxWidth: 500, boxHeight: 1000,
      naturalWidth: 500, naturalHeight: 500,
    });
    const rect = getImageContentRect(img);
    // imgAspect=1, boxAspect=0.5 → imgAspect > boxAspect → letterbox
    // contentW = 500, contentH = 500
    expect(rect.width).toBeCloseTo(500);
    expect(rect.height).toBeCloseTo(500);
    // offsetY = (1000 - 500) / 2 = 250
    expect(rect.left).toBeCloseTo(0);
    expect(rect.top).toBeCloseTo(250);
  });
});

describe('findImgElement', () => {
  it('finds the first img child', () => {
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.src = 'test.png';
    div.appendChild(img);
    expect(findImgElement(div)).toBe(img);
  });

  it('returns null when no img exists', () => {
    const div = document.createElement('div');
    div.innerHTML = '<span>no image here</span>';
    expect(findImgElement(div)).toBeNull();
  });

  it('finds nested img', () => {
    const div = document.createElement('div');
    div.innerHTML = '<div><div><img src="nested.png" /></div></div>';
    const img = div.querySelector('img');
    expect(findImgElement(div)).toBe(img);
  });

  it('returns first img when multiple exist', () => {
    const div = document.createElement('div');
    div.innerHTML = '<img src="first.png" /><img src="second.png" />';
    const firstImg = div.querySelector('img');
    expect(findImgElement(div)).toBe(firstImg);
  });
});
