import React, { useState, useRef } from 'react';
import { CharacterProfile, UserProfile, CustomGiftItem } from '../../types';
import {
    loadCustomGifts,
    addCustomGift,
    updateCustomGift,
    deleteCustomGift
} from '../../utils/giftCatalog';
import { trackEvent } from '../../utils/analytics';
import TokenImg from '../os/TokenImg';
import { processImageToBlob } from '../../utils/file';
import { putImageBlob, isBlobRef } from '../../utils/blobRef';

interface GiftModalProps {
    character: CharacterProfile;
    userProfile: UserProfile;
    onClose: () => void;
    onSendGift: (gift: { id: string; name: string; icon: string; price?: number; description?: string }, note: string) => void;
    onUpdateCoins?: (newCoins: number) => void;
    onClaimAllowance?: () => void;
}

export const GiftModal: React.FC<GiftModalProps> = ({
    character,
    onClose,
    onSendGift
}) => {
    // 礼物库列表
    const [gifts, setGifts] = useState<CustomGiftItem[]>(() => loadCustomGifts());
    const [selectedGiftId, setSelectedGiftId] = useState<string | null>(() => {
        const list = loadCustomGifts();
        return list.length > 0 ? list[0].id : null;
    });

    // 附言
    const [note, setNote] = useState('');

    // 编辑 / 添加弹窗状态（与自定义家具统一的简约风格）
    const [showEditor, setShowEditor] = useState(false);
    const [editingGiftId, setEditingGiftId] = useState<string | null>(null);
    const [editorName, setEditorName] = useState('');
    const [editorImage, setEditorImage] = useState('');
    const [editorDescription, setEditorDescription] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const selectedGift = gifts.find(g => g.id === selectedGiftId) || null;

    // 打开“添加新礼物”
    const handleOpenAddModal = () => {
        setEditingGiftId(null);
        setEditorName('');
        setEditorImage('');
        setEditorDescription('');
        setShowEditor(true);
    };

    // 打开“编辑已有礼物”
    const handleOpenEditModal = (gift: CustomGiftItem, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingGiftId(gift.id);
        setEditorName(gift.name);
        setEditorImage(gift.image);
        setEditorDescription(gift.description || '');
        setShowEditor(true);
    };

    // 删除礼物
    const handleDeleteGift = (giftId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        deleteCustomGift(giftId);
        const next = loadCustomGifts();
        setGifts(next);
        if (selectedGiftId === giftId) {
            setSelectedGiftId(next.length > 0 ? next[0].id : null);
        }
        trackEvent('删除自定义礼物');
    };

    // 本地图片上传
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const blob = await processImageToBlob(file, { quality: 0.92, maxWidth: 800 });
            const ref = await putImageBlob(blob);
            setEditorImage(ref);
        } catch {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    setEditorImage(reader.result);
                }
            };
            reader.readAsDataURL(file);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // 保存自定义礼物
    const handleSaveGift = () => {
        const trimmedName = editorName.trim();
        if (!trimmedName) return;

        const giftPayload = {
            name: trimmedName,
            image: editorImage.trim() || '🎁',
            price: 20,
            description: editorDescription.trim() || undefined,
        };

        if (editingGiftId) {
            updateCustomGift(editingGiftId, giftPayload);
        } else {
            const created = addCustomGift(giftPayload);
            setSelectedGiftId(created.id);
        }

        const next = loadCustomGifts();
        setGifts(next);
        setShowEditor(false);
        trackEvent('保存自定义礼物', { mode: editingGiftId ? 'edit' : 'create' });
    };

    // 确认赠送
    const handleConfirmSend = () => {
        if (!selectedGift) return;

        onSendGift(
            {
                id: selectedGift.id,
                name: selectedGift.name,
                icon: selectedGift.image || '🎁',
                description: selectedGift.description
            },
            note.trim()
        );
        trackEvent('赠送自定义礼物');
        onClose();
    };

    const isImg = (val: string) => {
        if (!val) return false;
        return isBlobRef(val) || val.startsWith('http') || val.startsWith('data:') || val.startsWith('/');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
            {showEditor ? (
                /* 自定义礼物编辑/创建弹窗（严格统一为家具简约风格） */
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-[32px] w-full max-w-[360px] p-6 shadow-2xl border border-slate-100 relative animate-scale-up"
                >
                    <button
                        onClick={() => setShowEditor(false)}
                        className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors text-sm w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100"
                    >
                        ✕
                    </button>

                    <h2 className="text-center font-bold text-slate-800 text-lg mb-5">
                        {editingGiftId ? '编辑礼物' : '自定义礼物'}
                    </h2>

                    {/* 图片与名称区 */}
                    <div className="flex gap-3.5 items-stretch mb-4">
                        {/* 上传方块 */}
                        <label className="w-24 h-24 shrink-0 rounded-2xl border-2 border-dashed border-slate-200 hover:border-purple-300 bg-slate-50/60 hover:bg-purple-50/20 flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative group">
                            {isUploading ? (
                                <div className="text-[10px] text-purple-600 font-bold animate-pulse">处理中...</div>
                            ) : editorImage ? (
                                isImg(editorImage) ? (
                                    <TokenImg value={editorImage} className="w-full h-full object-contain p-1" />
                                ) : (
                                    <span className="text-3xl">{editorImage}</span>
                                )
                            ) : (
                                <span className="text-slate-400 text-xs font-semibold">+ 上传</span>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </label>

                        {/* URL 与名称 */}
                        <div className="flex-1 flex flex-col justify-between min-w-0">
                            <div>
                                <label className="text-xs font-semibold text-slate-500 mb-1 block">图片 URL</label>
                                <input
                                    type="text"
                                    placeholder="https://..."
                                    value={editorImage}
                                    onChange={e => setEditorImage(e.target.value)}
                                    className="w-full bg-slate-50/80 rounded-2xl px-3.5 py-2 text-xs text-slate-700 outline-none border border-slate-100 placeholder-slate-300 focus:bg-white focus:border-purple-300 transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 mb-1 block">物品名称</label>
                                <input
                                    type="text"
                                    placeholder="例如: 暖心热可可"
                                    value={editorName}
                                    onChange={e => setEditorName(e.target.value)}
                                    className="w-full bg-slate-50/80 rounded-2xl px-3.5 py-2 text-xs text-slate-700 outline-none border border-slate-100 placeholder-slate-300 focus:bg-white focus:border-purple-300 transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 物品描述 */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">物品描述</label>
                        <textarea
                            rows={2}
                            placeholder="例如: 冒着热气的巧克力热饮，甜甜的奶油顶。"
                            value={editorDescription}
                            onChange={e => setEditorDescription(e.target.value)}
                            className="w-full bg-slate-50/80 rounded-2xl px-3.5 py-2.5 text-xs text-slate-700 outline-none border border-slate-100 placeholder-slate-300 resize-none focus:bg-white focus:border-purple-300 transition-all"
                        />
                    </div>

                    {/* 底部提交按钮 */}
                    <button
                        onClick={handleSaveGift}
                        disabled={!editorName.trim()}
                        className="mt-5 w-full py-3.5 bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-40 text-white font-bold rounded-2xl shadow-lg shadow-purple-500/20 active:scale-[0.98] transition-all text-sm"
                    >
                        保存到礼物库
                    </button>
                </div>
            ) : (
                /* 礼物选择主界面（简约风） */
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-[32px] w-full max-w-[360px] p-6 shadow-2xl border border-slate-100 relative animate-scale-up"
                >
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors text-sm w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100"
                    >
                        ✕
                    </button>

                    <h2 className="text-center font-bold text-slate-800 text-lg mb-4">
                        礼物
                    </h2>

                    {/* 礼物网格 */}
                    <div className="max-h-[260px] overflow-y-auto no-scrollbar py-1">
                        <div className="grid grid-cols-3 gap-2.5">
                            {gifts.map(gift => {
                                const isSelected = selectedGiftId === gift.id;
                                const isItemImg = isImg(gift.image);

                                return (
                                    <div
                                        key={gift.id}
                                        onClick={() => setSelectedGiftId(gift.id)}
                                        className={`group aspect-square rounded-2xl p-2 flex flex-col items-center justify-center relative cursor-pointer border transition-all ${
                                            isSelected
                                                ? 'ring-2 ring-purple-500 bg-purple-50/50 border-purple-200 shadow-sm'
                                                : 'bg-slate-50/70 border-slate-100 hover:bg-slate-100/60'
                                        }`}
                                    >
                                        {/* 操作按钮 (编辑/删除) */}
                                        <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                            <button
                                                onClick={(e) => handleOpenEditModal(gift, e)}
                                                className="w-5 h-5 rounded-full bg-white shadow-xs text-[10px] text-slate-500 hover:text-purple-600 flex items-center justify-center"
                                                title="编辑"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteGift(gift.id, e)}
                                                className="w-5 h-5 rounded-full bg-white shadow-xs text-[10px] text-slate-500 hover:text-red-500 flex items-center justify-center"
                                                title="删除"
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        <div className="w-12 h-12 flex items-center justify-center overflow-hidden">
                                            {isItemImg ? (
                                                <TokenImg value={gift.image} className="w-full h-full object-contain" />
                                            ) : (
                                                <span className="text-2xl">{gift.image}</span>
                                            )}
                                        </div>
                                        <span className="text-[11px] font-semibold text-slate-700 truncate w-full text-center mt-1">
                                            {gift.name}
                                        </span>
                                    </div>
                                );
                            })}

                            {/* + 添加卡片 */}
                            <div
                                onClick={handleOpenAddModal}
                                className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 hover:border-purple-300 bg-slate-50/40 hover:bg-purple-50/20 flex flex-col items-center justify-center text-slate-400 hover:text-purple-600 transition-all cursor-pointer"
                            >
                                <span className="text-base font-bold mb-0.5">＋</span>
                                <span className="text-[10px] font-semibold">添加</span>
                            </div>
                        </div>
                    </div>

                    {/* 附言留言输入框 */}
                    <div className="mt-4">
                        <input
                            type="text"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder={`给 ${character.name} 留一句附言...（选填）`}
                            maxLength={50}
                            className="w-full bg-slate-50/80 rounded-2xl px-4 py-3 text-xs text-slate-700 outline-none border border-slate-100 placeholder-slate-300 focus:bg-white focus:border-purple-200 transition-all"
                        />
                    </div>

                    {/* 底部送出按钮 */}
                    <button
                        onClick={handleConfirmSend}
                        disabled={!selectedGift}
                        className="mt-4 w-full py-3.5 bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-40 text-white font-bold rounded-2xl shadow-lg shadow-purple-500/20 active:scale-[0.98] transition-all text-sm"
                    >
                        送礼物
                    </button>
                </div>
            )}
        </div>
    );
};

export default GiftModal;
