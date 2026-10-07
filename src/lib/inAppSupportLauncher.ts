export const IN_APP_SUPPORT_FAB_SIZE_PX = 64;
export const IN_APP_SUPPORT_PANEL_WIDTH_PX = 400;
const FAB_PANEL_GAP_PX = 12;

/** Keep the launcher clear of student/parent bottom tab bars and safe areas. */
export function inAppSupportLauncherInsets(pathname: string) {
  const hasBottomNav = /^\/(student|parent)\//.test(pathname);
  const basePx = hasBottomNav ? 76 : 16;
  const stackPx = basePx + IN_APP_SUPPORT_FAB_SIZE_PX + FAB_PANEL_GAP_PX;

  return {
    hasBottomNav,
    fabBottom: `calc(${basePx}px + env(safe-area-inset-bottom, 0px))`,
    panelBottom: `calc(${stackPx}px + env(safe-area-inset-bottom, 0px))`,
    panelMaxHeight: `min(${hasBottomNav ? 560 : 680}px, calc(100dvh - ${stackPx + 16}px - env(safe-area-inset-bottom, 0px)))`,
  };
}
