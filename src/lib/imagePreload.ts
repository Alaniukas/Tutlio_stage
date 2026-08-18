const warmedImagePaths = new Set<string>();
const warmingImages = new Map<string, HTMLImageElement>();

/** Warm images for the next UI step at low priority and reuse the browser cache on navigation. */
export function preloadImages(paths: readonly string[]) {
  if (typeof Image === 'undefined') return;

  for (const path of paths) {
    if (!path || warmedImagePaths.has(path)) continue;

    warmedImagePaths.add(path);
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.onload = image.onerror = () => warmingImages.delete(path);
    warmingImages.set(path, image);
    image.src = path;
  }
}
