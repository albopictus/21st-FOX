import React, { useState, useEffect } from 'react';
import { Newspaper, Sparkle, ArrowRight, BookOpen } from '@phosphor-icons/react';
import type { PlacedItem, StudyPaper } from '../../../types';
import type { WidgetRenderContext } from '../desktopWidgetRegistry';
import { DB } from '../../../utils/db';

interface StudyPaperWidgetProps {
    item: PlacedItem;
    ctx: WidgetRenderContext;
}

export const StudyPaperWidget: React.FC<StudyPaperWidgetProps> = ({ item, ctx }) => {
    const [latestPaper, setLatestPaper] = useState<StudyPaper | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        DB.getLatestPaper().then(paper => {
            if (mounted) {
                setLatestPaper(paper);
                setLoading(false);
            }
        }).catch(() => {
            if (mounted) setLoading(false);
        });
        return () => { mounted = false; };
    }, []);

    const handleClick = () => {
        if (ctx.editing) return;
        if (latestPaper) {
            sessionStorage.setItem('study_target_paper', latestPaper.id);
        }
        ctx.openApp('study');
    };

    const isWide = item.w >= 3;
    const figureBlock = latestPaper?.blocks.find(b => b.type === 'figure') as any;

    // 透明度计算
    const opacityPct = ctx.widgetOpacity?.['study_paper'] ?? 100;
    const bgOpacity = opacityPct / 100;

    return (
        <div
            onClick={handleClick}
            className="w-full h-full p-3 flex flex-col justify-between cursor-pointer select-none rounded-2xl overflow-hidden relative group transition active:scale-[0.98]"
            style={{
                background: `linear-gradient(135deg, rgba(13, 27, 24, ${0.92 * bgOpacity}) 0%, rgba(9, 18, 26, ${0.95 * bgOpacity}) 100%)`,
                backdropFilter: opacityPct < 100 ? `blur(${Math.round((opacityPct / 100) * 12)}px)` : undefined,
                border: `1px solid rgba(16, 185, 129, ${0.25 * bgOpacity})`,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
            }}
        >
            {/* 顶栏徽标 */}
            <div className="flex items-center justify-between text-[10px] z-10">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold uppercase tracking-wider font-mono">
                    <Sparkle size={12} weight="fill" />
                    <span>文献晨读</span>
                </div>
                {latestPaper?.journalTitle && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono truncate max-w-[90px]">
                        {latestPaper.journalTitle}
                    </span>
                )}
            </div>

            {/* 中间核心内容 */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                    加载文献中...
                </div>
            ) : latestPaper ? (
                isWide ? (
                    /* 4x2 宽幅展示 */
                    <div className="flex-1 flex gap-3 items-center my-1 overflow-hidden">
                        {figureBlock?.imageUrl ? (
                            <div className="w-24 h-full rounded-lg overflow-hidden bg-black/40 border border-white/10 flex-shrink-0 flex items-center justify-center">
                                <img
                                    src={figureBlock.imageUrl}
                                    alt="Thumbnail"
                                    className="max-h-full max-w-full object-contain"
                                    loading="lazy"
                                />
                            </div>
                        ) : (
                            <div className="w-16 h-full rounded-lg bg-emerald-950/40 border border-emerald-500/20 flex-shrink-0 flex flex-col items-center justify-center text-emerald-400">
                                <Newspaper size={24} />
                                <span className="text-[9px] font-mono mt-1">JATS XML</span>
                            </div>
                        )}

                        <div className="flex-1 min-w-0 flex flex-col justify-center space-y-1">
                            <h4 className="text-xs font-bold font-serif text-slate-100 line-clamp-2 leading-snug group-hover:text-emerald-300 transition">
                                {latestPaper.title}
                            </h4>
                            <p className="text-[11px] text-emerald-300/80 font-sans line-clamp-1">
                                {latestPaper.titleZh || latestPaper.summary100 || latestPaper.authorString}
                            </p>
                        </div>
                    </div>
                ) : (
                    /* 2x2 方块展示 */
                    <div className="flex-1 flex flex-col justify-center my-1 space-y-1 overflow-hidden">
                        <h4 className="text-xs font-bold font-serif text-slate-100 line-clamp-2 leading-snug group-hover:text-emerald-300 transition">
                            {latestPaper.titleZh || latestPaper.title}
                        </h4>
                        {latestPaper.summary100 ? (
                            <p className="text-[10px] text-emerald-200/70 font-sans line-clamp-2 leading-relaxed">
                                {latestPaper.summary100}
                            </p>
                        ) : (
                            <p className="text-[10px] text-slate-400 font-sans line-clamp-2">
                                {latestPaper.title}
                            </p>
                        )}
                    </div>
                )
            ) : (
                /* 空状态 */
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-1 my-1">
                    <BookOpen size={24} className="text-emerald-500/60 mb-0.5" />
                    <span className="text-xs font-semibold text-slate-300">开启今日晨读</span>
                    <span className="text-[10px] text-slate-400">轻触抓取 Europe PMC 前沿</span>
                </div>
            )}

            {/* 底栏进度与指示 */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-white/5 z-10">
                <span>
                    {latestPaper ? `已读 ${latestPaper.readProgress || 0}%` : '待开卷'}
                </span>
                <div className="flex items-center gap-1 text-emerald-400 font-medium group-hover:translate-x-0.5 transition-transform">
                    <span>开读</span>
                    <ArrowRight size={10} weight="bold" />
                </div>
            </div>
        </div>
    );
};
