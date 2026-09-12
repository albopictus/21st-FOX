import { useEffect, useState } from 'react';

/**
 * 电脑端（PC 模式）识别。见 desktop-adaptation-plan.md 模块 1。
 *
 * 判定标准是「精准指针 + 悬浮能力」（`pointer: fine` and `hover: hover`）叠加一个
 * 视口宽度下限，两者都满足才算桌面模式：
 * - 单看指针特征会把「iPad 但没接键鼠」误判为桌面（触屏本身就不具备 hover）；
 *   这个问题指针特征本身已经排除了，不需要额外处理。
 * - 单看宽度会把手机横屏、小尺寸窗口误判为桌面，所以还要求指针特征。
 * - 宽度阈值定在 1024px 而不是 Tailwind 的 sm(640px)，是为了跟目标黄金阅读列宽
 *   `max-w-2xl`(672px) 错开一截，避免窗口刚跨过阈值时比目标列宽还窄，出现挤压感
 *   而不是设计想要的「呼吸感」。
 *
 * iPad + 妙控键盘/触控板会被判定为桌面模式，这是预期行为（见方案验收标准）。
 */
const POINTER_QUERY = '(pointer: fine) and (hover: hover)';
const MIN_DESKTOP_WIDTH = 1024;

function computeIsDesktop(mql: MediaQueryList): boolean {
    return mql.matches && window.innerWidth >= MIN_DESKTOP_WIDTH;
}

export function useIsDesktopMode(): boolean {
    const [isDesktop, setIsDesktop] = useState(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
        return computeIsDesktop(window.matchMedia(POINTER_QUERY));
    });

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const mql = window.matchMedia(POINTER_QUERY);
        let raf = 0;

        const update = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                setIsDesktop(computeIsDesktop(mql));
            });
        };

        update();
        // 部分浏览器（旧版 Safari）没有 addEventListener，退回 addListener。
        if (typeof mql.addEventListener === 'function') {
            mql.addEventListener('change', update);
        } else {
            mql.addListener(update);
        }
        window.addEventListener('resize', update);

        return () => {
            cancelAnimationFrame(raf);
            if (typeof mql.removeEventListener === 'function') {
                mql.removeEventListener('change', update);
            } else {
                mql.removeListener(update);
            }
            window.removeEventListener('resize', update);
        };
    }, []);

    return isDesktop;
}
