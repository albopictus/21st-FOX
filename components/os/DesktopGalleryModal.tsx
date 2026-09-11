import React, { useState } from 'react';
import {
  Clock, User, CalendarDots, CalendarHeart, MusicNotes, Image as ImageIcon,
  Note, SquaresFour, AppWindow, X, Plus,
} from '@phosphor-icons/react';
import type { GridItemKind } from '../../types';
import { INSTALLED_APPS, DOCK_APPS } from '../../constants';
import AppIcon from './AppIcon';
import { GALLERY_KINDS, WIDGET_META, defaultSizeFor } from './desktopWidgetRegistry';

/**
 * 自由网格桌面 · 「添加组件 / 应用」弹窗。
 *
 * 与旧 WidgetGalleryModal 的区别：
 *  - 组件列表由 desktopWidgetRegistry 的 GALLERY_KINDS / WIDGET_META 生成，不再硬编码
 *  - singleton（时钟 / 角色卡 / 日程）若桌面已有则置灰
 *  - 「应用」页按「是否已在网格上」分组，不再有独立的 hidden 池
 *  - 选中回调直接给 kind / appId，落点由调用方 addItem 到当前页
 */

interface DesktopGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddWidget: (kind: GridItemKind) => void;
  onAddApp: (appId: string) => void;
  /** 桌面上已存在的条目 kind（用于给 singleton 置灰） */
  existingKinds: Set<GridItemKind>;
  /** 已摆在网格上的 AppID（用于标「已在桌面」） */
  placedAppIds: Set<string>;
  /** 目标页说明，如「到主屏」「到第 3 页」 */
  targetLabel?: string;
  acnh?: boolean;
  paper?: boolean;
  initialTab?: 'widgets' | 'apps';
}

const KIND_ICON: Record<GridItemKind, React.ReactNode> = {
  app: <AppWindow size={22} weight="fill" />,
  clock: <Clock size={22} weight="fill" />,
  charCard: <User size={22} weight="fill" />,
  schedule: <CalendarDots size={22} weight="fill" />,
  music: <MusicNotes size={22} weight="fill" />,
  image: <ImageIcon size={22} weight="fill" />,
  calendar: <CalendarDots size={22} weight="fill" />,
  anniversary: <CalendarHeart size={22} weight="fill" />,
  memo: <Note size={22} weight="fill" />,
  quad_apps: <SquaresFour size={22} weight="fill" />,
};

const KIND_TINT: Partial<Record<GridItemKind, string>> = {
  clock: 'bg-sky-500/15 text-sky-500',
  charCard: 'bg-violet-500/15 text-violet-500',
  schedule: 'bg-teal-500/15 text-teal-500',
  music: 'bg-purple-500/15 text-purple-500',
  image: 'bg-emerald-500/15 text-emerald-500',
  calendar: 'bg-blue-500/15 text-blue-500',
  anniversary: 'bg-pink-500/15 text-pink-500',
  memo: 'bg-amber-500/15 text-amber-500',
  quad_apps: 'bg-indigo-500/15 text-indigo-500',
};

