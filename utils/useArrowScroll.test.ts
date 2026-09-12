// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useEffect, useRef } from 'react';
import { useArrowScroll } from '../hooks/useArrowScroll';

vi.mock('../hooks/useDeviceMode', () => ({
  useIsDesktopMode: vi.fn(),
}));

import { useIsDesktopMode } from '../hooks/useDeviceMode';

// 轻量级 Hook 测试组件，不依赖额外的 @testing-library/react
const TestComponent: React.FC<{
  containerRef: React.RefObject<HTMLDivElement | null>;
  options?: any;
}> = ({ containerRef, options }) => {
  useArrowScroll(containerRef, options);
  return null;
};

describe('useArrowScroll hook', () => {
  let container: HTMLDivElement;
  let containerRef: { current: HTMLDivElement | null };

  beforeEach(() => {
    container = document.createElement('div');
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(container, 'scrollHeight', { value: 2000, configurable: true });
    container.scrollBy = vi.fn();
    container.scrollTo = vi.fn();
    document.body.appendChild(container);
    containerRef = { current: container };
    vi.mocked(useIsDesktopMode).mockReturnValue(true);
  });

  afterEach(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.clearAllMocks();
  });

  it('方向键上下平滑滚动 120px', async () => {
    const { createRoot } = await import('react-dom/client');
    const rootEl = document.createElement('div');
    document.body.appendChild(rootEl);
    const root = createRoot(rootEl);

    await React.act(async () => {
      root.render(React.createElement(TestComponent, { containerRef: containerRef as any }));
    });

    // ArrowDown
    const downEvent = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    window.dispatchEvent(downEvent);
    expect(container.scrollBy).toHaveBeenCalledWith({ top: 120, behavior: 'smooth' });

    // ArrowUp
    const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    window.dispatchEvent(upEvent);
    expect(container.scrollBy).toHaveBeenCalledWith({ top: -120, behavior: 'smooth' });

    await React.act(async () => {
      root.unmount();
    });
    rootEl.remove();
  });

  it('PageUp / PageDown 按整屏比例滚动，Home / End 一键到顶到底', async () => {
    const { createRoot } = await import('react-dom/client');
    const rootEl = document.createElement('div');
    document.body.appendChild(rootEl);
    const root = createRoot(rootEl);

    await React.act(async () => {
      root.render(React.createElement(TestComponent, { containerRef: containerRef as any }));
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }));
    expect(container.scrollBy).toHaveBeenCalledWith({ top: 510, behavior: 'smooth' }); // 600 * 0.85 = 510

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true }));
    expect(container.scrollBy).toHaveBeenCalledWith({ top: -510, behavior: 'smooth' });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' });

    await React.act(async () => {
      root.unmount();
    });
    rootEl.remove();
  });

  it('输入框/文本域聚焦时不接管方向键', async () => {
    const { createRoot } = await import('react-dom/client');
    const rootEl = document.createElement('div');
    document.body.appendChild(rootEl);
    const root = createRoot(rootEl);

    await React.act(async () => {
      root.render(React.createElement(TestComponent, { containerRef: containerRef as any }));
    });

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);

    expect(container.scrollBy).not.toHaveBeenCalled();
    textarea.remove();

    await React.act(async () => {
      root.unmount();
    });
    rootEl.remove();
  });

  it('具有 [data-no-arrow-nav] 属性的元素豁免接管', async () => {
    const { createRoot } = await import('react-dom/client');
    const rootEl = document.createElement('div');
    document.body.appendChild(rootEl);
    const root = createRoot(rootEl);

    await React.act(async () => {
      root.render(React.createElement(TestComponent, { containerRef: containerRef as any }));
    });

    const customControl = document.createElement('div');
    customControl.setAttribute('data-no-arrow-nav', 'true');
    document.body.appendChild(customControl);

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    customControl.dispatchEvent(event);

    expect(container.scrollBy).not.toHaveBeenCalled();
    customControl.remove();

    await React.act(async () => {
      root.unmount();
    });
    rootEl.remove();
  });

  it('输入法组词或修饰键按下时放行', async () => {
    const { createRoot } = await import('react-dom/client');
    const rootEl = document.createElement('div');
    document.body.appendChild(rootEl);
    const root = createRoot(rootEl);

    await React.act(async () => {
      root.render(React.createElement(TestComponent, { containerRef: containerRef as any }));
    });

    // isComposing
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', isComposing: true, bubbles: true, cancelable: true }));
    // keyCode 229
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 229, bubbles: true, cancelable: true } as any));
    // Ctrl / Alt / Meta
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', metaKey: true, bubbles: true, cancelable: true }));

    expect(container.scrollBy).not.toHaveBeenCalled();

    await React.act(async () => {
      root.unmount();
    });
    rootEl.remove();
  });

  it('blocked 状态或非桌面环境时不生效', async () => {
    const { createRoot } = await import('react-dom/client');
    const rootEl = document.createElement('div');
    document.body.appendChild(rootEl);
    const root = createRoot(rootEl);

    await React.act(async () => {
      root.render(React.createElement(TestComponent, { containerRef: containerRef as any, options: { blocked: true } }));
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(container.scrollBy).not.toHaveBeenCalled();

    await React.act(async () => {
      root.unmount();
    });
    rootEl.remove();
  });
});
