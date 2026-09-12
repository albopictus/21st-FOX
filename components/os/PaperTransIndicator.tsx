import React from 'react';
import { useOS } from '../../context/OSContext';
import { AppID } from '../../types';
import { usePaperTranslation, paperTranslationStore } from '../../utils/paperTranslationStore';
import { useDreamSim } from '../../utils/dreamSimStore';
import { usePersonaSim } from '../../utils/personaSimStore';
import { CaretRight, SpinnerGap, Sparkle } from '@phosphor-icons/react';

// 全局「文献精翻」生成指示条 —— 挂在 PhoneShell，随处可见，点击深链回到文献阅读器。
const PaperTransIndicator: React.FC = () => {
    const trans = usePaperTranslation();
    const dreamSim = useDreamSim();
    const personaSim = usePersonaSim();
    const { openApp } = useOS();

    if (trans.status !== 'loading' && trans.status !== 'ready') return null;

    const dreamActive = dreamSim.status === 'loading' || dreamSim.status === 'ready';
    const personaActive = personaSim.status === 'loading' || personaSim.status === 'ready';

    // 动态计算顶部距离，避免与人格模拟（top-12）和梦境（top-24）指示条遮挡重叠
    const topClass = personaActive && dreamActive ? 'top-36' : (personaActive || dreamActive ? 'top-24' : 'top-12');

    const onTap = () => {
        paperTranslationStore.requestOpen();
        openApp(AppID.Study);
    };

    const ready = trans.status === 'ready';
    return (
        <div className={`absolute ${topClass} left-0 w-full flex justify-center px-4 z-[65] pointer-events-none transition-all duration-300`}>
            <button onClick={onTap}
                className={`pointer-events-auto flex items-center gap-2.5 rounded-full active:scale-95 transition shadow-[0_8px_30px_rgba(0,0,0,0.4)] border ${ready ? 'animate-notif-pop px-5 py-3' : 'animate-fade-in px-4 py-2.5'}`}
                style={ready
                    ? { background: 'linear-gradient(120deg, rgba(209,250,229,0.98), rgba(167,243,208,0.95))', borderColor: 'rgba(52,211,153,0.5)' }
                    : { background: 'rgba(6,78,59,0.94)', borderColor: 'rgba(52,211,153,0.3)' }}>
                {ready
                    ? <Sparkle size={16} weight="fill" className="text-emerald-900 shrink-0" />
                    : <SpinnerGap size={14} className="text-emerald-300 animate-spin shrink-0" />}
                <span className={`text-[12px] font-semibold truncate max-w-[220px] ${ready ? 'text-emerald-950 font-bold' : 'text-white/90'}`}>
                    {ready ? '文献精翻已完成 · 进入研读' : `文献精翻中 (${trans.percent}%) · ${trans.paperTitle}`}
                </span>
                {ready && <CaretRight size={13} weight="bold" className="text-emerald-900/80 shrink-0" />}
            </button>
        </div>
    );
};

export default PaperTransIndicator;
