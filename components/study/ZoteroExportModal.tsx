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
    Key,
    User,
    FolderSimple,
    Info,
    Eye,
    EyeSlash,
    CheckCircle,
    WarningCircle,
    ArrowClockwise
} from '@phosphor-icons/react';
import type { StudyPaper } from '../../types';
import {
    ZoteroConfig,
    ZoteroSyncResult,
    getZoteroConfig,
    saveZoteroConfig,
    testZoteroConnection,
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
}

export const ZoteroExportModal: React.FC<ZoteroExportModalProps> = ({ isOpen, paper, onClose }) => {
    const [activeTab, setActiveTab] = useState<'sync' | 'export'>('sync');

    // Zotero 配置
    const [userId, setUserId] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [collectionKey, setCollectionKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);

    // 测试连接状态
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // 同步状态
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<ZoteroSyncResult | null>(null);

    // 复制状态提示
    const [copiedKey, setCopiedKey] = useState<'apa' | 'ris' | 'bib' | null>(null);

    // 预览类型
    const [previewType, setPreviewType] = useState<'ris' | 'bib'>('ris');

    useEffect(() => {
        if (isOpen) {
            const cfg = getZoteroConfig();
            setUserId(cfg.userId);
            setApiKey(cfg.apiKey);
            setCollectionKey(cfg.collectionKey || '');
            setTestResult(null);
            setSyncResult(null);
            setCopiedKey(null);
        }
    }, [isOpen]);

    if (!isOpen || !paper) return null;

    const currentConfig: ZoteroConfig = {
        userId: userId.trim(),
        apiKey: apiKey.trim(),
        collectionKey: collectionKey.trim() || undefined
    };

    const risContent = generateRisContent(paper);
    const bibContent = generateBibtexContent(paper);
    const apaCitation = generateApaCitation(paper);

    const safeFilenamePrefix = paper.title
        .slice(0, 30)
        .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
        .replace(/_+/g, '_') || 'paper';

    const handleSaveConfig = () => {
        saveZoteroConfig(currentConfig);
    };

    const handleTestConnection = async () => {
        handleSaveConfig();
        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await testZoteroConnection(currentConfig);
            setTestResult(res);
        } finally {
            setIsTesting(false);
        }
    };

    const handleSync = async () => {
        handleSaveConfig();
        setIsSyncing(true);
        setSyncResult(null);
        try {
            const res = await syncPaperToZotero(paper, currentConfig);
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

                {/* Tab 切换 */}
                <div className="px-5 pt-3 shrink-0 bg-white">
                    <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
                        <button
                            onClick={() => setActiveTab('sync')}
                            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                activeTab === 'sync'
                                    ? 'bg-white text-red-600 shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <CloudArrowUp size={14} weight={activeTab === 'sync' ? 'bold' : 'regular'} />
                            <span>Zotero 云端同步</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('export')}
                            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                activeTab === 'export'
                                    ? 'bg-white text-emerald-700 shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <Article size={14} weight={activeTab === 'export' ? 'bold' : 'regular'} />
                            <span>标准文献引用</span>
                        </button>
                    </div>
                </div>

                {/* 弹窗主体内容 */}
                <div className="p-5 overflow-y-auto no-scrollbar space-y-4 flex-1">
                    {activeTab === 'sync' ? (
                        <div className="space-y-4">
                            {/* 功能介绍卡片 */}
                            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-red-50/60 to-orange-50/40 border border-red-100/80 text-xs text-slate-600 leading-relaxed">
                                <div className="flex items-start gap-2">
                                    <Info size={16} className="text-red-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-slate-800 mb-0.5">直连 Zotero 官方 Web API v3</p>
                                        <p className="text-[11px] text-slate-500">
                                            一键将当前文献标题、完整作者列表、DOI、期刊元数据与摘要推送到您的 Zotero 个人文库。密钥仅保存在本地浏览器，直连官方服务器。
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* 凭据配置 */}
                            <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/70">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                                        <span className="flex items-center gap-1">
                                            <User size={13} className="text-slate-500" />
                                            <span>Zotero User ID (用户 ID)</span>
                                        </span>
                                        <a
                                            href="https://www.zotero.org/settings/keys"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] text-red-600 hover:underline flex items-center gap-0.5"
                                        >
                                            <span>获取 ID / Key</span>
                                            <ArrowSquareOut size={11} />
                                        </a>
                                    </label>
                                    <input
                                        type="text"
                                        value={userId}
                                        onChange={e => setUserId(e.target.value)}
                                        placeholder="例如：12345678 (数字 ID)"
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 font-mono"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                                        <span className="flex items-center gap-1">
                                            <Key size={13} className="text-slate-500" />
                                            <span>API Key (访问密钥)</span>
                                        </span>
                                        <span className="text-[10px] text-amber-600 font-medium">需勾选 Write 权限</span>
                                    </label>
                                    <div className="relative flex items-center">
                                        <input
                                            type={showApiKey ? 'text' : 'password'}
                                            value={apiKey}
                                            onChange={e => setApiKey(e.target.value)}
                                            placeholder="粘贴您的 Zotero API Key"
                                            className="w-full bg-white border border-slate-200 rounded-xl pl-3 pr-9 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowApiKey(!showApiKey)}
                                            className="absolute right-2.5 text-slate-400 hover:text-slate-600"
                                            title={showApiKey ? '隐藏密钥' : '显示密钥'}
                                        >
                                            {showApiKey ? <EyeSlash size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                                        <FolderSimple size={13} className="text-slate-500" />
                                        <span>目标文库 Collection Key (选填，不填存入默认根目录)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={collectionKey}
                                        onChange={e => setCollectionKey(e.target.value)}
                                        placeholder="例如：ABCDEF12 (8位字符)"
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 font-mono"
                                    />
                                </div>

                                <div className="flex items-center justify-between pt-1">
                                    <button
                                        type="button"
                                        onClick={handleTestConnection}
                                        disabled={isTesting || !userId || !apiKey}
                                        className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 transition flex items-center gap-1.5 disabled:opacity-40 active:scale-95"
                                    >
                                        {isTesting ? <SpinnerGap size={13} className="animate-spin" /> : <ArrowClockwise size={13} />}
                                        <span>测试 API 连接</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleSaveConfig}
                                        className="px-3 py-1.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-xs font-semibold text-slate-700 transition active:scale-95"
                                    >
                                        保存配置
                                    </button>
                                </div>

                                {/* 测试连接反馈 */}
                                {testResult && (
                                    <div
                                        className={`p-2.5 rounded-xl text-xs flex items-start gap-1.5 ${
                                            testResult.success
                                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                : 'bg-rose-50 text-rose-800 border border-rose-200'
                                        }`}
                                    >
                                        {testResult.success ? (
                                            <CheckCircle size={15} weight="fill" className="text-emerald-600 shrink-0 mt-0.5" />
                                        ) : (
                                            <WarningCircle size={15} weight="fill" className="text-rose-600 shrink-0 mt-0.5" />
                                        )}
                                        <span>{testResult.message}</span>
                                    </div>
                                )}
                            </div>

                            {/* 一键同步按钮 */}
                            <button
                                onClick={handleSync}
                                disabled={isSyncing || !userId || !apiKey}
                                className="w-full py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm active:scale-95 transition disabled:opacity-50"
                            >
                                {isSyncing ? (
                                    <>
                                        <SpinnerGap size={16} className="animate-spin" />
                                        <span>正在推送到 Zotero 服务器...</span>
                                    </>
                                ) : (
                                    <>
                                        <CloudArrowUp size={16} weight="bold" />
                                        <span>同步该文献至 Zotero 云端</span>
                                    </>
                                )}
                            </button>

                            {/* 同步成功/失败结果 */}
                            {syncResult && (
                                <div
                                    className={`p-3.5 rounded-2xl text-xs space-y-2.5 ${
                                        syncResult.success
                                            ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                                            : 'bg-rose-50 border border-rose-200 text-rose-900'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 font-semibold">
                                        {syncResult.success ? (
                                            <CheckCircle size={16} weight="fill" className="text-emerald-600 shrink-0" />
                                        ) : (
                                            <WarningCircle size={16} weight="fill" className="text-rose-600 shrink-0" />
                                        )}
                                        <span>{syncResult.message}</span>
                                    </div>

                                    {syncResult.success && syncResult.itemKey && (
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {syncResult.clientUri && (
                                                <a
                                                    href={syncResult.clientUri}
                                                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex items-center gap-1 shadow-2xs transition active:scale-95"
                                                    title="调起本地 Zotero 桌面客户端并定位"
                                                >
                                                    <ArrowSquareOut size={13} />
                                                    <span>在 Zotero 客户端定位</span>
                                                </a>
                                            )}
                                            {syncResult.webUrl && (
                                                <a
                                                    href={syncResult.webUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-100/60 border border-emerald-300 text-emerald-800 font-semibold text-[11px] flex items-center gap-1 transition active:scale-95"
                                                    title="在浏览器中查看 Zotero 网页版条目"
                                                >
                                                    <ArrowSquareOut size={13} />
                                                    <span>在 Zotero 网页版查看</span>
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* 引用与导出 Tab */
                        <div className="space-y-4">
                            {/* 离线一键下载标准文献格式 */}
                            <div className="space-y-2">
                                <div className="text-xs font-bold text-slate-700">标准文献文件导出</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-2">
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-xs text-slate-800">RIS 格式 (.ris)</span>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-mono font-bold">
                                                    通用
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 mt-1">
                                                双击直接被 Zotero、EndNote、Mendeley 等桌面/移动端学术客户端导入。
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
                                            <p className="text-[11px] text-slate-500 mt-1">
                                                适用于 LaTeX 论文撰写、Overleaf 在线排版与 Obsidian 学术笔记引用。
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

                            {/* APA 7th 格式一键复制 */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-700">APA 7th 参考文献引用</span>
                                    <button
                                        onClick={() => copyToClipboard(apaCitation, 'apa')}
                                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 active:scale-95 transition"
                                    >
                                        {copiedKey === 'apa' ? (
                                            <>
                                                <Check size={12} weight="bold" className="text-emerald-600" />
                                                <span>已复制！</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy size={12} />
                                                <span>复制引用</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 font-serif leading-relaxed select-text">
                                    {apaCitation}
                                </div>
                            </div>

                            {/* 原始文献数据预览 */}
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
                    )}
                </div>

                {/* 底部按钮 */}
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
