/** Projector geometry in px on the 1920x1080 stage. */
export const FOOTER_HEIGHT = 110;
export const TICKER_HEIGHT = 40;

/** Scenes render inside this box, clear of the ticker, the footer and its progress hairline. */
export const SCENE_FRAME = { top: 100, left: 120, right: 120, bottom: FOOTER_HEIGHT + TICKER_HEIGHT + 40 } as const;
