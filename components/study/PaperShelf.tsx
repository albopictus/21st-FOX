import React, { useState, useEffect } from 'react';
import { BookOpen, MagnifyingGlass, DownloadSimple, Trash, BookmarkSimple, Sparkle, ArrowRight, SpinnerGap, Plus, Newspaper, X, Check, CalendarBlank, Article, CaretDown, CaretUp, Info } from '@phosphor-icons/react';
import type { StudyPaper, APIConfig } from '../../types';
import { DB } from '../../utils/db';
import { searchEuropePmcArticles, fetchAndParseStudyPaper, EuropePmcArticleSummary } from '../../utils/europePmc';
import Modal from '../os/Modal';

interface PaperShelfProps {
    onSelectPaper: (paper: StudyPaper) => void;
    apiConfig: APIConfig;
    onBackToCourses?: () => void;
    embedded?: boolean;
}

const DEFAULT_KEYWORDS = [
    'CRISPR',
    'Neuroscience',
    'Optogenetics',
    'Microglia',
    'Nanomedicine',
    'Synthetic Biology',
    'Immunotherapy'
];
const TAGS_STORAGE_KEY = 'sully_study_paper_tags';

export const PaperShelf: React.FC<PaperShelfProps> = ({
    onSelectPaper,
    apiConfig,
    onBackToCourses,
    embedded = false,
}) => {
    const [papers, setPapers] = useState<StudyPaper[]>([]);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<EuropePmcArticleSummary[]>([]);
    const [isFetchingPaper, setIsFetchingPaper] = useState(false);
    const [fetchingPmcid, setFetchingPmcid] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'my_papers' | 'discover'>('my_papers');
    const [expandedAbstractIds, setExpandedAbstractIds] = useState<Set<string>>(new Set());

    const toggleAbstract = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setExpandedAbstractIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // 自定义快捷标签
    const [tags, setTags] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(TAGS_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch {}
        return DEFAULT_KEYWORDS;
    });
    const [showTagModal, setShowTagModal] = useState(false);
    const [newTagText, setNewTagText] = useState('');

    const saveTags = (newTags: string[]) => {
        setTags(newTags);
        try {
            localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(newTags));
        } catch {}
    };

    const handleAddTag = () => {
        const trimmed = newTagText.trim();
        if (!trimmed) return;
        if (tags.includes(trimmed)) {
            setNewTagText('');
            return;
        }
        const updated = [...tags, trimmed];
        saveTags(updated);
        setNewTagText('');
    };

    const handleDeleteTag = (tagToDelete: string) => {
        const updated = tags.filter(t => t !== tagToDelete);
        saveTags(updated);
    };

    const handleResetTags = () => {
        if (confirm('是否恢复默认学科标签？')) {
            saveTags(DEFAULT_KEYWORDS);
        }
    };

    useEffect(() => {
        loadPapers();
    }, []);

    const loadPapers = async () => {
        const list = await DB.getAllPapers();
        setPapers(list);
    };

    const handleDeletePaper = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('确定要删除这篇文献及其本地阅读记录吗？')) {
            await DB.deletePaper(id);
            await loadPapers();
        }
    };

    const handleSearch = async (keyword?: string) => {
        const kw = keyword || searchKeyword;
        if (!kw.trim()) return;
        try {
            setIsSearching(true);
            const res = await searchEuropePmcArticles(kw, 8);
            setSearchResults(res);
            setActiveTab('discover');
        } catch (e: any) {
            alert(`检索文献失败: ${e.message || '网络连接超时'}`);
        } finally {
            setIsSearching(false);
        }
    };

    const handleFetchPaper = async (summary: EuropePmcArticleSummary) => {
        if (!summary.pmcid) return;
        try {
            setIsFetchingPaper(true);
            setFetchingPmcid(summary.pmcid);

            const paper = await fetchAndParseStudyPaper(summary.pmcid, searchKeyword ? [searchKeyword] : [], summary);
            await DB.savePaper(paper);
            await loadPapers();
            onSelectPaper(paper);
        } catch (e: any) {
            alert(`抓取文献 JATS XML 失败: ${e.message || '未知错误'}`);
        } finally {
            setIsFetchingPaper(false);
            setFetchingPmcid(null);
        }
    };

    return (
        <div className={embedded ? "space-y-4 text-slate-800 select-none font-sans" : "flex flex-col h-full w-full bg-[#fdfbf7] text-slate-800 select-none overflow-hidden font-sans"}>
            {/* 顶栏：仅在独立全屏模式下展示自习室统一毛玻璃顶栏与安全区 */}
            {!embedded && (
                <div className="bg-[#fdfbf7]/90 backdrop-blur-md border-b border-[#e5e5e5] shrink-0 sticky top-0 z-20" style={{ paddingTop: 'var(--safe-top)' }}>
                    <div className="flex items-center px-4 sm:px-6 py-2.5">
                        <div className="flex justify-between items-center w-full">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={onBackToCourses}
                                    className="p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform"
                                    title="返回课程"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-600">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                                    </svg>
                                </button>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-800 text-lg tracking-wide">文献晨读</span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono font-bold tracking-tight">
                                        Europe PMC
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={onBackToCourses}
                                className="px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200/80 text-xs font-medium text-slate-600 active:scale-95 transition-all"
                            >
                                返回课程
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 搜索栏与快捷标签区 */}
            <div className={embedded ? "space-y-2.5" : "px-4 sm:px-6 pb-3 space-y-2.5 shrink-0 bg-[#fdfbf7]/90 backdrop-blur-md border-b border-[#e5e5e5]"}>
                {/* 搜索框：符合 ui-writing-rules 带图标的胶囊输入框 */}
                <div className="relative flex items-center">
                    <input
                        type="text"
                        value={searchKeyword}
                        onChange={e => setSearchKeyword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        placeholder="检索学科或前沿文献（例：CRISPR, microglia, optogenetics）"
                        className="w-full bg-white border border-slate-200/90 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 rounded-2xl py-2.5 pl-10 pr-24 text-xs text-slate-800 placeholder-slate-400 outline-none transition shadow-xs"
                    />
                    <MagnifyingGlass size={16} className="absolute left-3.5 text-slate-400 pointer-events-none" />
                    <button
                        onClick={() => handleSearch()}
                        disabled={isSearching}
                        className="absolute right-1.5 px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition active:scale-95 shadow-xs flex items-center gap-1 disabled:opacity-50"
                    >
                        {isSearching ? <SpinnerGap size={13} className="animate-spin" /> : <span>检索</span>}
                    </button>
                </div>

                {/* 快捷标签胶囊 */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 pb-1">
                    <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[11px] text-slate-400 font-medium">标签：</span>
                        <button
                            onClick={() => setShowTagModal(true)}
                            className="text-[11px] px-2 py-0.5 rounded-full font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition active:scale-95"
                            title="管理快捷标签"
                        >
                            编辑
                        </button>
                    </div>

                    {tags.map(kw => (
                        <button
                            key={kw}
                            onClick={() => {
                                setSearchKeyword(kw);
                                handleSearch(kw);
                            }}
                            className="px-3 py-1 rounded-full text-xs transition-all shrink-0 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-600 hover:text-emerald-800 border border-slate-200/80 cursor-pointer active:scale-95 shadow-2xs"
                        >
                            {kw}
                        </button>
                    ))}

                    <button
                        onClick={() => setShowTagModal(true)}
                        className="px-2.5 py-1 rounded-full bg-white hover:bg-emerald-50 text-xs text-slate-500 hover:text-emerald-700 transition shrink-0 border border-dashed border-slate-300 hover:border-emerald-400 flex items-center gap-1 shadow-2xs active:scale-95"
                        title="添加或管理标签"
                    >
                        <Plus size={11} weight="bold" />
                        <span>添加</span>
                    </button>
                </div>

                {/* 视图 Tab 切换：符合自习室分栏设计 */}
                <div className="flex bg-slate-200/60 p-1 rounded-2xl gap-1">
                    <button
                        onClick={() => setActiveTab('my_papers')}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            activeTab === 'my_papers'
                                ? 'bg-white text-slate-800 shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        已下载文献 ({papers.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('discover')}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            activeTab === 'discover'
                                ? 'bg-white text-emerald-700 shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        探索检索结果 {searchResults.length > 0 && `(${searchResults.length})`}
                    </button>
                </div>
            </div>

            {/* 内容区：内嵌时自然向下流动，独立时自适应滚动 */}
            <div className={embedded ? "pt-1 pb-16" : "flex-1 overflow-y-auto p-4 sm:p-6 no-scrollbar"}>
                {activeTab === 'my_papers' ? (
                    papers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 text-slate-400">
                            <BookOpen size={48} weight="thin" className="text-slate-300" />
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-slate-600">书架暂无文献</p>
                                <p className="text-xs text-slate-400">在上方检索 Europe PMC 开放获取文献，抓取全文并晨读</p>
                            </div>
                            <button
                                onClick={() => {
                                    const defaultKw = tags[0] || 'CRISPR';
                                    setSearchKeyword(defaultKw);
                                    handleSearch(defaultKw);
                                }}
                                className="mt-2 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition active:scale-95 shadow-sm"
                            >
                                快速抓取 {tags[0] || 'CRISPR'} 前沿
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-20">
                            {papers.map(paper => {
                                const figureBlock = paper.blocks.find(b => b.type === 'figure') as any;
                                return (
                                    <div
                                        key={paper.id}
                                        onClick={() => onSelectPaper(paper)}
                                        className="p-5 rounded-2xl bg-white border border-slate-100 hover:border-emerald-200 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group shadow-sm active:scale-[0.99]"
                                    >
                                        <div className="space-y-2.5">
                                            <div className="flex items-center justify-between text-[10px] gap-2 flex-wrap">
                                                <span className="font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                                    {paper.journalTitle || 'Academic'}
                                                </span>
                                                <div className="flex items-center gap-1.5 text-slate-400 font-mono shrink-0">
                                                    <span>{paper.pmcid}</span>
                                                    {paper.pubDate && (
                                                        <span className="flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full text-[10px]">
                                                            <CalendarBlank size={11} className="text-slate-400" />
                                                            <span>Pub: {paper.pubDate}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <h3 className="text-sm sm:text-base font-bold text-slate-800 font-serif line-clamp-2 leading-snug group-hover:text-emerald-700 transition-colors">
                                                {paper.title}
                                            </h3>

                                            {paper.titleZh && (
                                                <p className="text-xs font-medium text-emerald-800 line-clamp-1 font-sans">
                                                    {paper.titleZh}
                                                </p>
                                            )}

                                            {/* 作者与 DOI */}
                                            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 flex-wrap">
                                                {paper.authorString && (
                                                    <p className="line-clamp-1 flex-1 min-w-[120px]">
                                                        {paper.authorString}
                                                    </p>
                                                )}
                                                {paper.doi && (
                                                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                                        DOI: {paper.doi}
                                                    </span>
                                                )}
                                            </div>

                                            {/* 百字晨读机理摘要预览 */}
                                            {paper.summary100 && (
                                                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-100 text-xs text-emerald-900 line-clamp-2 leading-relaxed font-sans">
                                                    {paper.summary100}
                                                </div>
                                            )}

                                            {/* 图配缩略图 */}
                                            {figureBlock?.imageUrl && (
                                                <div className="h-28 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center p-1">
                                                    <img
                                                        src={figureBlock.imageUrl}
                                                        alt="Figure thumbnail"
                                                        className="max-h-full max-w-full object-contain rounded"
                                                        loading="lazy"
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-3.5 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                                            <div className="flex items-center gap-2 font-medium">
                                                <span>进度: {paper.readProgress || 0}%</span>
                                                {paper.translatedAt && (
                                                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                                        双语
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={(e) => handleDeletePaper(e, paper.id)}
                                                    className="w-8 h-8 rounded-full hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition active:scale-95"
                                                    title="删除文献"
                                                >
                                                    <Trash size={15} />
                                                </button>
                                                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center transition shadow-2xs active:scale-95">
                                                    <ArrowRight size={14} weight="bold" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : (
                    /* 检索结果展示区 */
                    <div className="space-y-3 pb-20">
                        {searchResults.length === 0 ? (
                            <div className="text-center py-20 text-slate-400 text-xs space-y-1">
                                <p className="font-semibold text-slate-500">暂无检索结果</p>
                                <p>请在上方搜索框输入学科关键词检索 Europe PMC 开放获取前沿</p>
                            </div>
                        ) : (
                            searchResults.map(res => {
                                const isFetchingThis = isFetchingPaper && fetchingPmcid === res.pmcid;
                                const isAlreadyDownloaded = papers.some(p => p.pmcid === res.pmcid);
                                const isAbstractExpanded = expandedAbstractIds.has(res.id);

                                return (
                                    <div
                                        key={res.id}
                                        className="p-5 rounded-2xl bg-white border border-slate-100 hover:border-emerald-200 hover:shadow-md transition-all flex flex-col justify-between space-y-3 shadow-xs"
                                    >
                                        <div className="space-y-2">
                                            {/* 顶栏：期刊名、类型徽标与发布日期 */}
                                            <div className="flex items-center justify-between text-[10px] gap-2 flex-wrap">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider truncate max-w-[180px]">
                                                        {res.journalTitle || 'Academic'}
                                                    </span>
                                                    {res.isAbstractOnly && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 font-medium">
                                                            会议简报 / 摘要
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1.5 text-slate-400 font-mono shrink-0">
                                                    <span>{res.pmcid}</span>
                                                    {res.pubDate && (
                                                        <span className="flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full text-[10px]">
                                                            <CalendarBlank size={11} className="text-slate-400" />
                                                            <span>Pub: {res.pubDate}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* 论文标题 */}
                                            <h4 className="text-sm sm:text-base font-bold text-slate-800 font-serif leading-snug">
                                                {res.title}
                                            </h4>

                                            {/* 作者与 DOI 信息 */}
                                            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 flex-wrap">
                                                {res.authorString && (
                                                    <p className="line-clamp-1 flex-1 min-w-[140px]">
                                                        {res.authorString}
                                                    </p>
                                                )}
                                                {res.doi && (
                                                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                                        DOI: {res.doi}
                                                    </span>
                                                )}
                                            </div>

                                            {/* 点一下显示摘要按钮 */}
                                            {res.abstractText && (
                                                <div className="pt-0.5">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => toggleAbstract(res.id, e)}
                                                        className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 active:scale-95 transition bg-emerald-50 hover:bg-emerald-100/80 px-3 py-1 rounded-full border border-emerald-200/60 cursor-pointer shadow-2xs"
                                                    >
                                                        <Article size={13} />
                                                        <span>{isAbstractExpanded ? '收起摘要' : '点一下显示摘要'}</span>
                                                        {isAbstractExpanded ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />}
                                                    </button>
                                                </div>
                                            )}

                                            {/* 展开的摘要预览区 */}
                                            {isAbstractExpanded && res.abstractText && (
                                                <div className="p-3.5 rounded-xl bg-slate-50/90 border border-slate-200/80 text-xs text-slate-700 leading-relaxed font-sans space-y-2 animate-fadeIn">
                                                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200/60 pb-1.5">
                                                        <span className="flex items-center gap-1.5 text-emerald-800 font-mono">
                                                            <BookOpen size={12} weight="bold" />
                                                            <span>Abstract / 原文摘要</span>
                                                        </span>
                                                        {res.firstPublicationDate && (
                                                            <span className="text-slate-400 font-mono">
                                                                Published: {res.firstPublicationDate}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="select-text whitespace-pre-wrap leading-relaxed text-slate-600 font-sans">
                                                        {res.abstractText}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100 mt-2">
                                            <div className="text-[11px] text-slate-400 font-medium">
                                                {res.isAbstractOnly ? (
                                                    <span className="text-amber-600/90 text-[10px]">⚠️ 该文为学术会议简报，正文主要为机理摘要</span>
                                                ) : (
                                                    <span className="text-emerald-700/80 text-[10px]">✓ 包含全文 JATS XML</span>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => handleFetchPaper(res)}
                                                disabled={isFetchingPaper}
                                                className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-2xs shrink-0 ${
                                                    isAlreadyDownloaded
                                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                                                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                                }`}
                                            >
                                                {isFetchingThis ? (
                                                    <>
                                                        <SpinnerGap size={13} className="animate-spin" />
                                                        <span>抓取与解析中...</span>
                                                    </>
                                                ) : isAlreadyDownloaded ? (
                                                    <>
                                                        <BookOpen size={13} />
                                                        <span>打开阅读</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <DownloadSimple size={13} />
                                                        <span>抓取全文并晨读</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* 快捷标签管理弹窗 */}
            <Modal
                isOpen={showTagModal}
                title="管理快捷标签"
                onClose={() => {
                    setShowTagModal(false);
                    setNewTagText('');
                }}
                footer={
                    <button
                        onClick={() => {
                            setShowTagModal(false);
                            setNewTagText('');
                        }}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl active:scale-95 transition-all text-xs shadow-md shadow-emerald-200"
                    >
                        完成
                    </button>
                }
            >
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
                            添加新标签
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                autoFocus
                                value={newTagText}
                                onChange={e => setNewTagText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                                placeholder="输入新学科标签（如：Cardiology）"
                                className="flex-1 bg-slate-100 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none border border-slate-200/80 focus:border-emerald-500 focus:bg-white transition"
                            />
                            <button
                                onClick={handleAddTag}
                                disabled={!newTagText.trim()}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs disabled:opacity-40 active:scale-95 transition flex items-center gap-1 shrink-0 shadow-xs"
                            >
                                <Plus size={13} weight="bold" />
                                <span>添加</span>
                            </button>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                当前快捷标签 ({tags.length})
                            </label>
                            <button
                                onClick={handleResetTags}
                                className="text-[10px] text-slate-400 hover:text-emerald-700 underline transition"
                            >
                                恢复默认标签
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto no-scrollbar py-1">
                            {tags.map(kw => (
                                <div
                                    key={kw}
                                    className="px-3 py-1.5 rounded-full text-xs bg-slate-100 text-slate-700 border border-slate-200/80 flex items-center gap-1.5 shadow-2xs group"
                                >
                                    <span>{kw}</span>
                                    <button
                                        onClick={() => handleDeleteTag(kw)}
                                        className="w-4 h-4 rounded-full hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center transition active:scale-90"
                                        title={`删除 "${kw}"`}
                                    >
                                        <X size={11} weight="bold" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
