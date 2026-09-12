import { useEffect } from 'react';
import { useIsDesktopMode } from './useDeviceMode';

export interface UseArrowScrollOptions {
  /** 是否启用，默认随 isDesktop 自动开关 */
  enabled?: boolean;
  /** 单次 ↑/↓ 滚动的像素距离，默认 120px */
  step?: number;
  /** 外部阻断标志（如当前有弹窗、多选态、全屏演出等），任意为 true 时不接管 */
  blocked?: boolean;
}

/**
 * 桌面模式（PC）长滚动视图方向键无感导航。
 * 对应 desktop-adaptation-plan.md 模块 3-B 与审阅补充第 5 条。
 *
 * 交互规格：
 * - ↑ / ↓：平滑滚动 step（默认 120px）
 * - PageUp / PageDown：按视口 85% 高度整屏平滑翻动
 * - Home / End：一键平滑直达顶部 / 触底
 *
 * 防冲突守卫：
 * 1. 焦点在 input / textarea / select / contenteditable 时坚决不接管，光标与文本编辑绝对优先；
 * 2. 中文输入法组词（isComposing / keyCode 229）不接管，选字翻页优先；
 * 3. 带 Alt/Ctrl/Cmd 等修饰键放行，避免拦截浏览器或系统的快捷键与前进后退；
 * 4. 任意父级或目标标有 [data-no-arrow-nav] 视为自行声明"方向键归我管"，放行；
 * 5. 外部 blocked 开启（模态弹层、多选态等）时直接注销/短路，不与弹层内部交互争抢。
 */
export function useArrowScroll(
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseArrowScrollOptions = {}
) {
  const isDesktop = useIsDesktopMode();
  const { enabled = true, step = 120, blocked = false } = options;

  useEffect(() => {
    // 手机触屏或显式禁用/弹层阻断时，直接不注册 window 监听器，零性能开销
    if (!isDesktop || !enabled || blocked) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      if (
        key !== 'ArrowUp' &&
        key !== 'ArrowDown' &&
        key !== 'PageUp' &&
        key !== 'PageDown' &&
        key !== 'Home' &&
        key !== 'End'
      ) {
        return;
      }

      // 输入法候选词与系统修饰键组合绝对放行
      if (e.isComposing || e.keyCode === 229 || e.altKey || e.ctrlKey || e.metaKey) {
        return;
      }

      // 文本输入控件与 escape hatch 防冲突
      const target = e.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
        if (target.closest('[data-no-arrow-nav]')) return;
      }

      const container = containerRef.current;
      if (!container) return;

      e.preventDefault();

      const clientH = container.clientHeight || 400;
      switch (key) {
        case 'ArrowUp':
          container.scrollBy({ top: -step, behavior: 'smooth' });
          break;
        case 'ArrowDown':
          container.scrollBy({ top: step, behavior: 'smooth' });
          break;
        case 'PageUp':
          container.scrollBy({ top: -Math.round(clientH * 0.85), behavior: 'smooth' });
          break;
        case 'PageDown':
          container.scrollBy({ top: Math.round(clientH * 0.85), behavior: 'smooth' });
          break;
        case 'Home':
          container.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'End':
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDesktop, enabled, step, blocked, containerRef]);
}
