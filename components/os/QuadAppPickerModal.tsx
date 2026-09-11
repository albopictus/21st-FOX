import React, { useMemo, useState } from 'react';
import { AppWindow, Plus, X, Check } from '@phosphor-icons/react';
import { INSTALLED_APPS, DOCK_APPS } from '../../constants';
import AppIcon from './AppIcon';

export interface QuadAppPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectApp: (appId: string, slotIndex: number) => void;
  onRemoveApp?: (slotIndex: number) => void;
  slotIndex?: number;
  placedAppIds: Set<string>;
  currentQuadAppIds?: (string | null | undefined)[];
  acnh?: boolean;
  paper?: boolean;
}

const SLOT_LABELS = ['左上', '右上', '左下', '右下'];

export const QuadAppPickerModal: React.FC<QuadAppPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectApp,
  onRemoveApp,
  slotIndex = 0,
  placedAppIds,
  currentQuadAppIds = [],
  acnh = false,
  paper = false,
}) => {
  const slots = useMemo(() => {
    return [0, 1, 2, 3].map(idx => (currentQuadAppIds && currentQuadAppIds[idx]) ? currentQuadAppIds[idx] : null);
  }, [currentQuadAppIds]);

  // 当前正在聚焦/填入的目标槽位
  const [activeSlot, setActiveSlot] = useState<number>(() => {
    if (slotIndex >= 0 && slotIndex <= 3) return slotIndex;
    const firstEmpty = [0, 1, 2, 3].find(idx => !slots[idx]);
    return firstEmpty !== undefined ? firstEmpty : 0;
  });

  if (!isOpen) return null;

  const currentQuadSet = useMemo(() => {
    return new Set(slots.filter(Boolean) as string[]);
  }, [slots]);

  // 可供选择的 apps：排除 Dock 中的应用和当前四宫格已经有的应用
  const selectableApps = useMemo(() => {
    return INSTALLED_APPS.filter(a => !DOCK_APPS.includes(a.id as any) && !currentQuadSet.has(a.id));
  }, [currentQuadSet]);

  const offDesktop = useMemo(() => {
    return selectableApps.filter(a => !placedAppIds.has(a.id));
  }, [selectableApps, placedAppIds]);

  const onDesktop = useMemo(() => {
    return selectableApps.filter(a => placedAppIds.has(a.id));
  }, [selectableApps, placedAppIds]);

  const panelCls = acnh
    ? 'bg-[#faf6ec]/95 text-[#725d42] border-2 border-[#e8e2d6]'
    : paper
    ? 'bg-[#f5f0e6]/95 text-[#4a3e31] border border-[#ddd5c7]'
    : 'bg-white/85 dark:bg-neutral-900/85 text-slate-800 dark:text-neutral-100 border border-white/60 dark:border-white/10 backdrop-blur-2xl';

  const addBtnCls = acnh
    ? 'bg-[#19c8b9] text-white'
    : paper
    ? 'bg-[#788369] text-white'
    : 'bg-slate-900 hover:bg-black text-white dark:bg-white dark:text-neutral-900';

  const isCurrentSlotFull = !!slots[activeSlot];
  const allSlotsFull = slots.every(Boolean);

  const handleChooseApp = (appId: string) => {
    onSelectApp(appId, activeSlot);
    // 自动寻找下一个空槽位
    const nextEmpty = [0, 1, 2, 3].find(idx => idx !== activeSlot && !slots[idx]);
    if (nextEmpty !== undefined) {
      setActiveSlot(nextEmpty);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in select-none">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className={`relative w-full sm:max-w-md rounded-t-[2.25rem] sm:rounded-[2.25rem] max-h-[85vh] flex flex-col shadow-[0_24px_64px_rgba(0,0,0,0.22)] overflow-hidden animate-slide-up z-10 ${panelCls}`}>
        <div className="w-10 h-1 rounded-full bg-current/20 mx-auto mt-3 mb-1 shrink-0" />

        {/* 标题 */}
        <div className="px-5 pt-2 pb-2 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight">四宫格应用管理</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-600 dark:text-teal-400">
                {allSlotsFull ? '已满 (4/4)' : `槽位 ${activeSlot + 1} · ${SLOT_LABELS[activeSlot]}`}
              </span>
            </div>
            <p className="text-[11px] opacity-60 mt-0.5">轻触右上角 × 移除，轻触槽位切换填入目标</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/10 hover:bg-black/10 active:scale-90 transition"
            title="关闭"
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        {/* 顶部四宫格预览面板 */}
        <div className="px-5 pt-1 pb-3 shrink-0">
          <div className="p-2.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-current/10">
            <div className="grid grid-cols-2 gap-2">
              {slots.map((appId, idx) => {
                const app = appId ? INSTALLED_APPS.find(a => a.id === appId) : null;
                const isSelected = activeSlot === idx;
                if (app) {
                  return (
                    <div
                      key={`preview-slot-${idx}`}
                      onClick={() => setActiveSlot(idx)}
                      className={`relative flex items-center gap-2.5 p-2 rounded-xl transition cursor-pointer ${
                        isSelected
                          ? 'bg-teal-500/15 border-2 border-teal-500 shadow-sm'
                          : 'bg-white/60 dark:bg-white/5 border border-current/10 hover:bg-white/80'
                      }`}
                    >
                      <div className="w-9 h-9 shrink-0 pointer-events-none">
                        <AppIcon app={app} onClick={() => {}} size="sm" hideLabel />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate">{app.name}</div>
                        <div className="text-[10px] opacity-50">{SLOT_LABELS[idx]}</div>
                      </div>
                      {onRemoveApp && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveApp(idx);
                            setActiveSlot(idx);
                          }}
                          className="w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md active:scale-90 transition shrink-0 cursor-pointer before:absolute before:-inset-2.5 before:content-['']"
                          title={`移除 ${app.name}`}
                        >
                          <X size={12} weight="bold" />
                        </button>
                      )}
                    </div>
                  );
                }

                // 空槽位
                return (
                  <div
                    key={`preview-slot-${idx}`}
                    onClick={() => setActiveSlot(idx)}
                    className={`flex items-center gap-2.5 p-2 rounded-xl border border-dashed transition cursor-pointer ${
                      isSelected
                        ? 'border-2 border-teal-500 bg-teal-500/15 text-teal-600 dark:text-teal-400 font-bold shadow-sm'
                        : 'border-current/25 bg-white/20 dark:bg-white/5 hover:bg-white/40 text-current/60'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl border border-dashed border-current/30 flex items-center justify-center shrink-0">
                      <Plus size={16} weight="bold" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold">空槽位</div>
                      <div className="text-[10px] opacity-60">{SLOT_LABELS[idx]} · 点击填入</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 候选应用列表 */}
        <div className="px-5 py-2 overflow-y-auto no-scrollbar space-y-4 flex-1">
          {allSlotsFull ? (
            <div className="text-center py-6 px-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400">
              <div className="w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center mx-auto mb-2 shadow-sm">
                <Check size={16} weight="bold" />
              </div>
              <div className="text-xs font-bold">四宫格已填满</div>
              <div className="text-[11px] opacity-75 mt-0.5">轻触上方槽位右上角的 × 移除应用后，可继续挑选替换</div>
            </div>
          ) : (
            <>
              {isCurrentSlotFull && (
                <div className="text-xs px-2 py-1.5 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                  当前选中的「{SLOT_LABELS[activeSlot]}」已有应用，点击下方应用将直接替换它。
                </div>
              )}

              {/* 未在桌面上的应用 */}
              {offDesktop.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold opacity-60 px-1 tracking-wider uppercase">
                    未在桌面 · 可直接填入 ({offDesktop.length})
                  </div>
                  <div className="space-y-2">
                    {offDesktop.map(app => (
                      <div
                        key={app.id}
                        onClick={() => handleChooseApp(app.id)}
                        className={`flex items-center justify-between p-2.5 rounded-2xl shadow-xs cursor-pointer active:scale-[0.98] transition ${
                          acnh
                            ? 'bg-white/85 hover:bg-white border border-[#e8e2d6]'
                            : paper
                            ? 'bg-white/75 hover:bg-white/95 border border-[#5b4833]/10'
                            : 'bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 border border-white/70 dark:border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 shrink-0 pointer-events-none">
                            <AppIcon app={app} onClick={() => {}} size="sm" hideLabel />
                          </div>
                          <div className="text-sm font-bold truncate">{app.name}</div>
                        </div>
                        <span className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shadow-xs ${addBtnCls}`}>
                          <Plus size={13} weight="bold" />
                          <span>填入</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 已在桌面上的应用（点击即可收纳进四宫格） */}
              {onDesktop.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold opacity-60 px-1 tracking-wider uppercase mt-3">
                    已在桌面 · 点击收纳进四宫格 ({onDesktop.length})
                  </div>
                  <div className="space-y-2">
                    {onDesktop.map(app => (
                      <div
                        key={app.id}
                        onClick={() => handleChooseApp(app.id)}
                        className={`flex items-center justify-between p-2.5 rounded-2xl shadow-xs cursor-pointer active:scale-[0.98] transition ${
                          acnh
                            ? 'bg-white/65 hover:bg-white/85 border border-[#e8e2d6]'
                            : paper
                            ? 'bg-white/55 hover:bg-white/80 border border-[#5b4833]/10'
                            : 'bg-white/40 dark:bg-white/5 hover:bg-white/60 dark:hover:bg-white/10 border border-white/50 dark:border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 shrink-0 pointer-events-none">
                            <AppIcon app={app} onClick={() => {}} size="sm" hideLabel />
                          </div>
                          <div className="text-sm font-bold truncate">{app.name}</div>
                        </div>
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-current/10 opacity-80 hover:opacity-100">
                          <AppWindow size={12} weight="bold" />
                          <span>移入四宫格</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectableApps.length === 0 && (
                <div className="text-center py-8 opacity-50 text-xs">
                  没有更多可添加的应用了
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部完成按钮 */}
        <div className="p-3.5 border-t border-current/10 shrink-0">
          <button
            onClick={onClose}
            className={`w-full py-2.5 rounded-xl font-bold text-xs shadow-md active:scale-95 transition text-center ${addBtnCls}`}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export const QuadAppsManagerModal = QuadAppPickerModal;
export default QuadAppPickerModal;
