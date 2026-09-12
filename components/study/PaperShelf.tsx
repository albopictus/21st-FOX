import React, { useState, useEffect } from 'react';
import { BookOpen, MagnifyingGlass, DownloadSimple, Trash, BookmarkSimple, Sparkle, ArrowRight, SpinnerGap, Plus, Newspaper, Gear, X, Check } from '@phosphor-icons/react';
import type { StudyPaper, APIConfig } from '../../types';
import { DB } from '../../utils/db';
import { searchEuropePmcArticles, fetchAndParseStudyPaper, EuropePmcArticleSummary } from '../../utils/europePmc';

interface PaperShelfProps {
    onSelectPaper: (paper: StudyPaper) => void;
    apiConfig: APIConfig;
    onBackToCourses: () => void;
    onOpenSettings?: () => void;
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
    onOpenSettings
}) => {
    const [papers, setPapers] = useState<StudyPaper[]>([]);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<EuropePmcArticleSummary[]>([]);
    const [isFetchingPaper, setIsFetchingPaper] = useState(false);
    const [fetchingPmcid, setFetchingPmcid] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'my_papers' | 'discover'>('my_papers');

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
    const [isManagingTags, setIsManagingTags] = useState(false);
    const [isAddingTag, setIsAddingTag] = useState(false);
    const [newTagText, setNewTagText] = useState('');

    const saveTags = (newTags: string[]) => {
        setTags(newTags);
        try {
            localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(newTags));
        } catch {}
    };

    const handleAddTag = () => {
        const trimmed = newTagText.trim();
        if (!trimmed) {
            setIsAddingTag(false);
            return;
        }
        if (tags.includes(trimmed)) {
            setIsAddingTag(false);
            setNewTagText('');
            return;
        }
        const updated = [...tags, trimmed];
        saveTags(updated);
        setNewTagText('');
        setIsAddingTag(false);
    };

    const handleDeleteTag = (e: React.MouseEvent, tagToDelete: string) => {
        e.stopPropagation();
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

            const paper = await fetchAndParseStudyPaper(summary.pmcid, searchKeyword ? [searchKeyword] : []);
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
        <div className="flex flex-col h-full w-full bg-[#0d131a] text-slate-100 select-none overflow-hidden font-sans">
            {/* 顶栏 */}
            <div className="flex-none px-4 pt-4 pb-3 bg-[#141d27]/90 backdrop-blur-md border-b border-white/10">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                            <Newspaper size={18} weight="bold" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-100 flex items-center gap-1.5 font-serif">
                                <span>文献晨读</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                                    Europe PMC
                                </span>
                            </h2>
                            <p className="text-[11px] text-slate-400">
                                国际前沿 JATS XML 全文抓取与双语浸润阅读
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {onOpenSettings && (
                            <button
                                onClick={onOpenSettings}
                                className="px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs text-slate-300 border border-white/10 active:scale-95 transition flex items-center gap-1.5"
                                title="配置独立文献翻译 API 线路与模型"
                            >
                                <Gear size={14} className="text-emerald-400" />
                                <span className="text-[11px]">API 线路</span>
                            </button>
                        )}
                        <button
                            onClick={onBackToCourses}
                            className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs text-slate-300 border border-white/10 active:scale-95 transition"
                        >
                            返回课程
                        </button>
                    </div>
                </div>

                {/* 搜索框 */}
                <div className="relative flex items-center">
                    <input
                        type="text"
                        value={searchKeyword}
                        onChange={e => setSearchKeyword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        placeholder="搜索学科或前沿（例：CRISPR, microglia, optogenetics）"
                        className="w-full bg-[#0d131a] border border-white/15 focus:border-emerald-500/60 rounded-xl py-2 pl-9 pr-20 text-xs text-white placeholder-slate-500 outline-none transition"
                    />
                    <MagnifyingGlass size={15} className="absolute left-3 text-slate-500" />
                    <button
                        onClick={() => handleSearch()}
                        disabled={isSearching}
                        className="absolute right-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium transition active:scale-95 flex items-center gap-1"
                    >
                        {isSearching ? <SpinnerGap size={12} className="animate-spin" /> : <span>检索</span>}
                    </button>
                </div>

                {/* 快捷标签胶囊 */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2.5 pb-1">
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-[10px] text-slate-500 font-medium">快捷标签：</span>
                        <button
                            onClick={() => setIsManagingTags(!isManagingTags)}
                            className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                                isManagingTags
                                    ? 'bg-amber-500/20 text-amber-300 font-bold'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                            title={isManagingTags ? "完成管理" : "管理快捷标签"}
                        >
                            {isManagingTags ? '完成' : '编辑'}
                        </button>
                        {isManagingTags && (
                            <button
                                onClick={handleResetTags}
                                className="text-[9px] text-slate-500 hover:text-slate-400 underline ml-0.5"
                                title="恢复默认标签"
                            >
                                重置
                            </button>
                        )}
                    </div>

                    {tags.map(kw => (
                        <div
                            key={kw}
                            onClick={() => {
                                if (!isManagingTags) {
                                    setSearchKeyword(kw);
                                    handleSearch(kw);
                                }
                            }}
                            className={`px-2 py-0.5 rounded-full text-[10px] transition flex-shrink-0 flex items-center gap-1 border ${
                                isManagingTags
                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-200 cursor-default'
                                    : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-emerald-300 border-white/5 cursor-pointer'
                            }`}
                        >
                            <span>{kw}</span>
                            {isManagingTags && (
                                <button
                                    onClick={(e) => handleDeleteTag(e, kw)}
                                    className="w-3.5 h-3.5 rounded-full hover:bg-rose-500/40 text-slate-400 hover:text-rose-300 flex items-center justify-center transition -mr-0.5"
                                    title={`删除标签 "${kw}"`}
                                >
                                    <X size={10} weight="bold" />
                                </button>
                            )}
                        </div>
                    ))}

                    {/* 添加新标签 */}
                    {isAddingTag ? (
                        <div className="flex items-center gap-1 flex-shrink-0 bg-white/10 border border-emerald-500/40 rounded-full px-2 py-0.5">
                            <input
                                type="text"
                                autoFocus
                                value={newTagText}
                                onChange={e => setNewTagText(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleAddTag();
                                    if (e.key === 'Escape') {
                                        setIsAddingTag(false);
                                        setNewTagText('');
                                    }
                                }}
                                placeholder="新标签..."
                                className="bg-transparent text-[10px] text-white outline-none w-16 placeholder-slate-500"
                            />
                            <button
                                onClick={handleAddTag}
                                className="text-emerald-400 hover:text-emerald-300 p-0.5"
                                title="确认添加"
                            >
                                <Check size={12} weight="bold" />
                            </button>
                            <button
                                onClick={() => {
                                    setIsAddingTag(false);
                                    setNewTagText('');
                                }}
                                className="text-slate-400 hover:text-slate-200 p-0.5"
                                title="取消"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsAddingTag(true)}
                            className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-emerald-500/20 text-[10px] text-slate-400 hover:text-emerald-300 transition flex-shrink-0 border border-dashed border-white/20 hover:border-emerald-500/40 flex items-center gap-0.5"
                            title="添加新标签"
                        >
                            <Plus size={10} weight="bold" />
                            <span>添加</span>
                        </button>
                    )}
                </div>

                {/* 视图 Tab 切换 */}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                    <button
                        onClick={() => setActiveTab('my_papers')}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                            activeTab === 'my_papers'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        已下载文献 ({papers.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('discover')}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                            activeTab === 'discover'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        探索检索结果 {searchResults.length > 0 && `(${searchResults.length})`}
                    </button>
                </div>
            </div>

            {/* 内容滚动区 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeTab === 'my_papers' ? (
                    papers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 text-slate-500">
                            <BookOpen size={48} weight="thin" className="text-slate-600" />
                            <p className="text-sm">暂无本地文献，请通过上方搜索框输入关键词抓取</p>
                            <button
                                onClick={() => {
                                    const defaultKw = tags[0] || 'CRISPR';
                                    setSearchKeyword(defaultKw);
                                    handleSearch(defaultKw);
                                }}
                                className="px-4 py-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs font-medium transition"
                            >
                                快速抓取 {tags[0] || 'CRISPR'} 前沿文献
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-16">
                            {papers.map(paper => {
                                const figureBlock = paper.blocks.find(b => b.type === 'figure') as any;
                                return (
                                    <div
                                        key={paper.id}
                                        onClick={() => onSelectPaper(paper)}
                                        className="p-3.5 rounded-xl bg-[#141d27]/70 hover:bg-[#182330] border border-white/10 hover:border-emerald-500/40 cursor-pointer transition flex flex-col justify-between group shadow-sm"
                                    >
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between text-[10px]">
                                                <span className="font-mono text-emerald-400 font-bold uppercase tracking-wider">
                                                    {paper.journalTitle || 'Academic'}
                                                </span>
                                                <span className="text-slate-400 font-mono">
                                                    {paper.pmcid}
                                                </span>
                                            </div>

                                            <h3 className="text-sm font-bold text-slate-100 font-serif line-clamp-2 leading-snug group-hover:text-emerald-300 transition">
                                                {paper.title}
                                            </h3>

                                            {paper.titleZh && (
                                                <p className="text-xs text-emerald-300/80 line-clamp-1 font-sans">
                                                    {paper.titleZh}
                                                </p>
                                            )}

                                            {/* 百字晨读机理摘要预览 */}
                                            {paper.summary100 && (
                                                <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-[11px] text-emerald-100/90 line-clamp-2 leading-relaxed font-sans">
                                                    {paper.summary100}
                                                </div>
                                            )}

                                            {/* 图配缩略图 */}
                                            {figureBlock?.imageUrl && (
                                                <div className="h-24 rounded-lg overflow-hidden bg-black/40 border border-white/5 flex items-center justify-center">
                                                    <img
                                                        src={figureBlock.imageUrl}
                                                        alt="Figure thumbnail"
                                                        className="max-h-full max-w-full object-contain"
                                                        loading="lazy"
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-3 mt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                                            <div className="flex items-center gap-2">
                                                <span>进度: {paper.readProgress || 0}%</span>
                                                {paper.translatedAt && (
                                                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">
                                                        双语
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={(e) => handleDeletePaper(e, paper.id)}
                                                    className="w-7 h-7 rounded-full hover:bg-red-500/20 text-slate-500 hover:text-red-400 flex items-center justify-center transition"
                                                    title="删除"
                                                >
                                                    <Trash size={14} />
                                                </button>
                                                <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition">
                                                    <ArrowRight size={13} weight="bold" />
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
                    <div className="space-y-3 pb-16">
                        {searchResults.length === 0 ? (
                            <div className="text-center py-16 text-slate-500 text-xs">
                                暂无检索结果，请在上方输入关键词检索 Europe PMC
                            </div>
                        ) : (
                            searchResults.map(res => {
                                const isFetchingThis = isFetchingPaper && fetchingPmcid === res.pmcid;
                                const isAlreadyDownloaded = papers.some(p => p.pmcid === res.pmcid);

                                return (
                                    <div
                                        key={res.id}
                                        className="p-3.5 rounded-xl bg-[#141d27]/70 border border-white/10 hover:border-white/20 transition flex flex-col justify-between space-y-2"
                                    >
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between text-[10px]">
                                                <span className="font-mono text-emerald-400 font-bold uppercase">
                                                    {res.journalTitle || 'Academic'}
                                                </span>
                                                <span className="text-slate-400 font-mono">
                                                    {res.pmcid} · {res.pubYear}
                                                </span>
                                            </div>

                                            <h4 className="text-sm font-bold text-slate-100 font-serif leading-snug">
                                                {res.title}
                                            </h4>

                                            {res.authorString && (
                                                <p className="text-[11px] text-slate-400 line-clamp-1">
                                                    {res.authorString}
                                                </p>
                                            )}
                                        </div>

                                        <div className="pt-2 flex items-center justify-end">
                                            <button
                                                onClick={() => handleFetchPaper(res)}
                                                disabled={isFetchingPaper}
                                                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition active:scale-95 ${
                                                    isAlreadyDownloaded
                                                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
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
        </div>
    );
};
