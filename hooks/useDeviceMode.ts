import { useEffect, useState } from 'react';

/**
 * 电脑端（PC 模式）识别。见 desktop-adaptation-plan.md 模块 1。
 *
 * 判定标准只看「精准指针 + 悬浮能力」（`pointer: fine` and `hover: hover`），
 * 不看窗口宽度：
 * - 触屏本身就不具备 hover，`iPad` 没接键鼠会被这条天然排除，不需要额外处理；
 *   接了妙控键盘/触控板则会被判定为桌面模式，这是预期行为（见方案验收标准）。
 * - 一开始加过一道视口宽度下限（1024px），想法是跟目标黄金阅读列宽错开一截避免
 *   窗口刚跨过阈值时比列宽还窄；但这样会导致「鼠标键盘操作、只是把浏览器窗口开
 *   得比较小」的场景被误判成手机模式，胶囊分页 / 方向键这些交互升级全都用不上——
 *   而这类交互升级本来就跟窗口宽窄无关，只跟「有没有鼠标」有关。真正的排版宽度
 *   问题（黄金阅读列宽）应该交给 CSS 的 `max-width` 自己处理：窗口本来就窄的话
 *   `max-width` 不会生效，压根不需要在 JS 里判断宽度。所以去掉了宽度门槛。
 */
const POINTER_QUERY = '(pointer: fine) and (hover: hover)';

export function useIsDesktopMode(): boolean {
    const [isDesktop, setIsDesktop] = useState(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
        return window.matchMedia(POINTER_QUERY).matches;
    });

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const mql = window.matchMedia(POINTER_QUERY);

        const update = () => setIsDesktop(mql.matches);

        update();
        // 部分浏览器（旧版 Safari）没有 addEventListener，退回 addListener。
        if (typeof mql.addEventListener === 'function') {
            mql.addEventListener('change', update);
        } else {
            mql.addListener(update);
        }

        return () => {
            if (typeof mql.removeEventListener === 'function') {
                mql.removeEventListener('change', update);
            } else {
                mql.removeListener(update);
            }
        };
    }, []);

    return isDesktop;
}
