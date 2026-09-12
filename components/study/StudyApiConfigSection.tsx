import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useOS } from '../../context/OSContext';
import type { ApiPreset } from '../../types';
import { findActivePresetId } from '../../utils/apiPresetSwitch';
import { normalizeApiBaseUrl, normalizeApiCredential, normalizeApiModel } from '../../utils/apiConfigNormalize';
import { safeResponseJson, extractContent } from '../../utils/safeApi';
import { extractModelIds } from '../../utils/modelList';
import Modal from '../os/Modal';

interface StudyApiConfigSectionProps {
    title: string;
    subtitle?: string;
    url: string;
    apiKey: string;
    model: string;
    onChangeUrl: (url: string) => void;
    onChangeApiKey: (key: string) => void;
    onChangeModel: (model: string) => void;
    onSave: (config: { url: string; apiKey: string; model: string }) => void;
    onClear?: () => void;
    saveLabel?: string;
    clearLabel?: string;
    isCustomized?: boolean;
    customizedText?: string;
}

export const StudyApiConfigSection: React.FC<StudyApiConfigSectionProps> = ({
    title,
    subtitle,
    url,
    apiKey,
    model,
    onChangeUrl,
    onChangeApiKey,
    onChangeModel,
    onSave,
    onClear,
    saveLabel = '保存配置',
    clearLabel = '清除',
    isCustomized = false,
    customizedText,
}) => {
    const {
        apiPresets = [],
        addApiPreset,
        updateApiPreset,
        removeApiPreset,
        setAvailableModels,
        addToast,
    } = useOS();

    // 新建预设 Modal 状态
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');

    // 编辑预设 Modal 状态
    const [editingPreset, setEditingPreset] = useState<ApiPreset | null>(null);
    const [editPresetName, setEditPresetName] = useState('');
    const [editPresetUrl, setEditPresetUrl] = useState('');
    const [editPresetKey, setEditPresetKey] = useState('');
    const [editPresetModel, setEditPresetModel] = useState('');

    // 长按删除预设计时器
    const [holdingDeletePresetId, setHoldingDeletePresetId] = useState<string | null>(null);
    const presetDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 刷新模型列表状态
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [showModelModal, setShowModelModal] = useState(false);
    const [modelFilter, setModelFilter] = useState('');
    const [modelList, setModelList] = useState<string[]>([]);

    // 测试连接状态
    const [testingApi, setTestingApi] = useState(false);
    const [testApiResult, setTestApiResult] = useState<string | null>(null);

    // 计算当前表单是否与某个预设一致
    const activePresetId = useMemo(() => {
        return findActivePresetId(apiPresets, {
            baseUrl: url,
            apiKey: apiKey,
            model: model,
        });
    }, [apiPresets, url, apiKey, model]);

    // 切换预设
    const applyPreset = (preset: ApiPreset) => {
        const nextUrl = preset.config.baseUrl || '';
        const nextKey = preset.config.apiKey || '';
        const nextModel = preset.config.model || '';
        onChangeUrl(nextUrl);
        onChangeApiKey(nextKey);
        onChangeModel(nextModel);
        onSave({ url: nextUrl, apiKey: nextKey, model: nextModel });
        addToast(`已切换至预设: ${preset.name}`, 'info');
    };

    // 新建预设保存
    const handleSaveNewPreset = () => {
        const name = newPresetName.trim();
        if (!name) {
            addToast('请输入预设名称', 'error');
            return;
        }
        addApiPreset(name, {
            baseUrl: normalizeApiBaseUrl(url),
            apiKey: normalizeApiCredential(apiKey),
            model: normalizeApiModel(model),
        });
        setNewPresetName('');
        setShowCreateModal(false);
        addToast('预设已保存', 'success');
    };

    // 打开编辑预设
    const openEditPreset = (preset: ApiPreset) => {
        setEditingPreset(preset);
        setEditPresetName(preset.name);
        setEditPresetUrl(preset.config.baseUrl || '');
        setEditPresetKey(preset.config.apiKey || '');
        setEditPresetModel(preset.config.model || '');
    };

    // 保存编辑后的预设
    const handleUpdatePreset = () => {
        if (!editingPreset) return;
        const name = editPresetName.trim();
        if (!name) {
            addToast('预设名称不能为空', 'error');
            return;
        }
        const nextConfig = {
            ...editingPreset.config,
            baseUrl: normalizeApiBaseUrl(editPresetUrl),
            apiKey: normalizeApiCredential(editPresetKey),
            model: normalizeApiModel(editPresetModel),
        };
        const wasActive = activePresetId === editingPreset.id;
        updateApiPreset(editingPreset.id, name, nextConfig);
        if (wasActive) {
            onChangeUrl(nextConfig.baseUrl);
            onChangeApiKey(nextConfig.apiKey);
            onChangeModel(nextConfig.model);
            onSave({
                url: nextConfig.baseUrl,
                apiKey: nextConfig.apiKey,
                model: nextConfig.model,
            });
        }
        setEditingPreset(null);
        addToast(wasActive ? `「${name}」已更新，当前配置同步生效` : `「${name}」已更新`, 'success');
    };

    // 取消长按删除
    const cancelPresetDeleteHold = () => {
        if (presetDeleteTimerRef.current) {
            clearTimeout(presetDeleteTimerRef.current);
            presetDeleteTimerRef.current = null;
        }
        setHoldingDeletePresetId(null);
    };

    // 删除预设
    const deleteApiPreset = (id: string, name: string) => {
        cancelPresetDeleteHold();
        removeApiPreset(id);
        if (editingPreset?.id === id) setEditingPreset(null);
        addToast(`已删除预设: ${name}`, 'success');
    };

    const beginPresetDeleteHold = (id: string, name: string) => {
        cancelPresetDeleteHold();
        setHoldingDeletePresetId(id);
        presetDeleteTimerRef.current = setTimeout(() => {
            presetDeleteTimerRef.current = null;
            setHoldingDeletePresetId(null);
            removeApiPreset(id);
            if (editingPreset?.id === id) setEditingPreset(null);
            addToast(`已删除预设: ${name}`, 'success');
        }, 700);
    };

    // 刷新模型列表
    const fetchModels = async () => {
        const baseUrl = normalizeApiBaseUrl(url);
        const key = normalizeApiCredential(apiKey);
        if (!baseUrl) {
            addToast('请先填写 URL', 'error');
            return;
        }
        setIsLoadingModels(true);
        try {
            const response = await fetch(`${baseUrl}/models`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await safeResponseJson(response);
            const models = extractModelIds(data);
            if (models.length > 0) {
                setModelList(models);
                setAvailableModels(models);
                setShowModelModal(true);
                addToast(`获取到 ${models.length} 个模型`, 'success');
            } else {
                addToast('模型列表为空或格式不兼容', 'info');
            }
        } catch (error: any) {
            console.error(error);
            addToast(`获取失败: ${error?.message || '网络异常'}`, 'error');
        } finally {
            setIsLoadingModels(false);
        }
    };

    // 测试连接
    const handleTestApi = async () => {
        const baseUrl = normalizeApiBaseUrl(url);
        const key = normalizeApiCredential(apiKey);
        const mod = normalizeApiModel(model);
        if (!baseUrl || !key || !mod) {
            addToast('请填写完整的 URL、Key 和 Model', 'error');
            return;
        }
        setTestingApi(true);
        setTestApiResult(null);
        try {
            const res = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${key}`,
                },
                body: JSON.stringify({
                    model: mod,
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 5,
                }),
            });
            if (res.ok) {
                const data = await safeResponseJson(res);
                const reply = extractContent(data);
                setTestApiResult(`✅ 连接成功 — 模型回复: "${reply.slice(0, 30)}"`);
            } else {
                const text = await res.text().catch(() => '');
                setTestApiResult(`❌ HTTP ${res.status}: ${text.slice(0, 100)}`);
            }
        } catch (err: any) {
            setTestApiResult(`❌ 连接失败: ${err.message || '网络异常'}`);
        } finally {
            setTestingApi(false);
        }
    };

    const filteredModels = useMemo(() => {
        if (!modelFilter.trim()) return modelList;
        return modelList.filter(m => m.toLowerCase().includes(modelFilter.toLowerCase()));
    }, [modelList, modelFilter]);

    return (
        <div className="space-y-4">
            {/* Header with Title & Action */}
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</h4>
                    {subtitle && <span className="text-[10px] text-slate-400 block mt-0.5">{subtitle}</span>}
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setNewPresetName('');
                        setShowCreateModal(true);
                    }}
                    className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-full font-bold shadow-xs active:scale-95 transition-transform"
                >
                    新建预设
                </button>
            </div>

            {/* Presets List */}
            {apiPresets.length > 0 && (
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block pl-1">
                        我的预设 (PRESETS)
                    </label>
                    <div className="flex gap-2 flex-wrap">
                        {apiPresets.map(preset => {
                            const isActive = activePresetId === preset.id;
                            return (
                                <div
                                    key={preset.id}
                                    className={`flex items-center rounded-lg pl-3 pr-1 py-1 shadow-2xs border transition-colors ${
                                        isActive
                                            ? 'bg-emerald-50/80 border-emerald-300'
                                            : 'bg-white border-slate-200'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => applyPreset(preset)}
                                        title={`切换到 ${preset.name}`}
                                        className={`text-xs font-medium cursor-pointer mr-1.5 transition-colors ${
                                            isActive ? 'text-emerald-700 font-bold' : 'text-slate-600 hover:text-emerald-700'
                                        }`}
                                    >
                                        {preset.name}
                                        {isActive && <span className="ml-1 text-[9px] font-bold">· 使用中</span>}
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`编辑预设 ${preset.name}`}
                                        title="编辑这条预设"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openEditPreset(preset);
                                        }}
                                        className="p-1 rounded-full text-slate-300 hover:bg-emerald-100/60 hover:text-emerald-700 transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                            <path d="M13.586 3.586a2 2 0 1 1 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`长按或双击删除预设 ${preset.name}`}
                                        title="长按或双击删除"
                                        onPointerDown={(e) => {
                                            e.stopPropagation();
                                            beginPresetDeleteHold(preset.id, preset.name);
                                        }}
                                        onPointerUp={cancelPresetDeleteHold}
                                        onPointerCancel={cancelPresetDeleteHold}
                                        onPointerLeave={cancelPresetDeleteHold}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            deleteApiPreset(preset.id, preset.name);
                                        }}
                                        onContextMenu={(e) => e.preventDefault()}
                                        className={`p-1 rounded-full transition-colors select-none touch-none ${
                                            holdingDeletePresetId === preset.id
                                                ? 'bg-red-100 text-red-500 scale-110'
                                                : 'text-slate-300 hover:bg-red-50 hover:text-red-400'
                                        }`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                                        </svg>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1.5 pl-1">
                        点名称直接切换并生效；铅笔改这条预设的内容；长按或双击 × 才会删除。
                    </p>
                </div>
            )}

            {/* Inputs Form */}
            <div className="space-y-3">
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">
                        API 服务地址 (URL)
                    </label>
                    <input
                        type="text"
                        value={url}
                        onChange={e => onChangeUrl(e.target.value)}
                        placeholder="https://api.openai.com/v1"
                        className="w-full bg-slate-100 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs font-mono focus:bg-white focus:outline-emerald-500 transition-all"
                    />
                </div>

                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">
                        API KEY
                    </label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={e => onChangeApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="w-full bg-slate-100 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs font-mono focus:bg-white focus:outline-emerald-500 transition-all"
                    />
                </div>

                <div>
                    <div className="flex items-center justify-between mb-1.5 pl-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            模型名称 (MODEL)
                        </label>
                        <button
                            type="button"
                            onClick={fetchModels}
                            disabled={isLoadingModels}
                            className="text-[10px] text-emerald-600 hover:text-emerald-700 font-bold active:scale-95 transition-transform"
                        >
                            {isLoadingModels ? '获取中...' : '刷新模型列表'}
                        </button>
                    </div>
                    <input
                        type="text"
                        value={model}
                        onChange={e => onChangeModel(e.target.value)}
                        placeholder="模型名称（如 deepseek-chat, gpt-4o）"
                        className="w-full bg-slate-100 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs font-mono focus:bg-white focus:outline-emerald-500 transition-all"
                    />
                </div>

                <div className="flex gap-2 pt-1">
                    <button
                        type="button"
                        onClick={() => onSave({ url, apiKey, model })}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-xs active:scale-95 transition-all"
                    >
                        {saveLabel}
                    </button>
                    {onClear && (
                        <button
                            type="button"
                            onClick={onClear}
                            className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs active:scale-95 transition-all"
                        >
                            {clearLabel}
                        </button>
                    )}
                </div>

                {apiPresets.length > 0 && (
                    <p className="text-[9px] text-slate-400 px-1 leading-relaxed">
                        这里改的是当前生效的配置，不会动上面的预设；要把改动存回某条预设，点它的铅笔。
                    </p>
                )}

                <button
                    type="button"
                    onClick={handleTestApi}
                    disabled={testingApi || !url.trim() || !apiKey.trim() || !model.trim()}
                    className={`w-full py-2 rounded-xl font-bold text-xs border active:scale-95 transition-all ${
                        testingApi || !url.trim() || !apiKey.trim() || !model.trim()
                            ? 'border-slate-200 text-slate-400 bg-slate-50'
                            : 'border-emerald-300 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-50'
                    }`}
                >
                    {testingApi ? '测试连接中...' : '🧪 测试连接'}
                </button>

                {testApiResult && (
                    <div
                        className={`text-xs px-3 py-2 rounded-xl ${
                            testApiResult.startsWith('✅')
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-red-50 text-red-600 border border-red-200'
                        }`}
                    >
                        {testApiResult}
                    </div>
                )}

                {isCustomized && customizedText && (
                    <div className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200/60 rounded-xl p-2.5">
                        {customizedText}
                    </div>
                )}
            </div>

            {/* Portal Modals */}
            {typeof document !== 'undefined' && createPortal(
                <>
                    {/* 新建预设 Modal */}
                    <Modal
                        isOpen={showCreateModal}
                        title="新建预设"
                        onClose={() => setShowCreateModal(false)}
                        footer={
                            <button
                                onClick={handleSaveNewPreset}
                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl active:scale-95 transition-all"
                            >
                                新建
                            </button>
                        }
                    >
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                预设名称 (例如: DeepSeek)
                            </label>
                            <input
                                value={newPresetName}
                                onChange={e => setNewPresetName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSaveNewPreset()}
                                className="w-full bg-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-emerald-500"
                                autoFocus
                                placeholder="输入预设名称..."
                            />
                            <p className="text-[10px] text-slate-400 leading-relaxed pt-1">
                                会保存当前表单里的 URL / Key / Model 为全局可用预设。
                            </p>
                        </div>
                    </Modal>

                    {/* 编辑预设 Modal */}
                    <Modal
                        isOpen={!!editingPreset}
                        title="编辑预设"
                        onClose={() => setEditingPreset(null)}
                        footer={
                            <button
                                onClick={handleUpdatePreset}
                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl active:scale-95 transition-all"
                            >
                                保存
                            </button>
                        }
                    >
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    名称
                                </label>
                                <input
                                    value={editPresetName}
                                    onChange={e => setEditPresetName(e.target.value)}
                                    placeholder="预设名称"
                                    className="w-full bg-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-emerald-500"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    URL
                                </label>
                                <input
                                    value={editPresetUrl}
                                    onChange={e => setEditPresetUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="w-full bg-slate-100 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-emerald-500"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    Key
                                </label>
                                <input
                                    type="password"
                                    value={editPresetKey}
                                    onChange={e => setEditPresetKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full bg-slate-100 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-emerald-500"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    Model
                                </label>
                                <input
                                    value={editPresetModel}
                                    onChange={e => setEditPresetModel(e.target.value)}
                                    placeholder="模型名称"
                                    className="w-full bg-slate-100 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-emerald-500"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setEditPresetUrl(url);
                                    setEditPresetKey(apiKey);
                                    setEditPresetModel(model);
                                    addToast('已填入当前配置', 'info');
                                }}
                                className="w-full py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-bold rounded-xl active:scale-95 transition-transform"
                            >
                                用当前完整配置填入
                            </button>

                            <p className="text-[10px] text-slate-400 leading-relaxed">
                                {editingPreset && activePresetId === editingPreset.id
                                    ? '这条正在使用中，保存后当前配置会一起换成新的值。'
                                    : '只改这条预设，当前生效的配置不受影响。'}
                            </p>
                        </div>
                    </Modal>

                    {/* 选择模型 Modal */}
                    <Modal
                        isOpen={showModelModal}
                        title="选择模型"
                        onClose={() => setShowModelModal(false)}
                    >
                        <div className="space-y-3">
                            <input
                                type="text"
                                value={modelFilter}
                                onChange={e => setModelFilter(e.target.value)}
                                placeholder="🔍 搜索模型..."
                                className="w-full bg-slate-100 rounded-xl px-4 py-2 text-xs focus:outline-emerald-500"
                            />
                            <div className="max-h-[45vh] overflow-y-auto no-scrollbar space-y-1.5">
                                {filteredModels.length > 0 ? (
                                    filteredModels.map(m => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => {
                                                onChangeModel(m);
                                                setShowModelModal(false);
                                            }}
                                            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-mono flex items-center justify-between transition-colors ${
                                                m === model
                                                    ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200'
                                                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                                            }`}
                                        >
                                            <span className="truncate mr-2">{m}</span>
                                            {m === model && <span className="text-[10px] text-emerald-600 font-bold shrink-0">当前</span>}
                                        </button>
                                    ))
                                ) : (
                                    <div className="text-center py-6 text-xs text-slate-400">
                                        没有匹配的模型
                                    </div>
                                )}
                            </div>
                        </div>
                    </Modal>
                </>,
                document.body
            )}
        </div>
    );
};
