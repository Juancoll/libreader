/**
 * Tap zone configuration for all readers (Comic, PDF, EPUB).
 *
 * Layout (3 horizontal bands):
 *
 *   ┌──────────────────────┐
 *   │    TOGGLE UI (top)   │  top 20%
 *   ├───────────┬──────────┤
 *   │           │          │
 *   │  PREVIOUS │   NEXT   │  middle 60%
 *   │           │          │
 *   ├───────────┴──────────┤
 *   │   TOGGLE UI (bottom) │  bottom 20%
 *   └──────────────────────┘
 *
 * - Top / bottom bands toggle the overlay menu (header + footer).
 * - Middle band is split 50/50 horizontally: left = previous, right = next.
 *
 * To change proportions, adjust ZONE_TOP_END and ZONE_BOTTOM_START.
 * To change the prev/next split point, adjust ZONE_MID_SPLIT.
 */

/** Y-fraction where the top "toggle UI" band ends and the nav band begins. */
export const ZONE_TOP_END = 0.2;

/** Y-fraction where the nav band ends and the bottom "toggle UI" band begins. */
export const ZONE_BOTTOM_START = 0.8;

/** X-fraction that splits the middle nav band into previous (left) and next (right). */
export const ZONE_MID_SPLIT = 0.5;

export type TapZoneAction = 'prev' | 'next' | 'toggle-ui';

/**
 * Determine which action a tap at (clientX, clientY) should trigger,
 * given the bounding rect of the reader container.
 */
export function getTapZoneAction(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): TapZoneAction {
  const relY = (clientY - rect.top) / rect.height;

  // Top or bottom band → toggle UI
  if (relY < ZONE_TOP_END || relY > ZONE_BOTTOM_START) {
    return 'toggle-ui';
  }

  // Middle band → prev / next based on horizontal position
  const relX = (clientX - rect.left) / rect.width;
  return relX < ZONE_MID_SPLIT ? 'prev' : 'next';
}
