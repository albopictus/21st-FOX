import React from 'react';
import { Newspaper, Sparkle, ArrowRight, BookOpen } from '@phosphor-icons/react';
import type { Message, AppID } from '../../types';

interface PaperCardProps {
    message: Message;
    openApp: (id: AppID) => void;
}

export const PaperCard: React.FC<PaperCardProps> = ({ message, openApp }) => {
    const md = message.metadata || {};
    const paperId: string | undefined = md.paperId || md.pmcid;
    const title: string = md.title || message.content || '学术前沿晨读';
    const titleZh: string | undefined = md.titleZh;
    const journal: string = md.journal || md.journalTitle || 'Europe PMC';
    const summary100: string | undefined = md.summary100 || md.summary;
    const imageUrl: string | undefined = md.imageUrl || md.thumbUrl;
    const dateStr = new Date(message.timestamp).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });

    const handleClick = () => {
        if (paperId) {
            sessionStorage.setItem('study_target_paper', paperId);
        }
        openApp('study' as AppID);
    };

    return (
        <div
            onClick={handleClick}
            className="w-64 cursor-pointer select-none rounded-2xl overflow-hidden shadow-lg border border-emerald-500/30 transition-all duration-200 active:scale-[0.98] hover:shadow-emerald-950/40"
            style={{
                background: 'linear-gradient(165deg, #0d1b18 0%, #09131a 100%)',
                boxShadow: '0 8px 24px rgba(6, 44, 34, 0.28)'
            }}
        >
            {/* 顶栏学术号外报头 */}
            <div className="px-3.5 pt-3 pb-2 border-b border-emerald-500/20 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-400">
                    <Sparkle size={13} weight="fill" />
                    <span className="text-[10px] font-bold tracking-widest uppercase font-mono">
                        晨读号外 · PAPER
                    </span>
                </div>
                <span className="text-[9px] text-slate-400 font-mono">
                    {dateStr}
                </span>
            </div>

            {/* 期刊与来源标签 */}
            <div className="px-3.5 pt-2.5 flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase truncate max-w-[150px]">
                    {journal}
                </span>
                {paperId && (
                    <span className="text-[9px] font-mono text-slate-500">
                        {paperId}
                    </span>
                )}
            </div>

            {/* 论文标题 */}
            <div className="px-3.5 pt-2 pb-1 space-y-1">
                <h4
                    className="text-[13px] font-bold text-slate-100 font-serif leading-snug"
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                    {title}
                </h4>
                {titleZh && (
                    <p
                        className="text-[11px] text-emerald-300/80 font-sans"
                        style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                        {titleZh}
                    </p>
                )}
            </div>

            {/* 配图缩略（如有） */}
            {imageUrl && (
                <div className="mx-3.5 my-2 h-24 rounded-lg overflow-hidden bg-black/50 border border-white/10 flex items-center justify-center">
                    <img
                        src={imageUrl}
                        alt="Paper Figure"
                        className="max-h-full max-w-full object-contain"
                        loading="lazy"
                    />
                </div>
            )}

            {/* 百字核心速递 */}
            {summary100 && (
                <div className="mx-3.5 my-1.5 p-2 rounded-lg bg-emerald-950/30 border border-emerald-500/15">
                    <p
                        className="text-[10px] leading-relaxed text-emerald-100/90 font-sans text-justify"
                        style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                        {summary100}
                    </p>
                </div>
            )}

            {/* 底栏行动按钮 */}
            <div className="px-3.5 py-2.5 mt-1 border-t border-white/5 bg-white/[0.02] flex items-center justify-between text-xs text-emerald-300 font-medium">
                <span className="text-[11px] flex items-center gap-1.5 text-slate-300">
                    <BookOpen size={13} />
                    <span>双语浸润阅读</span>
                </span>
                <div className="flex items-center gap-1 text-emerald-400 group-hover:translate-x-1 transition-transform">
                    <span className="text-[11px] font-bold">开始晨读</span>
                    <ArrowRight size={11} weight="bold" />
                </div>
            </div>
        </div>
    );
};
