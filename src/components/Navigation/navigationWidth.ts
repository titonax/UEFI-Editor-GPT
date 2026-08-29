export const MIN_NAVIGATION_WIDTH = 200;
export const MAX_NAVIGATION_WIDTH = 1200;
export const MIN_CONTENT_WIDTH = 360;
export const NAVIGATION_WIDTH_STEP = 24;
export const NAVIGATION_WIDTH_STORAGE_KEY = "uefi-editor.navigation-width";

export function defaultNavigationWidth(viewportWidth: number) {
  if (viewportWidth >= 1200) return 360;
  if (viewportWidth >= 992) return 320;
  if (viewportWidth >= 768) return 280;
  if (viewportWidth >= 576) return 240;
  return 220;
}

export function maxNavigationWidth(viewportWidth: number) {
  return Math.max(
    MIN_NAVIGATION_WIDTH,
    Math.min(MAX_NAVIGATION_WIDTH, viewportWidth - MIN_CONTENT_WIDTH),
  );
}

export function clampNavigationWidth(value: number, viewportWidth: number) {
  const fallback = defaultNavigationWidth(viewportWidth);
  const normalized = Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(
    Math.max(normalized, MIN_NAVIGATION_WIDTH),
    maxNavigationWidth(viewportWidth),
  );
}

export function storedNavigationWidth(value: string | null, viewportWidth: number) {
  if (value === null || value.trim().length === 0) {
    return defaultNavigationWidth(viewportWidth);
  }
  return clampNavigationWidth(Number(value), viewportWidth);
}
