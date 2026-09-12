import type { PaperTypographyConfig } from '../types';

export const DEFAULT_TYPOGRAPHY: PaperTypographyConfig = {
    fontFamily: 'sans',
    fontSize: 'base',
    bionicReading: false
};

const STORAGE_KEY = 'sully_paper_typography';

export function getSavedTypography(): PaperTypographyConfig {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return { ...DEFAULT_TYPOGRAPHY, ...JSON.parse(saved) };
        }
    } catch {}
    return DEFAULT_TYPOGRAPHY;
}

export function saveTypography(config: PaperTypographyConfig) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {}
}

let dyslexicLoaded = false;
export function loadOpenDyslexicFont() {
    if (dyslexicLoaded || typeof document === 'undefined') return;
    dyslexicLoaded = true;

    const styleId = 'opendyslexic-font-face';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        @font-face {
            font-family: 'OpenDyslexic';
            src: url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Regular.woff') format('woff');
            font-weight: 400;
            font-style: normal;
            font-display: swap;
        }
        @font-face {
            font-family: 'OpenDyslexic';
            src: url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Bold.woff') format('woff');
            font-weight: 700;
            font-style: normal;
            font-display: swap;
        }
    `;
    document.head.appendChild(style);
}

export function getFontFamilyStyle(fontFamily: PaperTypographyConfig['fontFamily']): string {
    switch (fontFamily) {
        case 'serif':
            return 'Georgia, Cambria, "Times New Roman", Times, "Songti SC", serif';
        case 'mono':
            return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        case 'dyslexic':
            loadOpenDyslexicFont();
            return '"OpenDyslexic", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif';
        case 'sans':
        default:
            return 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif';
    }
}

export function getFontSizeClasses(size: PaperTypographyConfig['fontSize']): {
    text: string;
    leading: string;
} {
    switch (size) {
        case 'sm':
            return { text: 'text-[13px] sm:text-sm', leading: 'leading-relaxed' };
        case 'lg':
            return { text: 'text-base sm:text-lg', leading: 'leading-loose' };
        case 'xl':
            return { text: 'text-lg sm:text-xl', leading: 'leading-[2.1]' };
        case 'base':
        default:
            return { text: 'text-[15px] sm:text-base', leading: 'leading-relaxed' };
    }
}
