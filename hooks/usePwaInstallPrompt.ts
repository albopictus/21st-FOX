import { useCallback, useEffect, useState } from 'react';
import { isStandaloneDisplayMode } from '../utils/iosStandalone';

// 浏览器还没有把这个事件标准化进 TS 内置 lib，自己声明最小可用的形状。
interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/**
 * PWA「安装到桌面」的可编程入口。
 *
 * 浏览器只在满足安装条件（manifest + Service Worker 齐全，见 public/manifest.webmanifest）
 * 时才会派发一次 `beforeinstallprompt`；不调 `preventDefault()` 的话浏览器会自己弹一条
 * 系统级安装条，调了之后事件被接管，只能靠业务代码自己保存下来、在用户点了某个按钮
 * 之后再手动调 `.prompt()` 补发——这就是为什么必须监听并"存住"这个事件，而不能等
 * 用户点按钮时才现找。
 *
 * 只在 Chromium 系（Chrome / Edge，含安卓 Chrome）触发；Safari（含 iOS/iPadOS）从不
 * 派发这个事件，那边只能靠系统自带的"添加到主屏幕"手动引导（见 isIOSStandaloneWebApp
 * 相关的现有提示文案），这个 hook 在 Safari 下 `canInstall` 永远是 false，符合预期。
 */
export function usePwaInstallPrompt() {
    const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
    const [installed, setInstalled] = useState(isStandaloneDisplayMode);

    useEffect(() => {
        const onBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredEvent(e as BeforeInstallPromptEvent);
        };
        // 装完之后浏览器会派发这个事件；不管是通过我们的按钮装的，还是用户自己走
        // 浏览器原生入口装的，都会收到，顺手把按钮收起来，避免装完了还杵在那.
        const onAppInstalled = () => {
            setInstalled(true);
            setDeferredEvent(null);
        };
        window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
        window.addEventListener('appinstalled', onAppInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
            window.removeEventListener('appinstalled', onAppInstalled);
        };
    }, []);

    const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
        if (!deferredEvent) return 'unavailable';
        await deferredEvent.prompt();
        const { outcome } = await deferredEvent.userChoice;
        // 这个事件对象只能用一次，用过之后不管用户选了装还是不装，都得扔掉——
        // 再点按钮要等浏览器判定条件重新满足、重新派发下一次 beforeinstallprompt。
        setDeferredEvent(null);
        return outcome;
    }, [deferredEvent]);

    return {
        // 已经装过 / 已经在独立窗口里运行时不再需要按钮。
        canInstall: !!deferredEvent && !installed,
        installed,
        promptInstall,
    };
}
