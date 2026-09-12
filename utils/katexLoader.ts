import { useState, useEffect } from 'react';

export type KatexLike = {
    renderToString: (latex: string, options?: any) => string;
};

// 国内与海外高可用 CDN 镜像链（优先国内高速镜像，治好手机弱网/移动蜂窝下加载失败）
const KATEX_JS_MIRRORS = [
    'https://npm.elemecdn.com/katex@0.16.11/dist/katex.min.js',
    'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.js',
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
    'https://unpkg.com/katex@0.16.11/dist/katex.min.js',
];

const KATEX_CSS_MIRRORS = [
    'https://npm.elemecdn.com/katex@0.16.11/dist/katex.min.css',
    'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.css',
    'https://unpkg.com/katex@0.16.11/dist/katex.min.css',
];

let katexPromise: Promise<KatexLike> | null = null;
let cssInjected = false;

/** 保证 KaTeX 样式表加载（带镜像自动轮换） */
export function ensureKatexCss(): void {
    if (typeof document === 'undefined' || cssInjected) return;
    if (document.querySelector('link[data-katex-css]')) {
        cssInjected = true;
        return;
    }

    cssInjected = true;
    let mirrorIdx = 0;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.katexCss = 'true';
    link.href = KATEX_CSS_MIRRORS[0];
    link.onerror = () => {
        mirrorIdx++;
        if (mirrorIdx < KATEX_CSS_MIRRORS.length) {
            link.href = KATEX_CSS_MIRRORS[mirrorIdx];
        }
    };
    document.head.appendChild(link);
}

const loadSingleScript = (src: string): Promise<void> => new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('no document'));
    const existing = document.querySelector(`script[data-katex-src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
        if ((existing as any).dataset.loaded === 'true') {
            resolve();
            return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
        return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.katexSrc = src;
    script.onload = () => {
        script.dataset.loaded = 'true';
        resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
});

/**
 * 带有全套 CDN 镜像轮退的 KaTeX 加载器
 */
export async function loadKatex(): Promise<KatexLike> {
    if (typeof window === 'undefined') {
        throw new Error('KaTeX 仅支持在浏览器环境下加载');
    }

    // 1. 若全局已就绪，立即直接返回
    if ((window as any).katex) {
        ensureKatexCss();
        return (window as any).katex as KatexLike;
    }

    if (katexPromise) return katexPromise;

    ensureKatexCss();

    katexPromise = (async () => {
        // 2. 依次尝试各 CDN 镜像
        let lastError: unknown;
        for (const mirror of KATEX_JS_MIRRORS) {
            try {
                await loadSingleScript(mirror);
                const katex = (window as any).katex as KatexLike | undefined;
                if (katex && typeof katex.renderToString === 'function') {
                    return katex;
                }
            } catch (err) {
                lastError = err;
            }
        }

        // 3. 若所有脚本注入均受限，尝试 ESM 动态导入（经由 index.html importmap 的 esm.sh）
        try {
            // @ts-expect-error importmap entry
            const mod = await import('katex');
            const katex = (mod?.default || mod) as KatexLike;
            if (katex && typeof katex.renderToString === 'function') {
                (window as any).katex = katex;
                return katex;
            }
        } catch (esmErr) {
            lastError = esmErr;
        }

        katexPromise = null; // 失败后清空，允许重试
        throw lastError instanceof Error ? lastError : new Error('KaTeX CDN 镜像全部无法访问');
    })();

    return katexPromise;
}

/**
 * 自适应 KaTeX Hook：自动触发重新渲染，公式从源码平滑升级为渲染态
 */
export function useKatex(): KatexLike | null {
    const [renderer, setRenderer] = useState<KatexLike | null>(() => {
        return typeof window !== 'undefined' && (window as any).katex ? ((window as any).katex as KatexLike) : null;
    });

    useEffect(() => {
        if (renderer) return;
        let isMounted = true;
        loadKatex()
            .then(k => {
                if (isMounted) setRenderer(k);
            })
            .catch(() => {
                /* 失败由上层退化回源码显示 */
            });
        return () => {
            isMounted = false;
        };
    }, [renderer]);

    return renderer;
}
