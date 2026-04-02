/**
 * Tests for tap zone configuration and action resolution.
 */

import { describe, it, expect } from 'vitest';
import {
  ZONE_TOP_END,
  ZONE_BOTTOM_START,
  ZONE_MID_SPLIT,
  getTapZoneAction,
} from '../tapZones';

// Helper: create a DOMRect-like object
function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('tapZones constants', () => {
  it('ZONE_TOP_END is 0.2 (top 20%)', () => {
    expect(ZONE_TOP_END).toBe(0.2);
  });

  it('ZONE_BOTTOM_START is 0.8 (bottom 20%)', () => {
    expect(ZONE_BOTTOM_START).toBe(0.8);
  });

  it('ZONE_MID_SPLIT is 0.5 (50/50 left-right)', () => {
    expect(ZONE_MID_SPLIT).toBe(0.5);
  });
});

describe('getTapZoneAction', () => {
  // Use a 1000x1000 rect starting at (0,0) for easy math
  const rect = makeRect(0, 0, 1000, 1000);

  describe('top band (y < 20%) → toggle-ui', () => {
    it('returns toggle-ui for tap at y=0 (very top)', () => {
      expect(getTapZoneAction(500, 0, rect)).toBe('toggle-ui');
    });

    it('returns toggle-ui for tap at y=100 (10%)', () => {
      expect(getTapZoneAction(500, 100, rect)).toBe('toggle-ui');
    });

    it('returns toggle-ui for tap at y=199 (just under 20%)', () => {
      expect(getTapZoneAction(500, 199, rect)).toBe('toggle-ui');
    });
  });

  describe('bottom band (y > 80%) → toggle-ui', () => {
    it('returns toggle-ui for tap at y=999 (very bottom)', () => {
      expect(getTapZoneAction(500, 999, rect)).toBe('toggle-ui');
    });

    it('returns toggle-ui for tap at y=900 (90%)', () => {
      expect(getTapZoneAction(500, 900, rect)).toBe('toggle-ui');
    });

    it('returns toggle-ui for tap at y=801 (just over 80%)', () => {
      expect(getTapZoneAction(500, 801, rect)).toBe('toggle-ui');
    });
  });

  describe('middle band, left half → prev', () => {
    it('returns prev for tap at center-left (x=250, y=500)', () => {
      expect(getTapZoneAction(250, 500, rect)).toBe('prev');
    });

    it('returns prev for tap at far left (x=0, y=500)', () => {
      expect(getTapZoneAction(0, 500, rect)).toBe('prev');
    });

    it('returns prev for tap at x=499 (just under 50%)', () => {
      expect(getTapZoneAction(499, 500, rect)).toBe('prev');
    });
  });

  describe('middle band, right half → next', () => {
    it('returns next for tap at center-right (x=750, y=500)', () => {
      expect(getTapZoneAction(750, 500, rect)).toBe('next');
    });

    it('returns next for tap at far right (x=999, y=500)', () => {
      expect(getTapZoneAction(999, 500, rect)).toBe('next');
    });

    it('returns next for tap at x=500 (exactly 50%)', () => {
      expect(getTapZoneAction(500, 500, rect)).toBe('next');
    });
  });

  describe('boundary at y=200 (exactly 20%)', () => {
    it('returns nav action (not toggle-ui) at exact boundary', () => {
      // relY = 200/1000 = 0.2, which is NOT < 0.2, so it's in nav zone
      const action = getTapZoneAction(250, 200, rect);
      expect(action).toBe('prev');
    });
  });

  describe('boundary at y=800 (exactly 80%)', () => {
    it('returns nav action (not toggle-ui) at exact boundary', () => {
      // relY = 800/1000 = 0.8, which is NOT > 0.8, so it's in nav zone
      const action = getTapZoneAction(750, 800, rect);
      expect(action).toBe('next');
    });
  });

  describe('offset rect (not at origin)', () => {
    const offsetRect = makeRect(100, 200, 800, 600);

    it('handles rect not at origin — top band', () => {
      // y=220, relY = (220 - 200) / 600 = 0.033 → toggle-ui
      expect(getTapZoneAction(500, 220, offsetRect)).toBe('toggle-ui');
    });

    it('handles rect not at origin — middle left', () => {
      // y=500, relY = (500 - 200) / 600 = 0.5 → nav zone
      // x=300, relX = (300 - 100) / 800 = 0.25 → prev
      expect(getTapZoneAction(300, 500, offsetRect)).toBe('prev');
    });

    it('handles rect not at origin — middle right', () => {
      // x=600, relX = (600 - 100) / 800 = 0.625 → next
      expect(getTapZoneAction(600, 500, offsetRect)).toBe('next');
    });

    it('handles rect not at origin — bottom band', () => {
      // y=790, relY = (790 - 200) / 600 = 0.983 → toggle-ui
      expect(getTapZoneAction(500, 790, offsetRect)).toBe('toggle-ui');
    });
  });
});
