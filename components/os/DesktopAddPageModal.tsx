import React from 'react';
import { SquaresFour, AppWindow, X } from '@phosphor-icons/react';

interface DesktopAddPageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLayout: (layout: 'windmill' | 'standard') => void;
  acnh?: boolean;
  paper?: boolean;
}

export const DesktopAddPageModal: React.FC<DesktopAddPageModalProps> = ({
  isOpen,
  onClose,
  onSelectLayout,
  acnh = false,
  paper = false,
}) => {
  if (!isOpen) return null;

  const panelCls = acnh
    ? 'bg-[#faf6ec]/95 text-[#725d42] border-2 border-[#e8e2d6]'
    : paper
    ? 'bg-[#f5f0e6]/95 text-[#4a3e31] border border-[#ddd5c7]'
    : 'bg-white/85 dark:bg-neutral-900/85 text-slate-800 dark:text-neutral-100 border border-white/60 dark:border-white/10 backdrop-blur-2xl';

  const cardCls = acnh
    ? 'bg-white/85 hover:bg-white border border-[#e8e2d6] active:scale-[0.98]'
    : paper
    ? 'bg-white/70 hover:bg-white/90 border border-[#5b4833]/10 active:scale-[0.98]'
    : 'bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 border border-white/70 dark:border-white/10 active:scale-[0.98]';

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in select-none">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className={`relative w-full sm:max-w-md rounded-t-[2.25rem] sm:rounded-[2.25rem] p-5 pb-7 sm:pb-6 flex flex-col shadow-[0_24px_64px_rgba(0,0,0,0.22)] overflow-hidden animate-slide-up z-10 ${panelCls}`}>
        <div className="w-10 h-1 rounded-full bg-current/20 mx-auto -mt-1 mb-3 shrink-0" />

        <div className="flex items-center justify-between pb-3 shrink-0">
          <div>
            <h3 className="text-base font-bold tracking-tight">添加新页面</h3>
            <p className="text-[11px] opacity-60 mt-0.5">选择页面的网格排列与空间规格</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/10 hover:bg-black/10 active:scale-90 transition"
            title="关闭"
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        <div className="space-y-3 pt-1">
          {/* 选项 1：6×4 风车/小组件页 */}
          <button
            type="button"
            onClick={() => onSelectLayout('windmill')}
            className={`w-full text-left p-4 rounded-2xl transition shadow-xs flex items-start gap-3.5 cursor-pointer ${cardCls}`}
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-teal-500/15 text-teal-600 dark:text-teal-400">
              <SquaresFour size={26} weight="fill" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold">6 × 4 小组件 / 风车页</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/15 text-teal-700 dark:text-teal-300 font-mono">
                  呼吸感
                </span>
              </div>
              <p className="text-xs opacity-65 mt-1 leading-snug">
                24px 大行距与舒适留白，专为日程、大日历、音乐黑胶、相框与四宫格打造。
              </p>
            </div>
          </button>

          {/* 选项 2：7×4 紧凑应用页 */}
          <button
            type="button"
            onClick={() => onSelectLayout('standard')}
            className={`w-full text-left p-4 rounded-2xl transition shadow-xs flex items-start gap-3.5 cursor-pointer ${cardCls}`}
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <AppWindow size={26} weight="fill" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold">7 × 4 紧凑应用页</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-mono">
                  28 图标
                </span>
              </div>
              <p className="text-xs opacity-65 mt-1 leading-snug">
                14px 紧凑行距与上移边距，最大化屏幕利用率，一页整齐收纳海量应用。
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
