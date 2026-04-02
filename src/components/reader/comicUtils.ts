// ---- Image content bounds (object-fit: contain precision) ----

/**
 * Given an <img> element with object-fit: contain, compute the actual rendered
 * content rectangle in client coordinates. The img element's layout box may be
 * larger than the visible content due to letterboxing/pillarboxing.
 *
 * Returns { left, top, width, height } in client (viewport) coordinates,
 * matching the area where pixels are actually rendered.
 */
export function getImageContentRect(img: HTMLImageElement): DOMRect {
  const box = img.getBoundingClientRect();
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;

  // If dimensions not loaded yet, fall back to full box
  if (!nw || !nh) return box;

  const imgAspect = nw / nh;
  const boxAspect = box.width / box.height;

  let contentW: number, contentH: number;
  if (imgAspect > boxAspect) {
    // Image is wider relative to box -> bars top/bottom
    contentW = box.width;
    contentH = box.width / imgAspect;
  } else {
    // Image is taller relative to box -> bars left/right
    contentH = box.height;
    contentW = box.height * imgAspect;
  }

  const offsetX = (box.width - contentW) / 2;
  const offsetY = (box.height - contentH) / 2;

  return new DOMRect(
    box.left + offsetX,
    box.top + offsetY,
    contentW,
    contentH,
  );
}

/**
 * Find the first <img> child within a container element.
 */
export function findImgElement(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector('img');
}