export const DesktopGalleryModal: React.FC<DesktopGalleryModalProps> = ({
  isOpen, onClose, onAddWidget, onAddApp,
  existingKinds, placedAppIds,
  targetLabel = '到当前页',
  acnh = false, paper = false, initialTab = 'widgets',
}) => {
  const [activeTab, setActiveTab] = useState<'widgets' | 'apps'>(initialTab);
  if (!isOpen) return null;

  const gridApps = INSTALLED_APPS.filter(a => !DOCK_APPS.includes(a.id));
  const offDesktop = gridApps.filter(a => !placedAppIds.has(a.id));
  const onDesktop = gridApps.filter(a => placedAppIds.has(a.id));

  const panelCls = acnh
    ? 'bg-[#faf6ec]/95 text-[#725d42] border-2 border-[#e8e2d6]'
    : paper
    ? 'bg-[#f5f0e6]/95 text-[#4a3e31] border border-[#ddd5c7]'
    : 'bg-white/85 dark:bg-neutral-900/85 text-slate-800 dark:text-neutral-100 border border-white/60 dark:border-white/10 backdrop-blur-2xl';
  const addBtnCls = acnh ? 'bg-[#19c8b9] text-white' : paper ? 'bg-[#788369] text-white' : 'bg-slate-900 hover:bg-black text-white dark:bg-white dark:text-neutral-900';

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in select-none">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className={`relative w-full sm:max-w-md rounded-t-[2.25rem] sm:rounded-[2.25rem] max-h-[82vh] flex flex-col shadow-[0_24px_64px_rgba(0,0,0,0.22)] overflow-hidden animate-slide-up z-10 ${panelCls}`}>
        <div className="w-10 h-1 rounded-full bg-current/20 mx-auto mt-3 mb-1 shrink-0" />

        <div className="px-5 pt-2 pb-3 flex items-center justify-between shrink-0">
          <div className="flex p-1 rounded-full bg-black/5 dark:bg-white/10 text-xs font-bold">
            <button
              onClick={() => setActiveTab('widgets')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all ${activeTab === 'widgets' ? 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-white shadow-xs' : 'text-current/60 hover:text-current'}`}
            >
              <SquaresFour size={14} weight="bold" /><span>小组件</span>
            </button>
            <button
              onClick={() => setActiveTab('apps')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all ${activeTab === 'apps' ? 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-white shadow-xs' : 'text-current/60 hover:text-current'}`}
            >
              <AppWindow size={14} weight="bold" /><span>添加应用</span>
              {offDesktop.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 text-[10px] rounded-full bg-red-500 text-white font-black">{offDesktop.length}</span>
              )}
            </button>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/10 hover:bg-black/10 active:scale-90 transition" title="关闭">
            <X size={15} weight="bold" />
          </button>
        </div>

        <div className="px-5 pb-1 text-[11px] opacity-50 shrink-0">{targetLabel}</div>

        <div className="px-5 py-2 overflow-y-auto no-scrollbar space-y-2.5 flex-1">
          {activeTab === 'widgets' ? (
            GALLERY_KINDS.map(kind => {
              const meta = WIDGET_META[kind];
              const size = defaultSizeFor(kind);
              const taken = !!meta.singleton && existingKinds.has(kind);
              return (
                <div
                  key={kind}
                  onClick={() => { if (!taken) { onAddWidget(kind); onClose(); } }}
                  className={`group flex items-center gap-3.5 p-3 rounded-2xl transition-all ${taken ? 'opacity-40' : 'cursor-pointer active:scale-[0.98]'} ${
                    acnh ? 'bg-white/80 border border-[#e8e2d6]' : paper ? 'bg-white/70 border border-[#5b4833]/10' : 'bg-white/60 dark:bg-white/5 border border-white/70 dark:border-white/10'
                  } shadow-xs`}
                >
                  <div className={`w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center shadow-xs ${KIND_TINT[kind] || 'bg-slate-500/15 text-slate-500'}`}>
                    {KIND_ICON[kind]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold truncate">{meta.label}</span>
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold bg-current/10 opacity-70">{size.w} × {size.h}</span>
                      {taken && <span className="text-[9px] opacity-70">已在桌面</span>}
                    </div>
                    <p className="text-[11px] opacity-65 line-clamp-1 mt-0.5">{meta.desc}</p>
                  </div>
                  {!taken && (
                    <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs shadow-xs group-hover:scale-105 active:scale-95 transition ${addBtnCls}`}>
                      <Plus size={14} weight="bold" />
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="space-y-3 py-1">
              {offDesktop.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold opacity-60 px-1 tracking-wider uppercase">不在桌面上 · 可添加</div>
                  <div className="space-y-2">
                    {offDesktop.map(app => (
                      <div key={app.id} className={`flex items-center justify-between p-2.5 rounded-2xl shadow-xs ${
                        acnh ? 'bg-white/85 border border-[#e8e2d6]' : paper ? 'bg-white/75 border border-[#5b4833]/10' : 'bg-white/60 dark:bg-white/5 border border-white/70 dark:border-white/10'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 shrink-0"><AppIcon app={app} onClick={() => {}} size="sm" hideLabel /></div>
                          <div className="text-sm font-bold">{app.name}</div>
                        </div>
                        <button
                          onClick={() => { onAddApp(app.id); onClose(); }}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold active:scale-95 shadow-xs ${addBtnCls}`}
                        >
                          <Plus size={13} weight="bold" /><span>加到桌面</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {onDesktop.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold opacity-60 px-1 tracking-wider uppercase mt-3">已在桌面</div>
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {onDesktop.map(app => (
                      <div key={app.id} className="flex flex-col items-center p-2 rounded-2xl bg-black/5 dark:bg-white/5 text-center opacity-65">
                        <div className="w-9 h-9 pointer-events-none mb-1"><AppIcon app={app} onClick={() => {}} size="sm" hideLabel /></div>
                        <span className="text-[10px] font-bold truncate max-w-[56px]">{app.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-3.5 border-t border-current/10 shrink-0">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl font-bold text-xs bg-black/5 dark:bg-white/10 hover:bg-black/10 active:scale-95 transition text-center">完成</button>
        </div>
      </div>
    </div>
  );
};

export default DesktopGalleryModal;
