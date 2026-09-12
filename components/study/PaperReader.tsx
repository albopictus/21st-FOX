import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Translate, Sparkle, ChatCircleText, BookmarkSimple, ShareNetwork, Eye, CaretDown, CaretUp, CheckCircle, SpinnerGap, Info, CalendarBlank, DownloadSimple, TextAa, Check } from '@phosphor-icons/react';
import type { StudyPaper, PaperBlock, PaperParagraphBlock, PaperFigureBlock, PaperHeadingBlock, APIConfig, PaperTypographyConfig } from '../../types';
import { PaperFigureModal } from './PaperFigureModal';
import { translateSingleBlock, translateStudyPaper, getPaperApiConfig } from '../../utils/paperTranslator';
import { DB } from '../../utils/db';
import { downloadPaperPdf } from '../../utils/paperDownload';
import {
    getSavedTypography,
    saveTypography,
    getFontFamilyStyle,
    getFontSizeClasses
} from '../../utils/paperTypography';
import { applyBionicReading } from '../../utils/bionicReading';
import { ZoteroExportModal } from './ZoteroExportModal';
import Modal from '../os/Modal';

interface PaperReaderProps {
    paper: StudyPaper;
    onBack: () => void;
    onAskTutor: (snippet: string, defaultPrompt?: string) => void;
    katexRenderer?: { renderToString: (latex: string, options: any) => string } | null;
    apiConfig: APIConfig;
    onUpdatePaper: (updated: StudyPaper) => void;
    onOpenZoteroSettings?: () => void;
}

