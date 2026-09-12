import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Heart,
  MusicNotes,
  Note,
  Image as ImageIcon,
  X,
  Plus,
  SquaresFour,
  AppWindow,
} from '@phosphor-icons/react';
import { DesktopWidgetKind, DesktopWidgetSize } from '../../types';
import { INSTALLED_APPS } from '../../constants';
import AppIcon from './AppIcon';

interface WidgetGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWidget: (kind: DesktopWidgetKind, size: DesktopWidgetSize, title: string) => void;
  onSelectApp?: (appId: string) => void;
  hiddenAppIds?: string[];
  targetLabel?: string;
  acnh?: boolean;
  paper?: boolean;
  initialTab?: 'widgets' | 'apps';
}

interface WidgetTemplate {
  kind: DesktopWidgetKind;
  size: DesktopWidgetSize;
  title: string;
  desc: string;
  icon: React.ReactNode;
  tag: string;
  iconBg: string;
  iconColor: string;
}

export const WidgetGalleryModal: React.FC<WidgetGalleryModalProps> = ({
  isOpen,
  onClose,
  onSelectWidget,
  onSelectApp,
  hiddenAppIds = [],
  targetLabel = '桌面',
  acnh = false,
  paper = false,
  initialTab = 'widgets',
}) => {
  const [activeTab, setActiveTab] = useState<'widgets' | 'apps'>(initialTab);

  if (!isOpen) return null;

  const templates: WidgetTemplate[] = [
    {
      kind: 'calendar',
      size: '4x2',
      title: '整月日历',
      desc: '原版整月日期与日程标记，轻触直达日程安排',
      icon: <CalendarIcon size={22} weight="fill" />,
      tag: '4 × 2',
      iconBg: 'bg-blue-500/15',
      iconColor: 'text-blue-500',
    },
    {
      kind: 'anniversary',
      size: '4x2',
      title: '纪念日与倒计时',
      desc: '记录与角色的特殊日子，支持翻页与倒数日',
      icon: <Heart size={22} weight="fill" />,
      tag: '4 × 2',
      iconBg: 'bg-pink-500/15',
      iconColor: 'text-pink-500',
    },
    {
      kind: 'music',
      size: '2x2',
      title: '黑胶音乐播放器',
      desc: '支持网易云与离线本地音频，可定制旋转贴纸',
      icon: <MusicNotes size={22} weight="fill" />,
      tag: '2 × 2',
      iconBg: 'bg-purple-500/15',
      iconColor: 'text-purple-500',
    },
    {
      kind: 'memo',
      size: '2x2',
      title: '方形便签',
      desc: '小巧便签小纸条，快速浏览置顶与最新想法',
      icon: <Note size={22} weight="fill" />,
      tag: '2 × 2',
      iconBg: 'bg-amber-500/15',
      iconColor: 'text-amber-500',
    },
    {
      kind: 'memo',
      size: '4x2',
      title: '横幅便签',
      desc: '宽幅便签卡片，呈现更多笔记全文内容',
      icon: <Note size={22} weight="fill" />,
      tag: '4 × 2',
      iconBg: 'bg-amber-500/15',
      iconColor: 'text-amber-500',
    },
    {
      kind: 'image',
      size: '2x2',
      title: '相框小组件',
      desc: '在桌面上展示喜欢的角色立绘或回忆照片',
      icon: <ImageIcon size={22} weight="fill" />,
      tag: '2 × 2',
      iconBg: 'bg-emerald-500/15',
      iconColor: 'text-emerald-500',
    },
  ];

  // 整理应用列表：将已隐藏/删除的应用排在前面
  const hiddenSet = new Set(hiddenAppIds);
  const hiddenApps = INSTALLED_APPS.filter(app => hiddenSet.has(app.id));
  const normalApps = INSTALLED_APPS.filter(app => !hiddenSet.has(app.id));

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in select-none">
      {/* 柔和背景遮罩 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* 弹窗面板：极致 iOS 磨砂玻璃质感 */}
      <div
        className={`relative w-full sm:max-w-md rounded-t-[2.25rem] sm:rounded-[2.25rem] max-h-[82vh] flex flex-col shadow-[0_24px_64px_rgba(0,0,0,0.22)] overflow-hidden animate-slide-up z-10 ${
          acnh
            ? 'bg-[#faf6ec]/95 text-[#725d42] border-2 border-[#e8e2d6]'
            : paper
            ? 'bg-[#f5f0e6]/95 text-[#4a3e31] border border-[#ddd5c7]'
            : 'bg-white/85 dark:bg-neutral-900/85 text-slate-800 dark:text-neutral-100 border border-white/60 dark:border-white/10 backdrop-blur-2xl'
        }`}
      >
        {/* 顶部手柄指示条 */}
        <div className="w-10 h-1 rounded-full bg-current/20 mx-auto mt-3 mb-1 shrink-0" />

        {/* 顶部 Header 与 分段控制器 */}
        <div className="px-5 pt-2 pb-3 flex items-center justify-between shrink-0">
          {/* iOS 风格分段选择器 */}
          <div className="flex p-1 rounded-full bg-black/5 dark:bg-white/10 text-xs font-bold">
            <button
              onClick={() => setActiveTab('widgets')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all ${
                activeTab === 'widgets'
                  ? 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-current/60 hover:text-current'
              }`}
            >
              <SquaresFour size={14} weight="bold" />
              <span>小组件</span>
            </button>
            <button
              onClick={() => setActiveTab('apps')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all ${
                activeTab === 'apps'
                  ? 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-current/60 hover:text-current'
              }`}
            >
              <AppWindow size={14} weight="bold" />
              <span>添加应用</span>
              {hiddenApps.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 text-[10px] rounded-full bg-red-500 text-white font-black">
                  {hiddenApps.length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/10 hover:bg-black/10 active:scale-90 transition"
            title="关闭"
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        {/* 主内容区域 */}
        <div className="px-5 py-2 overflow-y-auto no-scrollbar space-y-2.5 flex-1">
          {activeTab === 'widgets' ? (
            templates.map((tpl, i) => (
              <div
                key={`${tpl.kind}-${tpl.size}-${i}`}
                onClick={() => {
                  onSelectWidget(tpl.kind, tpl.size, tpl.title);
                  onClose();
                }}
                className={`group flex items-center gap-3.5 p-3 rounded-2xl cursor-pointer transition-all active:scale-[0.98] ${
                  acnh
                    ? 'bg-white/80 hover:bg-white border border-[#e8e2d6] shadow-xs'
                    : paper
                    ? 'bg-white/70 hover:bg-white/90 border border-[#5b4833]/10 shadow-xs'
                    : 'bg-white/60 hover:bg-white/90 dark:bg-white/5 dark:hover:bg-white/10 border border-white/70 dark:border-white/10 shadow-xs'
                }`}
              >
                {/* 柔和彩色图标 */}
                <div
                  className={`w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center shadow-xs ${tpl.iconBg} ${tpl.iconColor}`}
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
                  <p className="text-[11px] opacity-65 line-clamp-1 mt-0.5">
                    {tpl.desc}
                  </p>
                </div>

                {/* 极简圆圈加号按钮 */}
                <button
                  className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center font-bold text-xs transition shadow-xs group-hover:scale-105 active:scale-95 ${
                    acnh
                      ? 'bg-[#19c8b9] text-white'
                      : paper
                      ? 'bg-[#788369] text-white'
                      : 'bg-slate-900 hover:bg-black text-white dark:bg-white dark:text-neutral-900'
                  }`}
                >
                  <Plus size={14} weight="bold" />
                </button>
              </div>
            ))
          ) : (
            <div className="space-y-3 py-1">
              {hiddenApps.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold opacity-60 px-1 tracking-wider uppercase">
                    已隐藏 / 可恢复应用
                  </div>
                  <div className="space-y-2">
                    {hiddenApps.map(app => (
                      <div
                        key={app.id}
                        className={`flex items-center justify-between p-2.5 rounded-2xl transition shadow-xs ${
                          acnh
                            ? 'bg-white/85 border border-[#e8e2d6]'
                            : paper
                            ? 'bg-white/75 border border-[#5b4833]/10'
                            : 'bg-white/60 dark:bg-white/5 border border-white/70 dark:border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 shrink-0">
                            <AppIcon app={app} onClick={() => {}} size="sm" hideLabel />
                          </div>
                          <div>
                            <div className="text-sm font-bold">{app.name}</div>
                            <div className="text-[10px] opacity-50">已从桌面移除</div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (onSelectApp) onSelectApp(app.id);
                            onClose();
                          }}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition active:scale-95 shadow-xs ${
                            acnh
                              ? 'bg-[#19c8b9] text-white'
                              : paper
                              ? 'bg-[#788369] text-white'
                              : 'bg-slate-900 hover:bg-black text-white dark:bg-white dark:text-slate-900'
                          }`}
                        >
                          <Plus size={13} weight="bold" />
                          <span>加回桌面</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="text-[11px] font-bold opacity-60 px-1 tracking-wider uppercase mt-3">
                  桌面现有应用
                </div>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {normalApps.map(app => (
                    <div
                      key={app.id}
                      className="flex flex-col items-center p-2 rounded-2xl bg-black/5 dark:bg-white/5 text-center opacity-65"
                    >
                      <div className="w-9 h-9 pointer-events-none mb-1">
                        <AppIcon app={app} onClick={() => {}} size="sm" hideLabel />
                      </div>
                      <span className="text-[10px] font-bold truncate max-w-[56px]">{app.name}</span>
                      <span className="text-[8px] opacity-60 mt-0.5">已在桌面</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部完成按钮 */}
        <div className="p-3.5 border-t border-current/10 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl font-bold text-xs bg-black/5 dark:bg-white/10 hover:bg-black/10 active:scale-95 transition text-center"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default WidgetGalleryModal;
