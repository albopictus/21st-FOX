import React from 'react';
import {
  Calendar as CalendarIcon,
  Heart,
  MusicNotes,
  Note,
  Image as ImageIcon,
  X,
  Plus,
} from '@phosphor-icons/react';
import { DesktopWidgetKind, DesktopWidgetSize } from '../../types';

interface WidgetGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWidget: (kind: DesktopWidgetKind, size: DesktopWidgetSize, title: string) => void;
  targetLabel?: string;
  acnh?: boolean;
  paper?: boolean;
}

interface WidgetTemplate {
  kind: DesktopWidgetKind;
  size: DesktopWidgetSize;
  title: string;
  desc: string;
  icon: React.ReactNode;
  tag: string;
}

export const WidgetGalleryModal: React.FC<WidgetGalleryModalProps> = ({
  isOpen,
  onClose,
  onSelectWidget,
  targetLabel = '桌面',
  acnh = false,
  paper = false,
}) => {
  if (!isOpen) return null;

  const templates: WidgetTemplate[] = [
    {
      kind: 'calendar',
      size: '4x2',
      title: '整月日历',
      desc: '清晰呈现本月所有日期与日程标记，轻触即可跳转日程',
      icon: <CalendarIcon size={24} weight="fill" className="text-blue-500" />,
      tag: '4 × 2',
    },
    {
      kind: 'anniversary',
      size: '4x2',
      title: '纪念日与倒计时',
      desc: '记录与角色的特殊日子，支持多页浏览与倒计时天数计算',
      icon: <Heart size={24} weight="fill" className="text-pink-500" />,
      tag: '4 × 2',
    },
    {
      kind: 'music',
      size: '2x2',
      title: '黑胶音乐播放器',
      desc: '支持网易云与离线本地音频导入，可定制旋转中心封面贴纸',
      icon: <MusicNotes size={24} weight="fill" className="text-purple-500" />,
      tag: '2 × 2',
    },
    {
      kind: 'memo',
      size: '2x2',
      title: '方形便签',
      desc: '随身小纸条，快速预览置顶或最新编辑的灵感与备忘',
      icon: <Note size={24} weight="fill" className="text-amber-500" />,
      tag: '2 × 2',
    },
    {
      kind: 'memo',
      size: '4x2',
      title: '横幅便签',
      desc: '宽幅便签卡片，呈现更多笔记正文，随时记录闪念',
      icon: <Note size={24} weight="fill" className="text-amber-500" />,
      tag: '4 × 2',
    },
    {
      kind: 'image',
      size: '2x2',
      title: '自定义相框',
      desc: '在桌面放置一张珍贵相片或插画',
      icon: <ImageIcon size={24} weight="fill" className="text-emerald-500" />,
      tag: '2 × 2',
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in select-none">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      {/* 弹窗面板 */}
      <div
        className={`relative w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up z-10 ${
          acnh
            ? 'bg-[#f7f3df] text-[#725d42]'
            : paper
            ? 'bg-[#f4efe4] text-[#3c3226]'
            : 'bg-slate-900/95 text-white border border-white/15 backdrop-blur-2xl'
        }`}
      >
        {/* 顶部标题栏 */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-current/10 shrink-0">
          <div>
            <h3 className="text-base font-black tracking-wide">添加小组件</h3>
            <p className="text-[11px] opacity-60 mt-0.5">将组件{targetLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-current/10 hover:bg-current/20 active:scale-90 transition"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* 组件卡片列表 */}
        <div className="px-5 py-4 overflow-y-auto no-scrollbar space-y-3 flex-1">
          {templates.map((tpl, i) => (
            <div
              key={`${tpl.kind}-${tpl.size}-${i}`}
              onClick={() => {
                onSelectWidget(tpl.kind, tpl.size, tpl.title);
                onClose();
              }}
              className={`flex items-center gap-3.5 p-3.5 rounded-2xl cursor-pointer transition-all active:scale-[0.98] ${
                acnh
                  ? 'bg-white/80 hover:bg-white border border-[#e8e2d6] shadow-xs'
                  : paper
                  ? 'bg-white/65 hover:bg-white/90 border border-[#5b4833]/10 shadow-xs'
                  : 'bg-white/10 hover:bg-white/15 border border-white/10 shadow-md'
              }`}
            >
              <div
                className={`w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center shadow-xs ${
                  acnh
                    ? 'bg-[#82D5BB]/20'
                    : paper
                    ? 'bg-[#788369]/15'
                    : 'bg-white/10'
                }`}
              >
                {tpl.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold truncate">{tpl.title}</span>
                  <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold bg-current/10 opacity-70">
                    {tpl.tag}
                  </span>
                </div>
                <p className="text-[11px] opacity-65 line-clamp-1 mt-0.5 font-sans">
                  {tpl.desc}
                </p>
              </div>

              <button
                className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center font-bold text-xs transition ${
                  acnh
                    ? 'bg-[#19c8b9] text-white shadow-xs'
                    : paper
                    ? 'bg-[#788369] text-white shadow-xs'
                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-md'
                }`}
              >
                <Plus size={14} weight="bold" />
              </button>
            </div>
          ))}
        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-current/10 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl font-bold text-xs bg-current/10 hover:bg-current/15 active:scale-95 transition text-center"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};

export default WidgetGalleryModal;