export const PaperReader: React.FC<PaperReaderProps> = ({
    paper,
    onBack,
    onAskTutor,
    katexRenderer,
    apiConfig,
    onUpdatePaper,
    onOpenZoteroSettings
}) => {
    // 排版与字体状态（持久化存储）
    const [typography, setTypography] = useState<PaperTypographyConfig>(getSavedTypography);
    const [showTypographyModal, setShowTypographyModal] = useState(false);
    const [showZoteroModal, setShowZoteroModal] = useState(false);

    const updateTypography = (patch: Partial<PaperTypographyConfig>) => {
        setTypography(prev => {
            const next = { ...prev, ...patch };
            saveTypography(next);
            return next;
        });
    };

    const handleDownloadPdf = () => {
        downloadPaperPdf({
            pmcid: paper.pmcid,
            pdfUrl: paper.pdfUrl,
            title: paper.title,
            pubYear: paper.pubDate,
            doi: paper.doi
        });
    };

    // 跟踪展开了中文对照的段落 ID 集合
    const [expandedBlockIds, setExpandedBlockIds] = useState<Set<string>>(new Set());
    // 选中的插图（进入全屏灯箱）
    const [activeFigure, setActiveFigure] = useState<PaperFigureBlock | null>(null);

    // 全文翻译状态
    const [isTranslating, setIsTranslating] = useState(false);
    const [transPercent, setTransPercent] = useState(0);
    const [transStatus, setTransStatus] = useState('');

    // 单段翻译加载中 ID
    const [translatingBlockId, setTranslatingBlockId] = useState<string | null>(null);

    // 阅读进度
    const [scrollPercent, setScrollPercent] = useState(paper.readProgress || 0);
    const containerRef = useRef<HTMLDivElement>(null);

    // 监听滚动更新阅读进度
    const handleScroll = () => {
        if (!containerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        const total = scrollHeight - clientHeight;
        if (total > 0) {
            const pct = Math.min(100, Math.round((scrollTop / total) * 100));
            setScrollPercent(pct);
        }
    };

    // 退出或卸载时保存进度
    useEffect(() => {
        return () => {
            if (scrollPercent > (paper.readProgress || 0)) {
                const updated = { ...paper, readProgress: scrollPercent };
                DB.savePaper(updated).catch(console.error);
                onUpdatePaper(updated);
            }
        };
    }, [scrollPercent, paper]);

    // 切换段落中文对照展开/折叠
    const toggleBlockExpand = async (block: PaperBlock) => {
        const next = new Set(expandedBlockIds);
        if (next.has(block.id)) {
            next.delete(block.id);
            setExpandedBlockIds(next);
            return;
        }

        next.add(block.id);
        setExpandedBlockIds(next);

        // 如果还没有中文译文，按需发起即时翻译
        const textToTranslate = block.type === 'figure' ? block.caption : (block.type === 'paragraph' ? block.text : undefined);
        const hasTranslation = block.type === 'figure' ? Boolean(block.captionZh) : Boolean(block.textZh);

        const effectiveConfig = getPaperApiConfig(apiConfig);
        if (!hasTranslation && textToTranslate && effectiveConfig.apiKey) {
            try {
                setTranslatingBlockId(block.id);
                const zh = await translateSingleBlock(textToTranslate, apiConfig);
                const newBlocks = paper.blocks.map(b => {
                    if (b.id !== block.id) return b;
                    if (b.type === 'figure') return { ...b, captionZh: zh };
                    return { ...b, textZh: zh };
                });
                const updated = { ...paper, blocks: newBlocks };
                await DB.savePaper(updated);
                onUpdatePaper(updated);
            } catch (e) {
                console.error('按需翻译段落失败:', e);
            } finally {
                setTranslatingBlockId(null);
            }
        }
    };

    // 发起全文学术翻译
    const handleFullTranslate = async () => {
        const effectiveConfig = getPaperApiConfig(apiConfig);
        if (isTranslating) return;
        if (!effectiveConfig.apiKey) {
            alert('请先在自习室设置中配置 API Key（或文献翻译专用 API）');
            return;
        }
        try {
            setIsTranslating(true);
            setTransPercent(5);
            setTransStatus('准备发送学术文献积木块...');

            const updated = await translateStudyPaper(paper, apiConfig, (pct, status) => {
                setTransPercent(pct);
                setTransStatus(status);
            });

            await DB.savePaper(updated);
            onUpdatePaper(updated);
            // 默认展开所有有译文的段落
            const allIds = new Set(updated.blocks.map(b => b.id));
            setExpandedBlockIds(allIds);
        } catch (e: any) {
            alert(`学术翻译出错: ${e.message || '网络异常'}`);
        } finally {
            setIsTranslating(false);
        }
    };

    // 辅助渲染 KaTeX 公式与行内样式（支持 Bionic Reading 英文仿生阅读）
    const renderInlineContent = (content: string, isEnglishText: boolean = false) => {
        if (!content) return null;

        // 识别 $...$ 行内数学公式
        const parts = content.split(/(\$[^$]+?\$)/g);
        return parts.map((part, index) => {
            if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
                const latex = part.slice(1, -1).trim();
                if (katexRenderer) {
                    try {
                        const html = katexRenderer.renderToString(latex, {
                            displayMode: false,
                            throwOnError: false,
                            output: 'html'
                        });
                        return <span key={index} dangerouslySetInnerHTML={{ __html: html }} className="inline-block mx-1 font-mono text-emerald-800 font-semibold" />;
                    } catch (e) {
                        return <span key={index} className="text-emerald-800 font-mono text-xs font-semibold">{part}</span>;
                    }
                }
                return <span key={index} className="text-emerald-800 font-mono text-xs font-semibold">{part}</span>;
            }
            if (isEnglishText && typography.bionicReading) {
                const bionicHtml = applyBionicReading(part);
                return <span key={index} dangerouslySetInnerHTML={{ __html: bionicHtml }} />;
            }
            return <span key={index}>{part}</span>;
        });
    };

    const fontSizeClasses = getFontSizeClasses(typography.fontSize);

    return (
        <div
            className="flex flex-col h-full w-full bg-[#fdfbf7] text-slate-800 select-text overflow-hidden relative"
            style={{ fontFamily: getFontFamilyStyle(typography.fontFamily) }}
        >
            {/* 顶栏进度与导航：自习室统一毛玻璃风格 */}
            <div className="bg-[#fdfbf7]/90 backdrop-blur-md border-b border-[#e5e5e5] shrink-0 sticky top-0 z-20" style={{ paddingTop: 'var(--safe-top)' }}>
                <div className="flex items-center justify-between px-3 sm:px-6 py-2.5">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onBack}
                            className="p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform"
                            title="返回书架"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-600">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <div>
                            <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-700 font-bold flex items-center gap-1.5">
                                <span>{paper.journalTitle || 'Academic'}</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-slate-500 font-mono">{paper.pmcid}</span>
                            </div>
                            <div className="text-xs font-semibold text-slate-800 line-clamp-1 max-w-[150px] sm:max-w-[340px]">
                                {paper.titleZh || paper.title}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 sm:gap-2">
                        {/* 下载官方原版 PDF */}
                        <button
                            onClick={handleDownloadPdf}
                            className="p-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform text-slate-600"
                            title="下载官方原版 PDF"
                        >
                            <DownloadSimple size={18} />
                        </button>

                        {/* 排版与字体设置 */}
                        <button
                            onClick={() => setShowTypographyModal(true)}
                            className={`p-2 rounded-full transition-transform active:scale-90 ${
                                showTypographyModal
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'hover:bg-black/5 text-slate-600'
                            }`}
                            title="排版与字体设置（含 ADHD 专区）"
                        >
                            <TextAa size={19} weight={typography.bionicReading || typography.fontFamily === 'dyslexic' ? 'bold' : 'regular'} />
                        </button>

                        {/* Zotero 联动与学术引用导出 */}
                        <button
                            onClick={() => setShowZoteroModal(true)}
                            className={`p-2 rounded-full transition-transform active:scale-90 flex items-center justify-center ${
                                showZoteroModal
                                    ? 'bg-red-100 text-red-700'
                                    : 'hover:bg-black/5 text-slate-600'
                            }`}
                            title="Zotero 联动与学术引用导出"
                        >
                            <div className="w-4 h-4 rounded-sm bg-red-600 text-white font-bold text-[10px] flex items-center justify-center leading-none shadow-2xs">
                                Z
                            </div>
                        </button>

                        <button
                            onClick={handleFullTranslate}
                            disabled={isTranslating}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition active:scale-95 shadow-2xs ${
                                paper.translatedAt
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            }`}
                            title="学术级双语精翻"
                        >
                            {isTranslating ? (
                                <>
                                    <SpinnerGap size={13} className="animate-spin" />
                                    <span>{transPercent}%</span>
                                </>
                            ) : paper.translatedAt ? (
                                <>
                                    <CheckCircle size={14} weight="fill" className="text-emerald-700" />
                                    <span>已双语</span>
                                </>
                            ) : (
                                <>
                                    <Translate size={14} />
                                    <span>双语精翻</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={() => onAskTutor(`论文《${paper.title}》`)}
                            className="p-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform text-slate-600"
                            title="呼出助教"
                        >
                            <ChatCircleText size={20} />
                        </button>
                    </div>
                </div>

                {/* 滚动阅读进度细条 */}
                <div className="w-full h-0.5 bg-slate-200/70">
                    <div
                        className="h-full bg-emerald-600 transition-all duration-150"
                        style={{ width: `${scrollPercent}%` }}
                    />
                </div>
            </div>

            {/* 翻译进度浮层通知 */}
            {isTranslating && (
                <div className="bg-emerald-50 border-b border-emerald-200/80 px-4 py-2 flex items-center justify-between text-xs text-emerald-800 font-medium animate-fade-in">
                    <div className="flex items-center gap-2">
                        <SpinnerGap size={14} className="animate-spin text-emerald-600" />
                        <span>{transStatus}</span>
                    </div>
                    <span className="font-mono font-bold">{transPercent}%</span>
                </div>
            )}

            {/* 文献正文沉浸流 */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6 max-w-3xl mx-auto w-full no-scrollbar"
            >
                {/* 论文扉页白纸大卡片 */}
                <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 space-y-3.5">
                    <div className="flex items-center gap-2 flex-wrap">
                        {paper.pmcid && paper.blocks.some(b => b.type === 'heading' && b.text.toLowerCase() !== 'abstract') ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Open Access
                            </span>
                        ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                                Abstract & DOI
                            </span>
                        )}
                        {paper.pubDate && (
                            <span className="text-xs text-slate-500 font-mono flex items-center gap-1 bg-slate-100 px-2.5 py-0.5 rounded-full">
                                <CalendarBlank size={12} className="text-slate-400" />
                                <span>Published: {paper.pubDate}</span>
                            </span>
                        )}
                        {paper.doi && (
                            <span className="text-xs text-slate-400 font-mono">
                                DOI: {paper.doi}
                            </span>
                        )}
                    </div>

                    <h1 className="text-xl sm:text-2xl font-bold font-serif leading-snug text-slate-900 tracking-tight">
                        {paper.title}
                    </h1>

                    {paper.titleZh && (
                        <h2 className="text-base sm:text-lg font-semibold text-emerald-800 font-sans leading-relaxed">
                            {paper.titleZh}
                        </h2>
                    )}

                    {paper.authorString && (
                        <p className="text-xs text-slate-500 font-sans leading-relaxed">
                            <span className="text-slate-400 font-medium">Authors: </span>{paper.authorString}
                        </p>
                    )}

                    {/* 文献原作者关键词 */}
                    {paper.keywords && paper.keywords.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            <span className="text-xs text-slate-400 font-medium">Keywords:</span>
                            {paper.keywords.map((kwd, idx) => (
                                <span
                                    key={idx}
                                    className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium font-sans"
                                >
                                    {kwd}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* 会议论文/仅收录摘要友好提示 */}
                    {(paper.pubType?.toLowerCase().includes('meeting')
                        || paper.pubType?.toLowerCase().includes('abstract')
                        || (!paper.blocks.some(b => b.type === 'heading' && b.text.toLowerCase() !== 'abstract') && paper.blocks.length <= 5)) && (
                        <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2.5 font-sans leading-relaxed">
                            <Info size={18} weight="fill" className="text-amber-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                                <span className="font-bold text-amber-950">学术大会简报 / 海报摘要（Meeting Abstract）</span>
                                <p className="text-[11px] text-amber-800/90 leading-relaxed">
                                    本文在官方学术数据库中属于会议学术速递与海报简报，原刊仅收录了机理摘要，未收录长篇正文。您可在此精读中英对照摘要，或轻触段落呼出助教深度追问。
                                </p>
                            </div>
                        </div>
                    )}

                    {/* 百字晨读核心机理总结卡片 */}
                    {paper.summary100 && (
                        <div className="mt-4 p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/70 shadow-2xs space-y-1.5">
                            <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs uppercase tracking-wider font-sans">
                                <Sparkle size={15} weight="fill" />
                                <span>晨读核心机理速递</span>
                            </div>
                            <p className="text-xs sm:text-sm text-emerald-950 leading-relaxed text-justify font-sans">
                                {paper.summary100}
                            </p>
                        </div>
                    )}
                </div>

                {/* 积木块正文排版 */}
                <div className="space-y-4 pb-20">
                    {paper.blocks.map(block => {
                        if (block.type === 'heading') {
                            const h = block as PaperHeadingBlock;
                            const isExpanded = expandedBlockIds.has(h.id);
                            return (
                                <div key={h.id} className="pt-5 pb-1">
                                    <div
                                        onClick={() => toggleBlockExpand(h)}
                                        className="cursor-pointer group flex items-baseline justify-between"
                                    >
                                        <h3
                                            className={`font-bold font-serif tracking-tight ${
                                                h.level === 1
                                                    ? 'text-xl text-slate-900 border-b border-slate-200 pb-2'
                                                    : h.level === 2
                                                    ? 'text-lg text-slate-800'
                                                    : 'text-base text-slate-700'
                                            }`}
                                        >
                                            {h.text}
                                        </h3>
                                        {h.textZh && (
                                            <span className="text-[11px] text-emerald-700 font-medium opacity-0 group-hover:opacity-100 transition ml-2">
                                                {isExpanded ? '收起对照' : '展开对照'}
                                            </span>
                                        )}
                                    </div>
                                    {isExpanded && h.textZh && (
                                        <div className="mt-1 text-xs text-emerald-800 font-sans pl-1 font-medium">
                                            {h.textZh}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        if (block.type === 'paragraph') {
                            const p = block as PaperParagraphBlock;
                            const isExpanded = expandedBlockIds.has(p.id);
                            const isTranslatingThis = translatingBlockId === p.id;

                            return (
                                <div
                                    key={p.id}
                                    className="group relative rounded-2xl transition-all duration-150"
                                >
                                    {/* 英文段落：轻触展开/折叠双语对照 */}
                                    <p
                                        onClick={() => toggleBlockExpand(p)}
                                        className={`${fontSizeClasses.text} ${fontSizeClasses.leading} text-slate-800 text-justify cursor-pointer p-3 -mx-3 rounded-xl transition-colors ${
                                            isExpanded
                                                ? 'bg-white shadow-2xs border border-slate-100'
                                                : 'hover:bg-black/[0.02]'
                                        }`}
                                    >
                                        {renderInlineContent(p.text, true)}
                                    </p>

                                    {/* 右侧悬浮快捷操作胶囊 */}
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 absolute right-2 -top-3 z-10 bg-white border border-slate-200 px-2.5 py-1 rounded-full shadow-md text-[11px] text-slate-600">
                                        <button
                                            onClick={() => toggleBlockExpand(p)}
                                            className="text-emerald-700 hover:text-emerald-900 flex items-center gap-1 font-medium active:scale-95"
                                        >
                                            <Translate size={12} />
                                            <span>{isExpanded ? '折叠' : '双语'}</span>
                                        </button>
                                        <span className="text-slate-300">|</span>
                                        <button
                                            onClick={() => onAskTutor(p.text, `请向我解读该论文段落：\n"${p.text.slice(0, 150)}..."`)}
                                            className="text-teal-700 hover:text-teal-900 flex items-center gap-1 font-medium active:scale-95"
                                        >
                                            <ChatCircleText size={12} />
                                            <span>问助教</span>
                                        </button>
                                    </div>

                                    {/* 中文对照卡片（微动效平滑展开） */}
                                    {isExpanded && (
                                        <div className="mt-2 p-4 rounded-2xl bg-emerald-50/70 border-l-4 border-emerald-500 border-y border-r border-emerald-100/80 shadow-2xs animate-fade-in">
                                            {isTranslatingThis ? (
                                                <div className="flex items-center gap-2 text-xs text-emerald-800 py-1 font-medium">
                                                    <SpinnerGap size={14} className="animate-spin text-emerald-600" />
                                                    <span>正在学术级精准翻译该段落...</span>
                                                </div>
                                            ) : p.textZh ? (
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between text-[10px] text-emerald-800 font-bold uppercase tracking-wider">
                                                        <span>中文对照学术译文</span>
                                                        <button
                                                            onClick={() => onAskTutor(p.text, `针对该段落的中文含义，我有疑问：\n"${p.textZh.slice(0, 100)}..."`)}
                                                            className="text-emerald-700 hover:text-emerald-900 flex items-center gap-1 font-medium active:scale-95"
                                                        >
                                                            <span>基于此段提问</span>
                                                        </button>
                                                    </div>
                                                    <p className="font-sans text-[13px] sm:text-[14px] leading-relaxed text-emerald-950 text-justify">
                                                        {renderInlineContent(p.textZh)}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="text-xs text-slate-500 flex items-center justify-between">
                                                    <span>暂无翻译</span>
                                                    <button
                                                        onClick={() => toggleBlockExpand(p)}
                                                        className="text-emerald-700 font-medium hover:underline"
                                                    >
                                                        重试翻译
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        if (block.type === 'figure') {
                            const fig = block as PaperFigureBlock;
                            const isCaptionExpanded = expandedBlockIds.has(fig.id);

                            return (
                                <div key={fig.id} className="my-6 space-y-2.5">
                                    {/* 插图卡片 */}
                                    <div
                                        onClick={() => setActiveFigure(fig)}
                                        className="rounded-2xl overflow-hidden border border-slate-200/90 bg-white cursor-pointer group relative shadow-sm hover:border-emerald-300 transition-all"
                                    >
                                        <div className="relative flex items-center justify-center p-4 max-h-[380px] overflow-hidden bg-slate-50/50">
                                            <img
                                                src={fig.imageUrl}
                                                alt={fig.label || 'Paper figure'}
                                                className="max-h-[340px] w-auto object-contain rounded transition duration-200 group-hover:scale-[1.01]"
                                                loading="lazy"
                                            />
                                        </div>
                                        <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-white/90 backdrop-blur-md text-[10px] text-slate-700 font-mono flex items-center gap-1 opacity-80 group-hover:opacity-100 transition border border-slate-200 shadow-sm font-medium">
                                            <Eye size={12} />
                                            <span>双指缩放原图</span>
                                        </div>
                                    </div>

                                    {/* 图注 */}
                                    {(fig.caption || fig.captionZh) && (
                                        <div className="px-2">
                                            <div className="flex items-baseline gap-2">
                                                <span className="font-bold text-emerald-700 text-xs font-mono">
                                                    {fig.label || 'Fig.'}
                                                </span>
                                                <p
                                                    onClick={() => toggleBlockExpand(fig)}
                                                    className="text-xs text-slate-600 leading-relaxed font-serif cursor-pointer hover:text-slate-900"
                                                >
                                                    {fig.caption}
                                                </p>
                                            </div>

                                            {/* 中文图注展开卡片 */}
                                            {isCaptionExpanded && fig.captionZh && (
                                                <div className="mt-2 p-3 rounded-xl bg-emerald-50/70 border border-emerald-100/80 text-xs text-emerald-950 font-sans">
                                                    <span className="text-[10px] font-bold uppercase text-emerald-800 block mb-1">
                                                        中文学术图注
                                                    </span>
                                                    {fig.captionZh}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        return null;
                    })}
                </div>
            </div>

            {/* 排版与字体设置弹窗 */}
            {showTypographyModal && (
                <Modal
                    isOpen={showTypographyModal}
                    onClose={() => setShowTypographyModal(false)}
                    title="排版与字体偏好"
                >
                    <div className="space-y-4 p-1 text-slate-700 select-none">
                        {/* 字体选择 */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                英文正文字体
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { key: 'sans', label: '标准无衬线', desc: 'Inter / 现代系统' },
                                    { key: 'serif', label: '传统优雅衬线', desc: 'Georgia / 纸书感' },
                                    { key: 'mono', label: '学术代码等宽', desc: 'Monospace / 等宽' },
                                    { key: 'dyslexic', label: 'ADHD 专用英文字体', desc: 'OpenDyslexic (仅英文)' }
                                ].map(f => {
                                    const active = typography.fontFamily === f.key;
                                    return (
                                        <button
                                            key={f.key}
                                            onClick={() => updateTypography({ fontFamily: f.key as any })}
                                            className={`p-2.5 rounded-xl border text-left transition-all relative ${
                                                active
                                                    ? 'bg-amber-50/80 border-amber-400 text-amber-900 font-semibold shadow-xs'
                                                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                                            }`}
                                        >
                                            <div className="text-xs flex items-center justify-between">
                                                <span>{f.label}</span>
                                                {active && <Check size={14} className="text-amber-600 font-bold" />}
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                                                {f.desc}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ADHD 仿生阅读模式开关 */}
                        <div className="p-3 bg-amber-50/50 border border-amber-200/70 rounded-xl flex items-center justify-between">
                            <div className="space-y-0.5 pr-3">
                                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                    <span>仿生阅读 (Bionic Reading)</span>
                                    <span className="text-[10px] bg-amber-200/70 text-amber-900 px-1.5 py-0.2 rounded-full font-mono font-semibold">ADHD 辅助</span>
                                </div>
                                <div className="text-[11px] text-slate-500">
                                    英文单词前部加粗，引导视线跳跃聚光，大幅降低扫读疲劳。
                                </div>
                            </div>
                            <button
                                onClick={() => updateTypography({ bionicReading: !typography.bionicReading })}
                                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                                    typography.bionicReading ? 'bg-emerald-600' : 'bg-slate-300'
                                }`}
                            >
                                <span
                                    className={`block w-4 h-4 rounded-full bg-white transition-transform transform ${
                                        typography.bionicReading ? 'translate-x-6' : 'translate-x-1'
                                    } top-1 absolute shadow-xs`}
                                />
                            </button>
                        </div>

                        {/* 字号大小 */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                字号大小
                            </label>
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { key: 'sm', label: '小', px: '14px' },
                                    { key: 'base', label: '标准', px: '16px' },
                                    { key: 'lg', label: '大', px: '18px' },
                                    { key: 'xl', label: '特大', px: '20px' }
                                ].map(s => {
                                    const active = typography.fontSize === s.key;
                                    return (
                                        <button
                                            key={s.key}
                                            onClick={() => updateTypography({ fontSize: s.key as any })}
                                            className={`py-2 rounded-xl border text-center transition-all ${
                                                active
                                                    ? 'bg-amber-100 border-amber-400 text-amber-900 font-bold shadow-xs'
                                                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                                            }`}
                                        >
                                            <div className="text-xs font-semibold">{s.label}</div>
                                            <div className="text-[10px] text-slate-400">{s.px}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="pt-2 text-right">
                            <button
                                onClick={() => setShowTypographyModal(false)}
                                className="px-5 py-1.5 rounded-full bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition active:scale-95"
                            >
                                完成
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* 插图全屏灯箱 */}
            {activeFigure && (
                <PaperFigureModal
                    figure={activeFigure}
                    onClose={() => setActiveFigure(null)}
                />
            )}

            {/* Zotero 联动与学术引用导出弹窗 */}
            <ZoteroExportModal
                isOpen={showZoteroModal}
                paper={paper}
                onClose={() => setShowZoteroModal(false)}
                onOpenSettings={onOpenZoteroSettings}
            />
        </div>
    );
};
