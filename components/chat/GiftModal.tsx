import React, { useState, useRef } from 'react';
import { CharacterProfile, UserProfile, CustomGiftItem } from '../../types';
import {
    loadCustomGifts,
    addCustomGift,
    updateCustomGift,
    deleteCustomGift,
    canClaimDailyAllowance,
    DAILY_ALLOWANCE_COINS
} from '../../utils/giftCatalog';
import { trackEvent } from '../../utils/analytics';
import TokenImg from '../os/TokenImg';
import { processImageToBlob } from '../../utils/file';
import { putImageBlob, isBlobRef } from '../../utils/blobRef';

interface GiftModalProps {
    character: CharacterProfile;
    userProfile: UserProfile;
    onClose: () => void;
    onSendGift: (gift: { id: string; name: string; icon: string; price: number; description?: string }, note: string) => void;
    onUpdateCoins: (newCoins: number) => void;
    onClaimAllowance: () => void;
}

export const GiftModal: React.FC<GiftModalProps> = ({
    character,
    userProfile,
    onClose,
    onSendGift,
    onUpdateCoins,
    onClaimAllowance
}) => {
    const currentCoins = userProfile.coins ?? 300;
    const today = new Date().toISOString().slice(0, 10);
    const eligibleForAllowance = canClaimDailyAllowance(userProfile.lastDailyAllowanceDate, today);

    // Custom gifts library list
    const [gifts, setGifts] = useState<CustomGiftItem[]>(() => loadCustomGifts());
    const [selectedGiftId, setSelectedGiftId] = useState<string | null>(() => {
        const list = loadCustomGifts();
        return list.length > 0 ? list[0].id : null;
    });

    // Note attached to gift
    const [note, setNote] = useState('');

    // Editor modal state (参考家具超市模式：添加 / 编辑自定义礼物)
    const [showEditor, setShowEditor] = useState(false);
    const [editingGiftId, setEditingGiftId] = useState<string | null>(null);
    const [editorName, setEditorName] = useState('');
    const [editorImage, setEditorImage] = useState('');
    const [editorPrice, setEditorPrice] = useState(20);
    const [editorDescription, setEditorDescription] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const selectedGift = gifts.find(g => g.id === selectedGiftId) || null;
    const cost = selectedGift ? Math.max(1, selectedGift.price) : 0;
    const canAfford = selectedGift ? currentCoins >= cost : false;

    // 打开“添加新礼物”弹窗
    const handleOpenAddModal = () => {
        setEditingGiftId(null);
        setEditorName('');
        setEditorImage('');
        setEditorPrice(20);
        setEditorDescription('');
        setShowEditor(true);
    };

    // 打开“编辑已有礼物”弹窗
    const handleOpenEditModal = (gift: CustomGiftItem, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingGiftId(gift.id);
        setEditorName(gift.name);
        setEditorImage(gift.image);
        setEditorPrice(gift.price);
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

    // 本地图片文件选择上传（参考家具模式）
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const blob = await processImageToBlob(file, { quality: 0.95, maxWidth: 1200 });
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
            price: Math.max(1, editorPrice || 1),
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
        if (!selectedGift || !canAfford) return;

        onSendGift(
            {
                id: selectedGift.id,
                name: selectedGift.name,
                icon: selectedGift.image || '🎁',
                price: cost,
                description: selectedGift.description
            },
            note.trim()
        );
        trackEvent('赠送自定义礼物');
        onClose();
    };

    const handleSandboxTopUp = (amount: number) => {
        onUpdateCoins(currentCoins + amount);
    };

    const isImage = (val: string) => {
        if (!val) return false;
        return isBlobRef(val) || val.startsWith('http') || val.startsWith('data:') || val.startsWith('/');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl border border-rose-100 overflow-hidden relative">
                {/* Header */}
                <div className="px-5 py-4 border-b border-rose-50 flex items-center justify-between bg-gradient-to-r from-rose-50/70 via-pink-50/50 to-amber-50/50">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">🎁</span>
                        <div>
                            <h2 className="text-base font-bold text-slate-800">挑选心意礼物</h2>
                            <p className="text-[11px] text-slate-400">为 {character.name} 挑选或定制独一无二的专属心意</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors shadow-sm"
                    >
                        ✕
                    </button>
                </div>

                {/* Coin balance & Top-up bar */}
                <div className="px-5 py-2.5 bg-amber-50/40 border-b border-amber-100/60 flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-amber-800">
                        <span className="text-base">🪙</span>
                        <span>金币余额:</span>
                        <span className="text-sm font-extrabold text-amber-600">{currentCoins}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        {eligibleForAllowance ? (
                            <button
                                onClick={onClaimAllowance}
                                className="px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold text-[11px] shadow-sm hover:opacity-90 active:scale-95 transition-all"
                            >
                                领取今日津贴 (+{DAILY_ALLOWANCE_COINS})
                            </button>
                        ) : (
                            <span className="text-[10px] text-amber-700/60 bg-amber-100/50 px-2 py-0.5 rounded-full">
                                今日津贴已领 ✓
                            </span>
                        )}
                        <button
                            onClick={() => handleSandboxTopUp(100)}
                            title="测试充值"
                            className="px-2 py-1 rounded-lg bg-white border border-amber-200 text-amber-700 font-semibold text-[10px] hover:bg-amber-50 active:scale-95 transition-all"
                        >
                            +100 🪙
                        </button>
                    </div>
                </div>

                {/* Custom Gifts Toolbar */}
                <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs font-bold text-slate-700">
                        <span>✨ 心意礼物库</span>
                        <span className="text-[10px] text-slate-400 font-normal">({gifts.length})</span>
                    </div>
                    <button
                        onClick={handleOpenAddModal}
                        className="px-3 py-1.5 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-bold text-xs flex items-center gap-1 shadow-sm shadow-rose-200 transition-all"
                    >
                        <span>＋</span>
                        <span>添加新礼物</span>
                    </button>
                </div>

                {/* Gifts Grid Area */}
                <div className="flex-1 overflow-y-auto px-4 py-1 space-y-3">
                    {gifts.length === 0 ? (
                        <div className="py-12 px-6 text-center flex flex-col items-center justify-center bg-rose-50/30 rounded-3xl border border-dashed border-rose-200 my-2">
                            <div className="w-16 h-16 rounded-full bg-rose-100/60 flex items-center justify-center text-3xl mb-3">
                                🎁
                            </div>
                            <h3 className="text-sm font-bold text-slate-700">还没有创建心意礼物哦</h3>
                            <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                                参考家具模式，支持上传本地图片或粘贴图床 URL，为 TA 打造专属心意吧！
                            </p>
                            <button
                                onClick={handleOpenAddModal}
                                className="mt-4 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-bold text-xs shadow-md shadow-rose-200 active:scale-95 transition-all"
                            >
                                ＋ 立即创建第一件礼物
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 pb-2">
                            {gifts.map(gift => {
                                const isSelected = selectedGiftId === gift.id;
                                const isImg = isImage(gift.image);

                                return (
                                    <div
                                        key={gift.id}
                                        onClick={() => setSelectedGiftId(gift.id)}
                                        className={`group p-3 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between relative ${
                                            isSelected
                                                ? 'bg-rose-50/70 border-rose-400 ring-2 ring-rose-300 shadow-sm'
                                                : 'bg-white border-slate-100 hover:border-rose-200 hover:bg-slate-50/50'
                                        }`}
                                    >
                                        {/* Action buttons (Edit & Delete) */}
                                        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity z-10">
                                            <button
                                                onClick={(e) => handleOpenEditModal(gift, e)}
                                                className="w-6 h-6 rounded-full bg-white/90 hover:bg-white text-slate-500 hover:text-rose-600 flex items-center justify-center text-[10px] shadow-sm border border-slate-100"
                                                title="编辑礼物"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteGift(gift.id, e)}
                                                className="w-6 h-6 rounded-full bg-white/90 hover:bg-white text-slate-500 hover:text-red-500 flex items-center justify-center text-[10px] shadow-sm border border-slate-100"
                                                title="删除礼物"
                                            >
                                                🗑️
                                            </button>
                                        </div>

                                        {/* Image / Icon container */}
                                        <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center border border-slate-100 mb-2 relative">
                                            {isImg ? (
                                                <TokenImg
                                                    value={gift.image}
                                                    alt={gift.name}
                                                    className="w-full h-full object-contain p-1"
                                                />
                                            ) : (
                                                <span className="text-4xl filter drop-shadow-sm">{gift.image || '🎁'}</span>
                                            )}

                                            <div className="absolute bottom-1 right-1 bg-amber-500/90 text-white font-extrabold text-[10px] px-1.5 py-0.5 rounded-md shadow-sm">
                                                🪙 {gift.price}
                                            </div>
                                        </div>

                                        {/* Name & description */}
                                        <div>
                                            <div className="text-xs font-bold text-slate-800 truncate" title={gift.name}>
                                                {gift.name}
                                            </div>
                                            {gift.description && (
                                                <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                                                    {gift.description}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Attached Note Input */}
                    {gifts.length > 0 && (
                        <div className="pt-1">
                            <label className="text-[11px] font-bold text-slate-600 block mb-1 flex items-center justify-between">
                                <span>💌 附带心意寄语:</span>
                                <span className="text-[10px] font-normal text-slate-400">（角色会感知到你的心意并做出回应）</span>
                            </label>
                            <textarea
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                maxLength={150}
                                rows={2}
                                placeholder="写一句心意寄语（选填）..."
                                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-rose-400 resize-none"
                            />
                        </div>
                    )}
                </div>

                {/* Footer Action */}
                <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                        消耗: <span className="font-extrabold text-amber-600 text-sm">🪙 {cost}</span>
                    </div>

                    <button
                        onClick={handleConfirmSend}
                        disabled={!selectedGift || !canAfford}
                        className={`px-5 py-2 rounded-full font-bold text-xs shadow-md transition-all active:scale-95 ${
                            selectedGift && canAfford
                                ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:opacity-95 shadow-rose-200'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                        }`}
                    >
                        {!selectedGift
                            ? '请先选择礼物'
                            : canAfford
                                ? `送出礼物给 ${character.name}`
                                : '金币不足'}
                    </button>
                </div>

                {/* ======================================================== */}
                {/* Custom Gift Editor Modal (参考家具添加/编辑模态框) */}
                {/* ======================================================== */}
                {showEditor && (
                    <div className="absolute inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                        <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-rose-100 flex flex-col">
                            <div className="bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-3.5 flex items-center justify-between text-white">
                                <div className="font-bold text-sm">
                                    {editingGiftId ? '编辑自定义礼物' : '添加自定义礼物'}
                                </div>
                                <button
                                    onClick={() => setShowEditor(false)}
                                    className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-xs"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="p-4 space-y-3 overflow-y-auto max-h-[75vh]">
                                {/* Image preview & upload row */}
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold mb-1 block">
                                        礼物图片（图床 URL 或本地上传）
                                    </label>
                                    <div className="w-full h-32 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden relative">
                                        {editorImage ? (
                                            isImage(editorImage) ? (
                                                <TokenImg
                                                    value={editorImage}
                                                    alt="preview"
                                                    className="w-full h-full object-contain p-2"
                                                />
                                            ) : (
                                                <span className="text-5xl">{editorImage}</span>
                                            )
                                        ) : (
                                            <div className="text-center text-slate-300">
                                                <div className="text-3xl">🎁</div>
                                                <div className="text-[10px] text-slate-400 mt-1">提供图片后预览</div>
                                            </div>
                                        )}

                                        {isUploading && (
                                            <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center text-xs text-rose-500 font-bold">
                                                处理上传中…
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Image URL input */}
                                <div>
                                    <input
                                        type="text"
                                        value={editorImage.startsWith('blobref:') ? '' : editorImage}
                                        onChange={e => setEditorImage(e.target.value)}
                                        placeholder={editorImage.startsWith('blobref:') ? '已选择本地图片（填入新 URL 可替换）' : '粘贴图床/网络图片 URL (https://...)'}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-none focus:border-rose-400"
                                    />
                                </div>

                                {/* Local file upload button */}
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full py-2 px-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                                    >
                                        <span>📁 本地相册/文件上传</span>
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                </div>

                                {/* Name input */}
                                <div>
                                    <label className="text-[10px] text-slate-500 font-bold mb-1 block">礼物名称 *</label>
                                    <input
                                        type="text"
                                        maxLength={20}
                                        value={editorName}
                                        onChange={e => setEditorName(e.target.value)}
                                        placeholder="例如：手作焦糖曲奇、猫咪马克杯"
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-none focus:border-rose-400 font-bold"
                                    />
                                </div>

                                {/* Price input */}
                                <div>
                                    <label className="text-[10px] text-slate-500 font-bold mb-1 block">心意金币价值 (🪙)</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={99999}
                                        value={editorPrice}
                                        onChange={e => setEditorPrice(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-none focus:border-rose-400"
                                    />
                                </div>

                                {/* Description input */}
                                <div>
                                    <label className="text-[10px] text-slate-500 font-bold mb-1 block">
                                        物品细节描述（告诉 AI 这是什么）
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={editorDescription}
                                        onChange={e => setEditorDescription(e.target.value)}
                                        placeholder="例如：刚出炉酥脆的黄油曲奇，带有浓郁的焦糖香气..."
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-none focus:border-rose-400 resize-none"
                                    />
                                </div>

                                <div className="pt-2 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowEditor(false)}
                                        className="w-1/3 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                                    >
                                        取消
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveGift}
                                        disabled={!editorName.trim() || isUploading}
                                        className="flex-1 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-bold text-xs shadow-sm disabled:opacity-50"
                                    >
                                        保存礼物
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GiftModal;

