import React, { useEffect, useRef, useState } from 'react';
import { usePwaInstallPrompt } from '../../hooks/usePwaInstallPrompt';

const MESSAGE_MS = 2600;

/**
 * 设置页「安装到桌面」按钮。只在浏览器真的派发过 beforeinstallprompt、
 * 且当前还没装过时才显示——Safari / 已安装 / 条件不满足时渲染 null，
 * 跟 AndroidUpdateControl 同一个"不适用就直接不出现"的写法。
 */
const PwaInstallControl: React.FC = () => {
    const { canInstall, promptInstall } = usePwaInstallPrompt();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    }, []);

    // 用户点了「取消」之后，promptInstall 用掉了这次事件，canInstall 会在同一拍
    // 变 false——如果直接靠 canInstall 决定要不要渲染，组件会在提示还没来得及
    // 显示时就先卸载掉，点了跟没点一样。这里额外用 message 撑住一下，跟
    // canInstall 一起决定是否还留在页面上，提示显完再收起。
    if (!canInstall && !message) return null;

    const handleClick = async () => {
        setBusy(true);
        setMessage('');
        try {
            const outcome = await promptInstall();
            if (outcome === 'dismissed') {
                setMessage('已取消');
                messageTimerRef.current = setTimeout(() => setMessage(''), MESSAGE_MS);
            }
            // 'accepted' 之后浏览器会自己派发 appinstalled，hook 内部会把 canInstall
            // 收回 false，不需要在这里额外处理。
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-2 flex flex-col items-center gap-1.5">
            {canInstall && (
                <button
                    type="button"
                    onClick={() => void handleClick()}
                    disabled={busy}
                    className="rounded-full bg-violet-100 px-4 py-2 text-[11px] font-bold text-violet-700 transition-transform active:scale-95 disabled:opacity-60"
                >
                    {busy ? '安装中…' : '安装到桌面'}
                </button>
            )}
            {message && <p className="text-[10px] text-slate-400">{message}</p>}
        </div>
    );
};

export default PwaInstallControl;
