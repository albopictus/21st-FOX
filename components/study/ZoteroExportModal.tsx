import React, { useState, useEffect } from 'react';
import {
    X,
    Check,
    Copy,
    DownloadSimple,
    ArrowSquareOut,
    SpinnerGap,
    CloudArrowUp,
    Article,
    Info,
    CheckCircle,
    WarningCircle,
    Gear
} from '@phosphor-icons/react';
import type { StudyPaper } from '../../types';
import {
    ZoteroConfig,
    ZoteroSyncResult,
    getZoteroConfig,
    syncPaperToZotero,
    generateRisContent,
    generateBibtexContent,
    generateApaCitation,
    downloadTextFile
} from '../../utils/zotero';

interface ZoteroExportModalProps {
    isOpen: boolean;
    paper: StudyPaper | null;
    onClose: () => void;
    onOpenSettings?: () => void;
}

export const ZoteroExportModal: React.FC<ZoteroExportModalProps> = ({
    isOpen,
    paper,
    onClose,
    onOpenSettings
}) => {
    // 从本地读取已绑定的 Zotero 配置（不在此页提供登录输入）
    const [config, setConfig] = useState<ZoteroConfig>({ userId: '', apiKey: '' });

    // 同步状态
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<ZoteroSyncResult | null>(null);

    // 复制状态反馈
    const [copiedKey, setCopiedKey] = useState<'apa' | 'ris' | 'bib' | null>(null);

    // 源码预览类型
    const [previewType, setPreviewType] = useState<'ris' | 'bib'>('ris');

    useEffect(() => {
        if (isOpen) {
            setConfig(getZoteroConfig());
            setSyncResult(null);
            setCopiedKey(null);
        }
    }, [isOpen]);

    if (!isOpen || !paper) return null;

    const isZoteroConfigured = Boolean(config.userId && config.apiKey);

    const risContent = generateRisContent(paper);
    const bibContent = generateBibtexContent(paper);
    const apaCitation = generateApaCitation(paper);

    const safeFilenamePrefix = paper.title
        .slice(0, 30)
        .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
        .replace(/_+/g, '_') || 'paper';

    const handleSync = async () => {
        if (!isZoteroConfigured) return;
        setIsSyncing(true);
        setSyncResult(null);
        try {
            const res = await syncPaperToZotero(paper, config);
            setSyncResult(res);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDownloadRis = () => {
        downloadTextFile(`${safeFilenamePrefix}.ris`, risContent, 'application/x-research-info-systems');
    };

    const handleDownloadBib = () => {
        downloadTextFile(`${safeFilenamePrefix}.bib`, bibContent, 'application/x-bibtex');
    };

    const copyToClipboard = async (text: string, key: 'apa' | 'ris' | 'bib') => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 2000);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 2000);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
            <div
                className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-slide-up"
                onClick={e => e.stopPropagation()}
            >
                {/* 弹窗顶栏 */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-[#fdfbf7]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 border border-red-100 flex items-center justify-center font-bold text-base shadow-2xs">
                            Z
                        </div>
                        <div>
                            <h3 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-1.5">
                                <span>Zotero 联动与学术引用</span>
                            </h3>
                            <p className="text-[11px] text-slate-500 line-clamp-1 max-w-[280px] sm:max-w-[360px]">
                                {paper.title}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 transition"
                        title="关闭"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* 弹窗主体内容：专注一键保存与标准引用导出，不包含复杂登录表单 */}
                <div className="p-5 overflow-y-auto no-scrollbar space-y-4 flex-1">
                    {/* 板块 1: Zotero 云端一键同步 */}
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-red-50/70 via-white to-orange-50/40 border border-red-100 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CloudArrowUp size={18} className="text-red-600" weight="bold" />
                                <span className="text-xs font-bold text-slate-800">Zotero 云端文库同步</span>
                            </div>
                            {isZoteroConfigured ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-mono font-medium">
                                    ID: {config.userId}
                                </span>
                            ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                                    未绑定
                                </span>
                            )}
                        </div>

                        {isZoteroConfigured ? (
                            <div className="space-y-2.5">
                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                    使用自习室已绑定的 Zotero 账号，一键将当前文献（标题、结构化作者、DOI、期刊、摘要与标签）归档至您的云端个人文库。
                                </p>
                                <button
                                    onClick={handleSync}
                                    disabled={isSyncing}
                                    className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs active:scale-95 transition disabled:opacity-50"
                                >
                                    {isSyncing ? (
                                        <>
                                            <SpinnerGap size={14} className="animate-spin" />
                                            <span>正在推送至 Zotero 云端...</span>
                                        </>
                                    ) : (
                                        <>
                                            <CloudArrowUp size={15} weight="bold" />
                                            <span>一键同步该文献至 Zotero</span>
                                        </>
                                    )}
                                </button>

                                {/* 同步结果反馈 */}
                                {syncResult && (
                                    <div
                                        className={`p-3 rounded-xl text-xs space-y-2 ${
                                            syncResult.success
                                                ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                                                : 'bg-rose-50 border border-rose-200 text-rose-900'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 font-semibold">
                                            {syncResult.success ? (
                                                <CheckCircle size={15} weight="fill" className="text-emerald-600 shrink-0" />
                                            ) : (
                                                <WarningCircle size={15} weight="fill" className="text-rose-600 shrink-0" />
                                            )}
                                            <span>{syncResult.message}</span>
                                        </div>

                                        {syncResult.success && syncResult.itemKey && (
                                            <div className="flex flex-wrap gap-2 pt-0.5">
                                                {syncResult.clientUri && (
                                                    <a
                                                        href={syncResult.clientUri}
                                                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex items-center gap-1 shadow-2xs transition active:scale-95"
                                                        title="调起本地 Zotero 桌面客户端并定位此条目"
                                                    >
                                                        <ArrowSquareOut size={12} />
                                                        <span>在 Zotero 客户端定位</span>
                                                    </a>
                                                )}
                                                {syncResult.webUrl && (
                                                    <a
                                                        href={syncResult.webUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-100/60 border border-emerald-300 text-emerald-800 font-semibold text-[11px] flex items-center gap-1 transition active:scale-95"
                                                        title="在浏览器中查看 Zotero 网页版条目"
                                                    >
                                                        <ArrowSquareOut size={12} />
                                                        <span>在 Zotero 网页版查看</span>
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white/80 p-3 rounded-xl border border-red-100/80 text-xs text-slate-600 space-y-2">
                                <div className="flex items-start gap-2">
                                    <Info size={15} className="text-slate-400 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-slate-500 leading-relaxed">
                                        尚未绑定 Zotero 账号。如需一键推送到云端个人文库，请先前往自习室设置中填写您的 User ID 与 API Key。
                                    </p>
                                </div>
                                {onOpenSettings && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onClose();
                                            onOpenSettings();
                                        }}
                                        className="text-xs font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1 active:scale-95 transition"
                                    >
                                        <Gear size={13} />
                                        <span>前往自习室设置绑定 Zotero</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 板块 2: APA 7th 参考文献格式一键复制 */}
                    <div className="space-y-1.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                <Article size={14} className="text-slate-500" />
                                <span>APA 7th 参考文献引用</span>
                            </span>
                            <button
                                onClick={() => copyToClipboard(apaCitation, 'apa')}
                                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 active:scale-95 transition px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100/60 border border-emerald-200/80"
                            >
                                {copiedKey === 'apa' ? (
                                    <>
                                        <Check size={12} weight="bold" className="text-emerald-600" />
                                        <span>已复制！</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy size={12} />
                                        <span>一键复制 APA</span>
                                    </>
                                )}
                            </button>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 font-serif leading-relaxed select-text shadow-2xs">
                            {apaCitation}
                        </div>
                    </div>

                    {/* 板块 3: 标准学术文献文件导出 (离线即用) */}
                    <div className="space-y-2">
                        <div className="text-xs font-bold text-slate-700">标准文献文件一键导出</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-2">
                                <div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-xs text-slate-800">RIS 格式 (.ris)</span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-mono font-bold">
                                            通用
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                        双击直接被 Zotero、EndNote、Mendeley 等自动识别导入。
                                    </p>
                                </div>
                                <button
                                    onClick={handleDownloadRis}
                                    className="w-full py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition"
                                >
                                    <DownloadSimple size={14} />
                                    <span>下载 .ris 文件</span>
                                </button>
                            </div>

                            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-2">
                                <div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-xs text-slate-800">BibTeX 格式 (.bib)</span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono font-bold">
                                            LaTeX
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                        适用于 LaTeX、Overleaf 论文撰写与 Obsidian 学术笔记。
                                    </p>
                                </div>
                                <button
                                    onClick={handleDownloadBib}
                                    className="w-full py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition"
                                >
                                    <DownloadSimple size={14} />
                                    <span>下载 .bib 文件</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 板块 4: 源码实时预览与复制 */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-xs">
                                <span className="font-bold text-slate-700">源码预览:</span>
                                <button
                                    onClick={() => setPreviewType('ris')}
                                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition ${
                                        previewType === 'ris' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-200'
                                    }`}
                                >
                                    RIS
                                </button>
                                <button
                                    onClick={() => setPreviewType('bib')}
                                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition ${
                                        previewType === 'bib' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-200'
                                    }`}
                                >
                                    BibTeX
                                </button>
                            </div>
                            <button
                                onClick={() =>
                                    copyToClipboard(
                                        previewType === 'ris' ? risContent : bibContent,
                                        previewType
                                    )
                                }
                                className="text-xs font-semibold text-slate-600 hover:text-slate-800 flex items-center gap-1 active:scale-95 transition"
                            >
                                {copiedKey === previewType ? (
                                    <>
                                        <Check size={12} weight="bold" className="text-emerald-600" />
                                        <span>已复制！</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy size={12} />
                                        <span>复制源码</span>
                                    </>
                                )}
                            </button>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] leading-relaxed max-h-36 overflow-y-auto select-text whitespace-pre no-scrollbar">
                            {previewType === 'ris' ? risContent : bibContent}
                        </div>
                    </div>
                </div>

                {/* 底部关闭按钮 */}
                <div className="px-5 py-3 border-t border-slate-100 flex justify-end shrink-0 bg-slate-50/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-200/80 hover:bg-slate-300 text-slate-700 font-semibold text-xs rounded-xl active:scale-95 transition"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
    );
};
