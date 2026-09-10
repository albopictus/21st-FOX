import React, { useMemo, useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { isPaperWallpaper, useOS } from '../context/OSContext';
import { INSTALLED_APPS, DOCK_APPS } from '../constants';
import { isDevDebugAvailable, subscribeDevDebugAvailability } from '../utils/devDebug';
import AppIcon from '../components/os/AppIcon';
import TokenImg from '../components/os/TokenImg';
import { useBlobRefUrl } from '../utils/blobRef';
import { DB } from '../utils/db';
import { CharacterProfile, Anniversary, AppID, DailySchedule, DesktopWidgetInstance, DesktopWidgetKind, DesktopWidgetSize } from '../types';
import { ScheduleHomeWidget, ScheduleFullscreenViewer } from '../components/schedule/ScheduleHomeWidget';
import NowPlayingSquareWidget from '../components/os/NowPlayingSquareWidget';
import MobileGameHome from '../components/os/MobileGameHome';
import TamagotchiHome from '../components/os/TamagotchiHome';
import { CalendarWidget } from '../components/os/widgets/CalendarWidget';
import { AnniversaryWidget } from '../components/os/widgets/AnniversaryWidget';
import { MemoHomeWidget } from '../components/os/widgets/MemoHomeWidget';
import { WidgetGalleryModal } from '../components/os/WidgetGalleryModal';
import { Plus, Minus, X } from '@phosphor-icons/react';
import { getDailyScheduleForChar } from '../utils/dailySchedule';
import { useLocalDateKey } from '../hooks/useLocalDateKey';
import { resolveCharTimeZone } from '../utils/timezone';
import { trackEvent } from '../utils/analytics';

const CompanionHome = React.lazy(() => import('../components/os/CompanionHome'));

// --- Isolated Components to prevent full re-renders ---

// 1. Clock Component (Consumes virtualTime)
const DesktopClock = React.memo(() => {
    const { virtualTime, theme } = useOS();
    const contentColor = theme.contentColor || '#ffffff';
    const paper = theme.skin !== 'animalcrossing' && theme.skin !== 'mobilegame' && theme.skin !== 'tamagotchi' && isPaperWallpaper(theme.wallpaper);

    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const now = new Date();
    const dayName = days[now.getDay()];
    const monthName = months[now.getMonth()];
    const dateNum = now.getDate().toString().padStart(2, '0');
    const yearNum = now.getFullYear();

    // 简单问候（基于虚拟时间）
    const greeting = virtualTime.hours < 5 ? 'Good Night'
        : virtualTime.hours < 12 ? 'Good Morning'
        : virtualTime.hours < 18 ? 'Good Afternoon'
        : 'Good Evening';

    const hh = virtualTime.hours.toString().padStart(2, '0');
    const mm = virtualTime.minutes.toString().padStart(2, '0');

    // 动森彩蛋：NookPhone 主屏时钟 —— 问候 + 大号时间(主角) + 星期·日期
    if (theme.skin === 'animalcrossing') {
        const weekdayTitle = dayName.charAt(0) + dayName.slice(1).toLowerCase();
        const monthTitle = monthName.charAt(0) + monthName.slice(1).toLowerCase();
        return (
            <div className="mt-7 mb-5 text-center animate-fade-in select-none">
                <div className="text-[13px] font-extrabold tracking-wide" style={{ color: '#8a7a5c' }}>
                    🍃 {greeting}, Resident
                </div>
                <div className="text-[3.5rem] font-extrabold leading-none mt-1.5 tracking-[2px]" style={{ color: '#8b7355' }}>
                    {hh}<span className="animate-pulse" style={{ color: '#cfcab2' }}>:</span>{mm}
                </div>
                <div className="text-[15px] font-bold mt-1.5" style={{ color: '#725C4E' }}>
                    {weekdayTitle} · {monthTitle} {Number(dateNum)}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col mb-5 mt-5 relative animate-fade-in" style={{ color: contentColor }}>
            {/* 顶部装饰 — 状态胶囊 + 细线 */}
            <div className="flex items-center gap-2 mb-3 opacity-90">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                    style={{
                        background: paper ? 'rgba(224,221,215,0.30)' : 'rgba(255,255,255,0.28)',
                        border: paper ? '1px solid rgba(91,72,51,0.07)' : '1px solid rgba(255,255,255,0.18)',
                    }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: paper ? '#788369' : '#4ade80', boxShadow: paper ? 'none' : '0 0 6px #4ade80' }} />
                    <span className="text-[9px] font-bold tracking-[0.2em] uppercase">System Online</span>
                </div>
                <div className="h-[1px] flex-1 bg-gradient-to-r from-current to-transparent opacity-30" />
                <span className="text-[9px] tracking-[0.2em] uppercase opacity-60">{yearNum}</span>
            </div>

            {/* 问候 */}
            <div className="text-[11px] tracking-[0.25em] uppercase opacity-55 font-semibold mb-1">
                {greeting}
            </div>

            {/* 主时钟 */}
            <div className="flex items-end gap-4">
                <div className="relative">
                    <div className={`${paper ? 'text-[5.65rem] font-semibold tracking-[-0.055em] drop-shadow-[0_2px_0_rgba(255,255,255,0.34)]' : 'text-[6.25rem] font-black tracking-tighter drop-shadow-2xl'} leading-[0.84]`}
                        style={{ fontFamily: paper ? `'Iowan Old Style', 'Baskerville', 'Times New Roman', serif` : `'Space Grotesk', 'SF Pro Display', sans-serif`, fontFeatureSettings: '"tnum"' }}>
                        <span>{virtualTime.hours.toString().padStart(2, '0')}</span>
                        <span className="opacity-35 font-thin mx-0.5 animate-pulse">:</span>
                        <span>{virtualTime.minutes.toString().padStart(2, '0')}</span>
                    </div>
                    {/* 细光斑 */}
                    {!paper && <div className="absolute -top-2 -right-3 w-8 h-8 rounded-full pointer-events-none"
                        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.4), transparent 70%)' }} />}
                </div>

                <div className="flex flex-col justify-end pb-2.5 gap-0.5">
                    <div className="text-[10px] font-bold tracking-[0.22em] opacity-85">{dayName}</div>
                    <div className="flex items-baseline gap-1">
                        <div className="text-2xl font-black leading-none" style={{ fontFamily: `'Space Grotesk', sans-serif` }}>{dateNum}</div>
                        <div className="text-[10px] font-bold tracking-[0.2em] opacity-70">{monthName}</div>
                    </div>
                </div>
            </div>
        </div>
    );
});

// 2. Character Widget (Consumes Character Data & Messages)
const CharacterWidget = React.memo(({ 
    char, 
    unreadCount, 
    lastMessage, 
    onClick, 
    contentColor,
    paper = false,
}: { 
    char: CharacterProfile | null, 
    unreadCount: number, 
    lastMessage: string, 
    onClick: () => void,
    contentColor: string,
    paper?: boolean,
}) => {
    const { theme } = useOS();
    const acnh = theme.skin === 'animalcrossing'; // 动森彩蛋：会"说话"的村民卡
    // 卡片底的虚化头像画在 CSS background-image 上，吃不到 TokenImg 的解析，这里自己解析一次。
    const avatarUrl = useBlobRefUrl(char?.avatar);

    // 动森：村民头像 + AC 对话气泡（显示最近消息，点开聊天）
    if (acnh) {
        return (
            <div className="mb-4 animate-fade-in" onClick={onClick}>
                <div className="flex items-end gap-2.5 cursor-pointer active:scale-[0.98] transition-transform">
                    {/* 村民头像（圆角方块 + 白边） */}
                    <div className="relative w-[60px] h-[60px] shrink-0 rounded-[26%] overflow-hidden bg-[#e8e2d6]"
                        style={{ border: '3px solid #ffffff', boxShadow: '0 4px 10px -2px rgba(61,52,40,0.28)' }}>
                        {char?.avatar
                            ? <TokenImg value={char.avatar} className="w-full h-full object-cover" alt="char" loading="lazy" />
                            : <div className="w-full h-full flex items-center justify-center text-2xl">🍃</div>}
                        {unreadCount > 0 && (
                            <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#fc736d] rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                style={{ border: '2px solid #fff' }}>
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </div>
                        )}
                    </div>
                    {/* AC 对话气泡 */}
                    <div className="relative flex-1 min-w-0 mb-1">
                        <div className="absolute -left-1.5 bottom-3 w-3 h-3 rotate-45"
                            style={{ background: '#FFFBF2', borderLeft: '2px solid #ece0c8', borderBottom: '2px solid #ece0c8' }} />
                        <div className="relative rounded-2xl px-3.5 py-2.5"
                            style={{ background: '#FFFBF2', border: '2px solid #ece0c8', boxShadow: '0 4px 12px -5px rgba(120,90,40,0.25)' }}>
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[13px] font-extrabold truncate" style={{ color: '#725d42' }}>{char?.name || 'Resident'}</span>
                                <span className="text-[11px] leading-none">{unreadCount > 0 ? '💬' : '🍃'}</span>
                            </div>
                            <div className="text-[11px] leading-snug line-clamp-2" style={{ color: '#9f8b68' }}>{lastMessage}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mb-3 group animate-fade-in">
             <div
                className="relative h-24 w-full overflow-hidden rounded-3xl cursor-pointer transition-transform duration-300 active:scale-[0.98]"
                onClick={onClick}
                style={paper ? {
                    background: 'rgba(224,221,215,0.40)',
                    border: '1px solid rgba(91,72,51,0.07)',
                    boxShadow: '0 5px 16px rgba(91,72,51,0.055)',
                } : acnh ? {
                    background: 'rgb(247,243,223)',
                    border: '2px solid #e8e2d6',
                    boxShadow: '0 8px 24px 0 rgba(61,52,40,0.14)',
                } : {
                    background: 'rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(24px) saturate(1.4)',
                    WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
             >
                 {/* 背景虚化角色头像（动森模式下省略，避免糊在奶油底上） */}
                 {!acnh && !paper && avatarUrl && (
                     <div className="absolute inset-0 opacity-25 pointer-events-none"
                         style={{
                             backgroundImage: `url(${avatarUrl})`,
                             backgroundSize: 'cover',
                             backgroundPosition: 'center',
                             filter: 'blur(30px) saturate(1.6)',
                             transform: 'scale(1.3)',
                         }} />
                 )}

                 <div className="relative flex items-center p-3 gap-3 h-full">
                     {/* 头像 */}
                     <div className={`w-[68px] h-[68px] shrink-0 rounded-2xl overflow-hidden relative ${paper ? 'bg-[#ded2c1]' : 'bg-slate-800'}`}
                         style={{
                             border: paper ? '1px solid rgba(91,72,51,0.14)' : acnh ? '2px solid #e8e2d6' : '1.5px solid rgba(255,255,255,0.25)',
                             boxShadow: paper ? '0 5px 14px rgba(91,72,51,0.13)' : acnh ? '0 4px 12px -4px rgba(61,52,40,0.25)' : '0 4px 14px rgba(0,0,0,0.25)',
                         }}>
                         {char ? (
                             <TokenImg value={char.avatar} className="w-full h-full object-cover" alt="char" loading="lazy" />
                         ) : <div className="w-full h-full bg-white/10 animate-pulse" />}
                         {unreadCount > 0 ? (
                            <div className="absolute bottom-0.5 right-0.5 min-w-[16px] h-[16px] px-1 bg-red-500 rounded-full border border-white/30 shadow-sm flex items-center justify-center text-[9px] font-bold text-white">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </div>
                         ) : (
                            <div className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-white/60" style={{ background: paper ? '#788369' : '#4ade80', boxShadow: paper ? 'none' : '0 0 6px #4ade80' }}></div>
                         )}
                     </div>

                     {/* 文本 */}
                     <div className="flex-1 min-w-0 flex flex-col justify-center gap-1" style={{ color: contentColor }}>
                         <div className="flex items-center gap-1.5">
                             <h3 className={`text-[15px] font-bold tracking-wide truncate ${paper ? '' : 'drop-shadow-md'}`}>
                                 {char?.name || 'NO SIGNAL'}
                             </h3>
                             {unreadCount > 0 ? (
                                 <div className="px-1.5 py-px rounded-full text-[8px] font-bold uppercase tracking-[0.15em]"
                                     style={{ background: 'rgba(239,68,68,0.9)', color: 'white' }}>NEW</div>
                             ) : (
                                 <div className="px-1.5 py-px rounded-full text-[8px] font-bold uppercase tracking-[0.15em]"
                                     style={paper ? { background: 'rgba(120,131,105,0.16)', color: '#68725b' } : acnh ? { background: '#7cba4c', color: 'white' } : { background: 'rgba(255,255,255,0.18)' }}>Online</div>
                             )}
                         </div>
                         <div className="text-xs font-medium leading-relaxed opacity-85 flex items-start gap-1.5">
                            <span
                                aria-hidden="true"
                                className="shrink-0 mt-[0.42em] opacity-45"
                                style={{ width: 0, height: 0, borderTop: '3px solid transparent', borderBottom: '3px solid transparent', borderLeft: '4px solid currentColor' }}
                            />
                            <span className="line-clamp-2">{lastMessage}</span>
                         </div>
                     </div>
                 </div>
             </div>
        </div>
    );
});

// 3. Grid Page Component
const AppGridPage = React.memo(({
    apps,
    openApp,
    acnh = false,
    editing = false,
    onRemoveApp,
}: {
    apps: typeof INSTALLED_APPS,
    openApp: (id: AppID) => void,
    acnh?: boolean,
    editing?: boolean,
    onRemoveApp?: (id: AppID) => void,
}) => {
    return (
        <div className={`grid place-items-center animate-fade-in relative ${acnh ? 'grid-cols-4 gap-y-6 gap-x-2' : 'grid-cols-4 gap-y-6 gap-x-2'}`}>
             {apps.map(app => (
                 <div
                    key={app.id}
                    data-launcher-item={app.id}
                    data-launcher-kind="app"
                    className={`relative transition-transform duration-200 active:scale-95 ${editing ? 'launcher-edit-item' : ''}`}
                 >
                     {editing && onRemoveApp && (
                         <button
                             onClick={(e) => {
                                 e.stopPropagation();
                                 onRemoveApp(app.id);
                             }}
                             className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white font-bold text-xs flex items-center justify-center shadow-md active:scale-90 z-30 transition-transform hover:bg-red-600 cursor-pointer"
                             title="移除应用"
                         >
                             <Minus size={11} weight="bold" />
                         </button>
                     )}
                     <AppIcon
                        app={app}
                        onClick={() => { if (!editing) openApp(app.id); }}
                        size="md"
                     />
                 </div>
             ))}
        </div>
    );
});

// 3b. Small 2x2 app grid for pinwheel cells
const AppQuadGrid = React.memo(({
    apps,
    openApp,
    editing = false,
    onRemoveApp,
}: {
    apps: typeof INSTALLED_APPS,
    openApp: (id: AppID) => void,
    editing?: boolean,
    onRemoveApp?: (id: AppID) => void,
}) => {
    return (
        <div className="w-full h-full grid grid-cols-2 grid-rows-2 place-items-center gap-x-2 gap-y-3">
            {apps.map(app => (
                <div key={app.id} data-launcher-item={app.id} data-launcher-kind="app" className={`relative transition-transform duration-200 active:scale-95 ${editing ? 'launcher-edit-item' : ''}`}>
                    {editing && onRemoveApp && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemoveApp(app.id);
                            }}
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white font-bold text-[10px] flex items-center justify-center shadow-md active:scale-90 z-30 transition-transform hover:bg-red-600 cursor-pointer"
                            title="移除应用"
                        >
                            <Minus size={10} weight="bold" />
                        </button>
                    )}
                    <AppIcon app={app} onClick={() => { if (!editing) openApp(app.id); }} />
                </div>
            ))}
        </div>
    );
});

// 3c. Square image slot for pinwheel (bottom-right)
const DesktopSquareImage = React.memo(({ image, contentColor, onClick, acnh = false }: {
    image?: string,
    contentColor: string,
    onClick: () => void,
    acnh?: boolean,
}) => {
    const { theme } = useOS();
    const paper = theme.skin !== 'animalcrossing' && theme.skin !== 'mobilegame' && theme.skin !== 'tamagotchi' && isPaperWallpaper(theme.wallpaper);
    return (
        <div
            onClick={onClick}
            className="relative w-full h-full rounded-[1.75rem] overflow-hidden cursor-pointer animate-fade-in transition-transform active:scale-[0.98]"
            style={paper ? {
                background: image ? 'rgba(224,221,215,0.26)' : 'rgba(224,221,215,0.38)',
                border: '1px solid rgba(91,72,51,0.07)',
                boxShadow: '0 5px 16px rgba(91,72,51,0.055)',
                color: contentColor,
            } : acnh ? {
                background: image ? 'rgb(247,243,223)' : 'rgb(247,243,223)',
                border: '2px solid #e8e2d6',
                boxShadow: '0 6px 18px rgba(61,52,40,0.12)',
                color: contentColor,
            } : {
                background: image ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.28)',
                border: '1px solid rgba(255,255,255,0.18)',
                boxShadow: '0 8px 30px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.07)',
                color: contentColor,
            }}
        >
            {image ? (
                <TokenImg value={image} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center"
                        style={{ background: paper ? 'rgba(120,131,105,0.10)' : 'rgba(255,255,255,0.1)', border: paper ? '1px solid rgba(91,72,51,0.12)' : '1px solid rgba(255,255,255,0.16)' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-4 h-4 opacity-70">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                        </svg>
                    </div>
                    <div className="text-[8.5px] uppercase font-bold tracking-[0.22em] opacity-55">Add Image</div>
                    <div className="text-[8.5px] opacity-40 leading-tight">从 外观 · 启动器组件<br/>设置一张方图</div>
                </div>
            )}
        </div>
    );
});

const DEFAULT_MINUS_ONE_WIDGETS: DesktopWidgetInstance[] = [
    { id: 'w-calendar-default', kind: 'calendar', size: '4x2', title: '整月日历' },
    { id: 'w-anniversary-default', kind: 'anniversary', size: '4x2', title: '纪念日与倒计时' },
];

// --- Persist scroll page across remounts (e.g. returning from apps) ---
// 默认定位在主屏（Screen 1，即原主屏）；左滑进入负一屏（Screen 0）
let _lastPageIndex = 1;

// --- Main Launcher ---

const Launcher: React.FC = () => {
  const { openApp, characters, activeCharacterId, theme, updateTheme, lastMsgTimestamp, isDataLoaded, unreadMessages } = useOS();

  // Local state for widget data to prevent context trashing
  const [widgetChar, setWidgetChar] = useState<CharacterProfile | null>(null);
  const [lastMessage, setLastMessage] = useState<string>('');
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
  const [scheduleData, setScheduleData] = useState<DailySchedule | null>(null);
  const [scheduleCharId, setScheduleCharId] = useState<string | null>(null);
  const [scheduleViewerOpen, setScheduleViewerOpen] = useState(false);
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryTarget, setGalleryTarget] = useState<string>('minus_one');
  const [galleryInitialTab, setGalleryInitialTab] = useState<'widgets' | 'apps'>('widgets');

  const minusOneWidgets = useMemo(() => {
      if (theme.launcherMinusOneWidgets !== undefined) {
          return theme.launcherMinusOneWidgets;
      }
      return DEFAULT_MINUS_ONE_WIDGETS;
  }, [theme.launcherMinusOneWidgets]);

  const handleRemoveMinusOneWidget = useCallback(async (id: string) => {
      const next = minusOneWidgets.filter(w => w.id !== id);
      await updateTheme({ launcherMinusOneWidgets: next });
  }, [minusOneWidgets, updateTheme]);

  const handleAddWidget = useCallback(async (kind: DesktopWidgetKind, size: DesktopWidgetSize, title: string) => {
      const newWidget: DesktopWidgetInstance = {
          id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind,
          size,
          title,
      };
      if (galleryTarget === 'minus_one') {
          const next = [...minusOneWidgets, newWidget];
          await updateTheme({ launcherMinusOneWidgets: next });
      } else {
          const targetScreen = typeof galleryTarget === 'string' && galleryTarget.startsWith('page_')
              ? parseInt(galleryTarget.replace('page_', ''), 10)
              : activePageIndexRef.current;
          const customPageIdx = Math.max(0, targetScreen - 3);
          const curCustom = [...(theme.launcherCustomPages || [])];
          while (curCustom.length <= customPageIdx) {
              curCustom.push({ id: `page-${Date.now()}-${curCustom.length}`, widgets: [] });
          }
          const targetPage = { ...curCustom[customPageIdx] };
          targetPage.widgets = [...(targetPage.widgets || []), newWidget];
          curCustom[customPageIdx] = targetPage;
          await updateTheme({ launcherCustomPages: curCustom });
      }
  }, [galleryTarget, minusOneWidgets, theme.launcherCustomPages, updateTheme]);

  const handleRemoveCustomPageWidget = useCallback(async (customPageIdx: number, widgetId: string) => {
      const curCustom = [...(theme.launcherCustomPages || [])];
      if (customPageIdx >= 0 && customPageIdx < curCustom.length) {
          const targetPage = { ...curCustom[customPageIdx] };
          targetPage.widgets = (targetPage.widgets || []).filter(w => w.id !== widgetId);
          curCustom[customPageIdx] = targetPage;
          await updateTheme({ launcherCustomPages: curCustom });
      }
  }, [theme.launcherCustomPages, updateTheme]);

  const handleRemoveApp = useCallback(async (appId: string) => {
      const nextOrder = launcherAppOrderRef.current.filter(id => id !== appId);
      const nextDock = launcherDockOrderRef.current.filter(id => id !== appId);
      const curHidden = theme.launcherHiddenApps || [];
      const nextHidden = Array.from(new Set([...curHidden, appId]));

      launcherAppOrderRef.current = nextOrder;
      launcherDockOrderRef.current = nextDock;
      setLauncherAppOrder(nextOrder);
      setLauncherDockOrder(nextDock);

      await updateTheme({
          launcherAppOrder: nextOrder,
          launcherDockOrder: nextDock,
          launcherHiddenApps: nextHidden,
      });
      trackEvent('桌面移除应用');
  }, [theme.launcherHiddenApps, updateTheme]);

  const handleRestoreApp = useCallback(async (appId: string) => {
      const curHidden = theme.launcherHiddenApps || [];
      const nextHidden = curHidden.filter(id => id !== appId);
      const nextOrder = [...launcherAppOrderRef.current, appId];

      launcherAppOrderRef.current = nextOrder;
      setLauncherAppOrder(nextOrder);

      await updateTheme({
          launcherAppOrder: nextOrder,
          launcherHiddenApps: nextHidden,
      });
      trackEvent('桌面恢复应用');
  }, [theme.launcherHiddenApps, updateTheme]);

  const handleAddPage = useCallback(async () => {
      const curCustom = theme.launcherCustomPages || [];
      const nextCustom = [...curCustom, { id: `page-${Date.now()}` }];
      await updateTheme({ launcherCustomPages: nextCustom });
  }, [theme.launcherCustomPages, updateTheme]);

  const handleRemovePage = useCallback(async (screenIdx: number) => {
      // Screen 0: -1 screen; Screen 1: Home; Screen 2: Schedule; Screen 3+: Custom pages
      const customIdx = screenIdx - 3;
      const curCustom = [...(theme.launcherCustomPages || [])];
      if (customIdx >= 0 && customIdx < curCustom.length) {
          curCustom.splice(customIdx, 1);
          await updateTheme({ launcherCustomPages: curCustom });
      } else if (curCustom.length > 0) {
          curCustom.pop();
          await updateTheme({ launcherCustomPages: curCustom });
      }
  }, [theme.launcherCustomPages, updateTheme]);

  const layoutPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutPointer = useRef<{
      pointerId: number;
      key: string;
      kind: string;
      x: number;
      y: number;
      active: boolean;
      element: HTMLElement;
      ghost?: HTMLElement;
      grabOffsetX?: number;
      grabOffsetY?: number;
      lastTarget?: string;
      targetElement?: HTMLElement;
      startPageIndex?: number;
  } | null>(null);
  const suppressLayoutClickUntil = useRef(0);
  const layoutPageTurnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutPageTurnDirection = useRef<-1 | 0 | 1>(0);

  const [activePageIndex, setActivePageIndex] = useState(_lastPageIndex);
  const activePageIndexRef = useRef(_lastPageIndex);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Mouse Drag Logic refs
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftRef = useRef(0);
  const dragMoved = useRef(0);

  // Pagination Logic
  // 跟随 DevDebug 可用性：prod 用户在设置页连点 5 下解锁后，CharCreatorDev 立刻出现；
  // 点「关闭」/ 刷新（prod 自动失效）也立刻消失。useMemo deps 没列 devDebugVisible
  // 会让它锁在 mount 时的初值。
  const [devDebugVisible, setDevDebugVisible] = useState(() => isDevDebugAvailable());
  useEffect(() => subscribeDevDebugAvailability(setDevDebugVisible), []);
  const hiddenAppsSet = useMemo(() => new Set(theme.launcherHiddenApps || []), [theme.launcherHiddenApps]);
  const availableGridApps = useMemo(() => {
    return INSTALLED_APPS.filter(app =>
      !DOCK_APPS.includes(app.id)
      && !hiddenAppsSet.has(app.id)
      // 「捏脸·开发」仅在开发模式（右下角开发徽标可见或手动解锁时）显示
      && (app.id !== AppID.CharCreatorDev || devDebugVisible)
    );
  }, [devDebugVisible, hiddenAppsSet]);

  const normalizeOrder = useCallback((saved: string[] | undefined, available: string[]) => {
      const valid = new Set(available);
      return [...(saved || []).filter((id, index, all) => valid.has(id) && all.indexOf(id) === index), ...available.filter(id => !(saved || []).includes(id))];
  }, []);

  const availableGridIds = useMemo(() => availableGridApps.map(app => app.id), [availableGridApps]);
  const [launcherAppOrder, setLauncherAppOrder] = useState<string[]>(() => normalizeOrder(theme.launcherAppOrder, INSTALLED_APPS.filter(app => !DOCK_APPS.includes(app.id)).map(app => app.id)));
  const [launcherDockOrder, setLauncherDockOrder] = useState<string[]>(() => normalizeOrder(theme.launcherDockOrder, DOCK_APPS));
  const [pinwheelOrder, setPinwheelOrder] = useState<Array<'music' | 'appsA' | 'appsB' | 'image'>>(() => {
      const available = ['music', 'appsA', 'appsB', 'image'] as const;
      const saved = theme.launcherPinwheelOrder || [];
      return [...saved.filter((id, index) => available.includes(id) && saved.indexOf(id) === index), ...available.filter(id => !saved.includes(id))];
  });
  const launcherAppOrderRef = useRef(launcherAppOrder);
  const launcherDockOrderRef = useRef(launcherDockOrder);
  const pinwheelOrderRef = useRef(pinwheelOrder);

  useEffect(() => {
      setLauncherAppOrder(prev => {
          const next = normalizeOrder(prev.length ? prev : theme.launcherAppOrder, availableGridIds);
          launcherAppOrderRef.current = next;
          return next;
      });
  }, [availableGridIds, normalizeOrder, theme.launcherAppOrder]);
  useEffect(() => { launcherAppOrderRef.current = launcherAppOrder; }, [launcherAppOrder]);
  useEffect(() => { launcherDockOrderRef.current = launcherDockOrder; }, [launcherDockOrder]);
  useEffect(() => { pinwheelOrderRef.current = pinwheelOrder; }, [pinwheelOrder]);
  useEffect(() => {
      if (layoutEditing) return;
      const next = normalizeOrder(theme.launcherDockOrder, DOCK_APPS);
      launcherDockOrderRef.current = next;
      setLauncherDockOrder(next);
  }, [layoutEditing, normalizeOrder, theme.launcherDockOrder]);
  useEffect(() => {
      if (layoutEditing) return;
      const available = ['music', 'appsA', 'appsB', 'image'] as const;
      const saved = theme.launcherPinwheelOrder || [];
      const next = [...saved.filter((id, index) => available.includes(id) && saved.indexOf(id) === index), ...available.filter(id => !saved.includes(id))];
      pinwheelOrderRef.current = next;
      setPinwheelOrder(next);
  }, [layoutEditing, theme.launcherPinwheelOrder]);

  const gridApps = useMemo(() => {
      const byId = new Map(availableGridApps.map(app => [app.id, app]));
      return launcherAppOrder.map(id => byId.get(id as AppID)).filter(Boolean) as typeof INSTALLED_APPS;
  }, [availableGridApps, launcherAppOrder]);

  const dockAppsConfig = useMemo(() => {
      const byId = new Map(INSTALLED_APPS.map(app => [app.id, app]));
      return launcherDockOrder.map(id => byId.get(id as AppID)).filter(Boolean) as typeof INSTALLED_APPS;
  }, [launcherDockOrder]);

  // Split apps into pages of 8 (4 cols x 2 rows fit comfortably below widget)
  // Pages: 0 = clock+chat+music+grid (original), 1 = pinwheel, 2 = widget images + grid,
  //        3+ = plain grid. Pad to at least 3 slots so the pinwheel/widget pages always exist.
  const APPS_PER_PAGE = 8;
  const minPages = 3 + (theme.launcherCustomPages?.length || 0);
  const appPages = useMemo(() => {
      const pages: typeof INSTALLED_APPS[] = [];
      for (let i = 0; i < gridApps.length; i += APPS_PER_PAGE) {
          pages.push(gridApps.slice(i, i + APPS_PER_PAGE));
      }
      while (pages.length < minPages) pages.push([]);
      return pages;
  }, [gridApps, minPages]);

  // Page 2 (pinwheel) uses appPages[1]: split into two 2x2 quads
  const page2Apps = appPages[1] || [];
  const page2QuadA = useMemo(() => page2Apps.slice(0, 4), [page2Apps]);
  const page2QuadB = useMemo(() => page2Apps.slice(4, 8), [page2Apps]);

  // Total pages = 1 (-1 负一屏) + App Pages
  const totalPages = 1 + appPages.length;

  useEffect(() => { activePageIndexRef.current = activePageIndex; }, [activePageIndex]);

  useEffect(() => {
      const loadData = async () => {
          // SAFEGUARD: If characters array is empty, reset widget char
          if (!characters || characters.length === 0) {
              setWidgetChar(null);
              setLastMessage('No Character Connected');
              setAnniversaries([]);
              return;
          }

          const targetChar = characters.find(c => c.id === activeCharacterId) || characters[0];
          setWidgetChar(targetChar);

          try {
              const [msgs, annis] = await Promise.all([
                  DB.getMessagesByCharId(targetChar.id),
                  DB.getAllAnniversaries()
              ]);
              
              if (msgs.length > 0) {
                  const visibleMsgs = msgs.filter(m => m.role !== 'system');
                  if (visibleMsgs.length > 0) {
                      const last = visibleMsgs[visibleMsgs.length - 1];
                      const cleanContent = last.content.replace(/\[.*?\]/g, '').trim();
                      setLastMessage(cleanContent || (last.type === 'image' ? '[图片]' : '[消息]'));
                  } else {
                      setLastMessage(targetChar.description || "System Ready.");
                  }
              } else {
                  setLastMessage(targetChar.description || "System Ready.");
              }
              setAnniversaries(annis);
          } catch (e) {
              console.error(e);
          }
      };
      
      if (isDataLoaded) {
          loadData();
      }
  }, [activeCharacterId, lastMsgTimestamp, isDataLoaded, characters]); // Trigger on characters change

  // Schedule widget data loading (shown below SpecialMoments icon)
  const scheduleChar = useMemo(() => {
      if (!characters || characters.length === 0) return null;
      if (scheduleCharId) return characters.find(c => c.id === scheduleCharId) || characters[0];
      return characters.find(c => c.id === activeCharacterId) || characters[0];
  }, [characters, scheduleCharId, activeCharacterId]);
  const scheduleDateKey = useLocalDateKey(resolveCharTimeZone(scheduleChar));

  useEffect(() => {
      if (!scheduleChar || !isDataLoaded) return;
      getDailyScheduleForChar(scheduleChar).then(s => setScheduleData(s)).catch(() => {});
  }, [scheduleChar, isDataLoaded, scheduleDateKey]);

  // Restore scroll position BEFORE paint to avoid visible flash/slide
  useLayoutEffect(() => {
      const el = scrollContainerRef.current;
      if (el && _lastPageIndex > 0) {
          // Temporarily disable smooth scroll so jump is instant
          el.style.scrollBehavior = 'auto';
          el.scrollLeft = el.clientWidth * _lastPageIndex;
          // Re-enable on next frame
          requestAnimationFrame(() => { el.style.scrollBehavior = 'smooth'; });
      }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = () => {
      if (scrollContainerRef.current) {
          const width = scrollContainerRef.current.clientWidth;
          const scrollLeft = scrollContainerRef.current.scrollLeft;
          const index = Math.round(scrollLeft / width);
          setActivePageIndex(index);
          activePageIndexRef.current = index;
          _lastPageIndex = index; // Persist across remounts
      }
  };

  // --- Mouse Drag Handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
      if (!scrollContainerRef.current || layoutEditing) return;
      isDragging.current = true;
      dragMoved.current = 0;
      startX.current = e.pageX - scrollContainerRef.current.offsetLeft;
      scrollLeftRef.current = scrollContainerRef.current.scrollLeft;
      
      // Disable snap and smooth scroll for direct control
      scrollContainerRef.current.style.scrollBehavior = 'auto';
      scrollContainerRef.current.style.scrollSnapType = 'none';
      scrollContainerRef.current.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (layoutEditing || !isDragging.current || !scrollContainerRef.current) return;
      e.preventDefault();
      const x = e.pageX - scrollContainerRef.current.offsetLeft;
      const walk = (x - startX.current);
      scrollContainerRef.current.scrollLeft = scrollLeftRef.current - walk;
      
      dragMoved.current = Math.abs(x - (startX.current + scrollContainerRef.current.offsetLeft)); 
  };

  const handleMouseUp = () => {
      if (!isDragging.current || !scrollContainerRef.current) return;
      isDragging.current = false;
      
      // Restore styles
      scrollContainerRef.current.style.scrollBehavior = 'smooth';
      scrollContainerRef.current.style.scrollSnapType = 'x mandatory';
      scrollContainerRef.current.style.cursor = 'grab';
  };

  const handleMouseLeave = () => {
      if (isDragging.current) handleMouseUp();
  };

  const handleClickCapture = (e: React.MouseEvent) => {
      if (dragMoved.current > 5 || Date.now() < suppressLayoutClickUntil.current) {
          e.stopPropagation();
          e.preventDefault();
      }
  };

  const reorderByTarget = useCallback((kind: string, source: string, target: string) => {
      if (source === target) return;
      const reorder = <T extends string>(items: T[]) => {
          const from = items.indexOf(source as T);
          const to = items.indexOf(target as T);
          if (from < 0 || to < 0) return items;
          const next = [...items];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return next;
      };
      if (kind === 'app') {
          const next = reorder(launcherAppOrderRef.current);
          launcherAppOrderRef.current = next;
          setLauncherAppOrder(next);
      } else if (kind === 'dock') {
          const next = reorder(launcherDockOrderRef.current);
          launcherDockOrderRef.current = next;
          setLauncherDockOrder(next);
      } else if (kind === 'widget') {
          const next = reorder(pinwheelOrderRef.current) as Array<'music' | 'appsA' | 'appsB' | 'image'>;
          pinwheelOrderRef.current = next;
          setPinwheelOrder(next);
      }
  }, []);

  const moveAppToPage = useCallback((appId: string, pageIndex: number) => {
      const currentOrder = [...launcherAppOrderRef.current];
      const from = currentOrder.indexOf(appId);
      if (from < 0) return;
      const [moved] = currentOrder.splice(from, 1);

      // Screen 0 为负一屏；Screen 1 对应 appPages[0]，Screen 2 对应 appPages[1]...
      const appPageIndex = Math.max(0, pageIndex - 1);
      const targetPage = Math.max(0, Math.min(appPages.length - 1, appPageIndex));
      const targetApps = appPages[targetPage] || [];
      let insertIdx = currentOrder.length;
      if (targetApps.length > 0) {
          const lastApp = targetApps[targetApps.length - 1];
          const pos = currentOrder.indexOf(lastApp.id);
          insertIdx = pos >= 0 ? pos + 1 : currentOrder.length;
      } else {
          insertIdx = Math.min(currentOrder.length, targetPage * APPS_PER_PAGE);
      }
      currentOrder.splice(insertIdx, 0, moved);
      launcherAppOrderRef.current = currentOrder;
      setLauncherAppOrder(currentOrder);
  }, [appPages]);

  const clearLayoutPressTimer = useCallback(() => {
      if (layoutPressTimer.current) clearTimeout(layoutPressTimer.current);
      layoutPressTimer.current = null;
  }, []);

  const clearLayoutPageTurn = useCallback(() => {
      if (layoutPageTurnTimer.current) clearTimeout(layoutPageTurnTimer.current);
      layoutPageTurnTimer.current = null;
      layoutPageTurnDirection.current = 0;
  }, []);

  const activateLayoutDrag = useCallback((pointer: NonNullable<typeof layoutPointer.current>) => {
      if (pointer.ghost) return;
      const rect = pointer.element.getBoundingClientRect();
      const ghost = pointer.element.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('data-launcher-item');
      ghost.removeAttribute('data-launcher-kind');
      ghost.classList.remove('launcher-edit-item', 'launcher-drop-target');
      ghost.classList.add('launcher-drag-ghost');
      Object.assign(ghost.style, {
          position: 'fixed',
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          margin: '0',
          pointerEvents: 'none',
          zIndex: '9999',
          transform: 'scale(1.055)',
          transformOrigin: 'center',
          transition: 'none',
      });
      document.body.appendChild(ghost);
      pointer.ghost = ghost;
      pointer.grabOffsetX = pointer.x - rect.left;
      pointer.grabOffsetY = pointer.y - rect.top;
      pointer.element.classList.add('launcher-dragging');
      pointer.element.style.pointerEvents = 'none';
  }, []);

  const queueLayoutPageTurn = useCallback((direction: -1 | 1) => {
      if (layoutPageTurnDirection.current === direction && layoutPageTurnTimer.current) return;
      clearLayoutPageTurn();
      layoutPageTurnDirection.current = direction;
      const turn = () => {
          const pointer = layoutPointer.current;
          const scroller = scrollContainerRef.current;
          if (!pointer?.active || pointer.kind !== 'app' || !scroller || layoutPageTurnDirection.current !== direction) {
              clearLayoutPageTurn();
              return;
          }
          // App 放置从 Screen 1 开始（Screen 0 为负一屏组件专属画布）
          const minScreen = 1;
          const maxScreen = Math.max(minScreen, totalPages - 1);
          const nextPage = Math.max(minScreen, Math.min(maxScreen, activePageIndexRef.current + direction));
          if (nextPage === activePageIndexRef.current) {
              clearLayoutPageTurn();
              return;
          }
          pointer.targetElement?.classList.remove('launcher-drop-target');
          pointer.targetElement = undefined;
          pointer.lastTarget = undefined;
          activePageIndexRef.current = nextPage;
          setActivePageIndex(nextPage);
          _lastPageIndex = nextPage;
          scroller.scrollTo({ left: scroller.clientWidth * nextPage, behavior: 'smooth' });
          layoutPageTurnTimer.current = setTimeout(turn, 760);
      };
      layoutPageTurnTimer.current = setTimeout(turn, 560);
  }, [totalPages, clearLayoutPageTurn]);

  useEffect(() => () => {
      clearLayoutPressTimer();
      clearLayoutPageTurn();
      layoutPointer.current?.ghost?.remove();
  }, [clearLayoutPageTurn, clearLayoutPressTimer]);

  const handleLayoutPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const launcherRoot = e.currentTarget;
      const item = (e.target as HTMLElement).closest<HTMLElement>('[data-launcher-item]');
      if (!item) return;
      const key = item.dataset.launcherItem;
      const kind = item.dataset.launcherKind;
      if (!key || !kind) return;
      clearLayoutPressTimer();
      layoutPointer.current = { pointerId: e.pointerId, key, kind, x: e.clientX, y: e.clientY, active: layoutEditing, element: item, startPageIndex: activePageIndexRef.current };
      if (layoutEditing) {
          activateLayoutDrag(layoutPointer.current);
          launcherRoot.setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
      }
      layoutPressTimer.current = setTimeout(() => {
          if (!layoutPointer.current || layoutPointer.current.pointerId !== e.pointerId) return;
          layoutPointer.current.active = true;
          activateLayoutDrag(layoutPointer.current);
          launcherRoot.setPointerCapture(e.pointerId);
          isDragging.current = false;
          suppressLayoutClickUntil.current = Date.now() + 700;
          setLayoutEditing(true);
          trackEvent('进入桌面整理模式');
      }, 520);
  };

  const handleLayoutPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const pointer = layoutPointer.current;
      if (!pointer || pointer.pointerId !== e.pointerId) return;
      if (!pointer.active) {
          if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 9) {
              clearLayoutPressTimer();
              layoutPointer.current = null;
          }
          return;
      }
      e.preventDefault();
      if (pointer.ghost) {
          pointer.ghost.style.left = `${e.clientX - (pointer.grabOffsetX || 0)}px`;
          pointer.ghost.style.top = `${e.clientY - (pointer.grabOffsetY || 0)}px`;
      }
      const rootRect = e.currentTarget.getBoundingClientRect();
      if (pointer.kind === 'app' && e.clientX <= rootRect.left + 72) queueLayoutPageTurn(-1);
      else if (pointer.kind === 'app' && e.clientX >= rootRect.right - 72) queueLayoutPageTurn(1);
      else clearLayoutPageTurn();
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-launcher-item]');
      const targetKey = target?.dataset.launcherItem;
      const targetKind = target?.dataset.launcherKind;
      const validTarget = !!targetKey && targetKind === pointer.kind && targetKey !== pointer.key;
      if (!validTarget) {
          pointer.targetElement?.classList.remove('launcher-drop-target');
          pointer.targetElement = undefined;
          pointer.lastTarget = undefined;
          return;
      }
      if (target === pointer.targetElement) return;
      pointer.targetElement?.classList.remove('launcher-drop-target');
      target?.classList.add('launcher-drop-target');
      pointer.targetElement = target;
      pointer.lastTarget = targetKey;
  };

  const finishLayoutPointer = (e?: React.PointerEvent<HTMLDivElement>) => {
      const pointer = layoutPointer.current;
      if (e && pointer && pointer.pointerId !== e.pointerId) return;
      clearLayoutPressTimer();
      clearLayoutPageTurn();
      if (pointer?.active) {
          suppressLayoutClickUntil.current = Date.now() + 500;
          pointer.element.style.pointerEvents = '';
          pointer.element.classList.remove('launcher-dragging');
          pointer.ghost?.remove();
          pointer.targetElement?.classList.remove('launcher-drop-target');
          if (pointer.lastTarget) {
              reorderByTarget(pointer.kind, pointer.key, pointer.lastTarget);
          } else if (pointer.kind === 'app' && pointer.startPageIndex !== undefined && pointer.startPageIndex !== activePageIndexRef.current) {
              moveAppToPage(pointer.key, activePageIndexRef.current);
          }
          void updateTheme({
              launcherAppOrder: launcherAppOrderRef.current,
              launcherDockOrder: launcherDockOrderRef.current,
              launcherPinwheelOrder: pinwheelOrderRef.current,
          });
      }
      layoutPointer.current = null;
  };

  const finishLayoutEditing = () => {
      finishLayoutPointer();
      setLayoutEditing(false);
  };

  const contentColor = theme.contentColor || '#ffffff';
  const acnh = theme.skin === 'animalcrossing'; // 动森彩蛋：Dock 换奶油木质底
  const paper = theme.skin !== 'animalcrossing' && theme.skin !== 'mobilegame' && theme.skin !== 'tamagotchi' && isPaperWallpaper(theme.wallpaper);
  // 已迁移 App 外壳已收回到可见 viewport 底边，dock 仅需自留视觉间距，无需再 + safe-bottom
  // （否则会比 home 条上方多让 34px，dock 看起来悬空）。
  const launcherBottomInset = '1.25rem';
  
  const totalUnread = Object.values(unreadMessages).reduce((a, b) => a + b, 0);
  const widgetUnread = widgetChar && unreadMessages[widgetChar.id] ? unreadMessages[widgetChar.id] : 0;

  // 手游主题：整页换成二次元手游首页布局（独立组件自渲染），不走下面的默认/动森启动器。
  if (theme.skin === 'mobilegame') {
    return <MobileGameHome />;
  }

  // 电子宠物主题：桌面即养成机——角色真实小屋做舞台 + 四颗糖果实体键（独立组件自渲染）。
  if (theme.skin === 'tamagotchi') {
    return <TamagotchiHome />;
  }

  if (theme.skin === 'companion') {
    return (
      <React.Suspense fallback={<div className="h-full w-full bg-[#100d1c]" />}>
        <CompanionHome />
      </React.Suspense>
    );
  }

  const renderWidgetInstance = (widget: DesktopWidgetInstance, onDelete: () => void) => {
      if (widget.kind === 'calendar') {
          return (
              <CalendarWidget
                  key={widget.id}
                  contentColor={contentColor}
                  openApp={openApp}
                  anniversaries={anniversaries}
                  acnh={acnh}
                  paper={paper}
                  editing={layoutEditing}
                  onDelete={onDelete}
              />
          );
      }
      if (widget.kind === 'anniversary') {
          return (
              <AnniversaryWidget
                  key={widget.id}
                  contentColor={contentColor}
                  openApp={openApp}
                  anniversaries={anniversaries}
                  characters={characters}
                  acnh={acnh}
                  paper={paper}
                  editing={layoutEditing}
                  onDelete={onDelete}
              />
          );
      }
      if (widget.kind === 'memo') {
          return (
              <MemoHomeWidget
                  key={widget.id}
                  contentColor={contentColor}
                  openApp={openApp}
                  acnh={acnh}
                  paper={paper}
                  editing={layoutEditing}
                  size={widget.size}
                  onDelete={onDelete}
              />
          );
      }
      if (widget.kind === 'music') {
          return (
              <div key={widget.id} className="relative group w-full aspect-square max-w-[260px] mx-auto">
                  {layoutEditing && (
                      <button
                          onClick={(e) => { e.stopPropagation(); onDelete(); }}
                          className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-red-500 text-white font-black text-sm flex items-center justify-center shadow-lg active:scale-90 z-30 transition-transform hover:bg-red-600 cursor-pointer"
                          title="删除音乐组件"
                      >
                          <Minus size={14} weight="bold" />
                      </button>
                  )}
                  <NowPlayingSquareWidget contentColor={contentColor} />
              </div>
          );
      }
      if (widget.kind === 'image') {
          return (
              <div key={widget.id} className="relative group w-full aspect-square max-w-[260px] mx-auto">
                  {layoutEditing && (
                      <button
                          onClick={(e) => { e.stopPropagation(); onDelete(); }}
                          className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-red-500 text-white font-black text-sm flex items-center justify-center shadow-lg active:scale-90 z-30 transition-transform hover:bg-red-600 cursor-pointer"
                          title="删除相框"
                      >
                          <Minus size={14} weight="bold" />
                      </button>
                  )}
                  <DesktopSquareImage
                      image={theme.launcherWidgets?.['dsq']}
                      contentColor={contentColor}
                      onClick={() => { if (!layoutEditing) openApp(AppID.Appearance); }}
                      acnh={acnh}
                  />
              </div>
          );
      }
      return null;
  };

  return (
    <div
      className="h-full w-full flex flex-col relative z-10 overflow-hidden font-sans select-none"
      onPointerDown={handleLayoutPointerDown}
      onPointerMove={handleLayoutPointerMove}
      onPointerUp={finishLayoutPointer}
      onPointerCancel={finishLayoutPointer}
      onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest('[data-launcher-item]')) e.preventDefault();
      }}
    >
      <style>{`
        .launcher-edit-item {
          touch-action: none;
          cursor: grab;
          transition: transform 180ms cubic-bezier(.2,.75,.25,1), opacity 150ms ease, filter 150ms ease;
          will-change: transform;
        }
        .launcher-dragging {
          cursor: grabbing;
          opacity: .18;
        }
        .launcher-drag-ghost {
          opacity: .96;
          filter: drop-shadow(0 12px 14px rgba(75,65,54,.18));
          cursor: grabbing;
        }
        .launcher-drop-target {
          transform: scale(.93);
          opacity: .52;
          outline: 1.5px dashed rgba(75,65,54,.36);
          outline-offset: 5px;
          border-radius: 1.35rem;
        }
      `}</style>

      {layoutEditing && (
          <div className="absolute top-[calc(var(--safe-top)+0.65rem)] left-5 right-5 z-50 flex items-center justify-between pointer-events-none">
              <button
                onClick={() => {
                  setGalleryTarget(activePageIndex === 0 ? 'minus_one' : `page_${activePageIndex}`);
                  setGalleryInitialTab('widgets');
                  setGalleryOpen(true);
                }}
                className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold backdrop-blur-xl border shadow-lg active:scale-95 transition"
                style={{
                  background: paper ? 'rgba(224,221,215,0.75)' : acnh ? 'rgba(250,246,236,0.85)' : 'rgba(255,255,255,0.65)',
                  color: paper ? '#4a3e31' : acnh ? '#725d42' : '#1e293b',
                  borderColor: paper ? 'rgba(91,72,51,0.15)' : acnh ? '#e8e2d6' : 'rgba(255,255,255,0.5)',
                }}
              >
                <Plus size={14} weight="bold" />
                <span>添加组件 / 应用</span>
              </button>

              <button
                onClick={finishLayoutEditing}
                className="pointer-events-auto px-4 py-1.5 rounded-full text-xs font-bold shadow-lg active:scale-95 transition backdrop-blur-xl border"
                style={{
                  background: paper ? '#788369' : acnh ? '#19c8b9' : '#0f172a',
                  color: '#ffffff',
                  borderColor: 'rgba(255,255,255,0.2)',
                }}
              >
                完成
              </button>
          </div>
      )}
      
      {/* Visual Elements (Decorative Background - Static, low-cost gradients instead of blur) */}
      {/* 动森模式跳过：这层冷蓝光斑会污染奶油底 */}
      {!acnh && (
      <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full" style={{ background: paper ? 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, transparent 68%)' : 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }}></div>
          <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full" style={{ background: paper ? 'radial-gradient(circle, rgba(123,104,78,0.06) 0%, transparent 68%)' : 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)' }}></div>
      </div>
      )}

      {/* Scrollable Content Layer */}
      {/* UPDATE: Added snap-always to children to ensure one-page-at-a-time scrolling on mobile swipe */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClickCapture={handleClickCapture}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory no-scrollbar cursor-grab active:cursor-grabbing"
        style={{
            scrollBehavior: 'smooth',
            overscrollBehaviorX: 'contain',
            overscrollBehaviorY: 'none',
            touchAction: layoutEditing ? 'none' : 'pan-x pan-y',
            willChange: 'scroll-position',
            contain: 'layout paint',
            transform: 'translateZ(0)',
            WebkitOverflowScrolling: 'touch',
        }}
      >
          {/* Screen 0: 负一屏 (-1 屏 / 完整日程小组件页，与原版 WidgetsPage 完全一致) */}
          <div
            key="screen-minus-one"
            className="w-full flex-shrink-0 snap-center snap-always flex flex-col px-6 pt-24 pb-8 space-y-6 h-full overflow-y-auto no-scrollbar"
            style={{ contentVisibility: 'auto', contain: 'layout paint', transform: 'translateZ(0)' }}
          >
              {minusOneWidgets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center opacity-60">
                      <div className="w-14 h-14 rounded-3xl bg-white/10 flex items-center justify-center mb-3">
                          <Plus size={24} weight="bold" style={{ color: contentColor }} />
                      </div>
                      <div className="text-sm font-bold" style={{ color: contentColor }}>暂无小组件</div>
                      <div className="text-xs opacity-75 mt-1" style={{ color: contentColor }}>轻触下方按钮添加组件</div>
                      <button
                          onClick={() => { setGalleryTarget('minus_one'); setGalleryInitialTab('widgets'); setGalleryOpen(true); }}
                          className="mt-4 px-4 py-2 rounded-full font-bold text-xs bg-white/20 hover:bg-white/30 active:scale-95 transition"
                          style={{ color: contentColor }}
                      >
                          ＋ 添加小组件
                      </button>
                  </div>
              ) : (
                  minusOneWidgets.map((widget) => renderWidgetInstance(widget, () => handleRemoveMinusOneWidget(widget.id)))
              )}

              {minusOneWidgets.length > 0 && layoutEditing && (
                  <div className="pt-2 pb-6">
                      <button
                          onClick={() => { setGalleryTarget('minus_one'); setGalleryInitialTab('widgets'); setGalleryOpen(true); }}
                          className="w-full py-4 rounded-3xl border-2 border-dashed border-white/30 hover:border-white/50 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-xs font-bold active:scale-98 transition shadow-xs backdrop-blur-sm"
                          style={{ color: contentColor }}
                      >
                          <Plus size={16} weight="bold" />
                          <span>添加小组件</span>
                      </button>
                  </div>
              )}
          </div>

          {/* Render App Pages */}
          {appPages.map((pageApps, idx) => (
              <div
                key={idx}
                className="w-full flex-shrink-0 snap-center snap-always flex flex-col px-6 pt-12 pb-8 h-full"
                style={{ contentVisibility: 'auto', contain: 'layout paint', transform: 'translateZ(0)' }}
              >
                  {idx === 0 ? (
                      // Page 1 (original): Clock + Chat + 4x2 App Grid
                      <>
                        <DesktopClock />
                        <CharacterWidget
                            char={widgetChar}
                            unreadCount={widgetUnread}
                            lastMessage={lastMessage}
                            onClick={() => openApp(AppID.Chat)}
                            contentColor={contentColor}
                            paper={paper}
                        />
                        <div className="flex-1">
                            <AppGridPage
                                apps={pageApps}
                                openApp={openApp}
                                acnh={acnh}
                                editing={layoutEditing}
                                onRemoveApp={handleRemoveApp}
                            />
                        </div>
                      </>
                  ) : idx === 1 ? (
                      // Page 2: Schedule 4x2 widget on top + Pinwheel (Music / 2x2 icons / 2x2 icons / Image) below
                      <div className="flex-1 min-h-0 w-full flex flex-col gap-5 justify-center">
                          {scheduleChar && (
                              <ScheduleHomeWidget
                                  schedule={scheduleData}
                                  character={scheduleChar}
                                  contentColor={contentColor}
                                  onOpen={() => { setScheduleViewerOpen(true); trackEvent('打开角色日程面板'); }}
                                  acnh={acnh}
                                  paper={paper}
                              />
                          )}
                          <div className="grid grid-cols-2 gap-x-3 gap-y-5 w-full">
                              {pinwheelOrder.map(cell => (
                                  <div
                                      key={cell}
                                      data-launcher-item={cell}
                                      data-launcher-kind="widget"
                                      className={`aspect-square min-w-0 ${layoutEditing ? 'launcher-edit-item' : ''}`}
                                  >
                                      {cell === 'music' ? (
                                          <NowPlayingSquareWidget contentColor={contentColor} />
                                      ) : cell === 'appsA' ? (
                                          <AppQuadGrid apps={page2QuadA} openApp={openApp} editing={layoutEditing} onRemoveApp={handleRemoveApp} />
                                      ) : cell === 'appsB' ? (
                                          <AppQuadGrid apps={page2QuadB} openApp={openApp} editing={layoutEditing} onRemoveApp={handleRemoveApp} />
                                      ) : (
                                          <DesktopSquareImage
                                              image={theme.launcherWidgets?.['dsq']}
                                              contentColor={contentColor}
                                              onClick={() => { if (!layoutEditing) openApp(AppID.Appearance); }}
                                              acnh={acnh}
                                          />
                                      )}
                                  </div>
                              ))}
                          </div>
                      </div>
                  ) : (
                      // Page 3+: Apps + Custom Page Widgets + Desktop Grid Slots
                      (() => {
                          const customPageIdx = idx - 2;
                          const customPage = (theme.launcherCustomPages || [])[customPageIdx];
                          const pageWidgets = customPage?.widgets || [];
                          return (
                              <div className="pt-10 flex-1 flex flex-col relative space-y-4">
                                  {layoutEditing && idx >= 2 && (
                                      <button
                                          onClick={() => handleRemovePage(idx + 1)}
                                          className="absolute top-2 right-0 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/80 hover:bg-red-500 text-white flex items-center gap-1 shadow-md active:scale-95 transition z-30"
                                          title="移除此页"
                                      >
                                          <X size={12} weight="bold" />
                                          <span>移除此页</span>
                                      </button>
                                  )}
                                  {idx === 2 && (() => {
                                    const raw = theme.launcherWidgets || {};
                                    const w = { ...raw };
                                    const hasAny = w['tl'] || w['tr'] || w['wide'];
                                    const hasTopRow = w['tl'] || w['tr'];
                                    return (
                                      <>
                                        {hasAny && (
                                          <div className="mb-3 space-y-2 relative z-10">
                                            {hasTopRow && (
                                              <div className="flex gap-2">
                                                {['tl', 'tr'].map(key => w[key] ? (
                                                  <div key={key} className="flex-1 aspect-square rounded-2xl overflow-hidden shadow-md border border-white/20">
                                                    <TokenImg value={w[key]} className="w-full h-full object-cover" alt="" loading="lazy" />
                                                  </div>
                                                ) : <div key={key} className="flex-1"></div>)}
                                              </div>
                                            )}
                                            {w['wide'] && (
                                              <div className="w-full h-32 rounded-2xl overflow-hidden shadow-md border border-white/20">
                                                <TokenImg value={w['wide']} className="w-full h-full object-cover" alt="" loading="lazy" />
                                              </div>
                                            )}
                                          </div>
                                        )}
                                        {/* Free-positioned Desktop Decorations (z-20 to float above widgets z-10) */}
                                        {theme.desktopDecorations && theme.desktopDecorations.length > 0 && (
                                          <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
                                            {theme.desktopDecorations.map(deco => (
                                              <img
                                                key={deco.id}
                                                src={deco.content}
                                                alt=""
                                                loading="lazy"
                                                className="absolute w-16 h-16 object-contain select-none"
                                                style={{
                                                  left: `${deco.x}%`,
                                                  top: `${deco.y}%`,
                                                  transform: `translate(-50%, -50%) scale(${deco.scale}) rotate(${deco.rotation}deg)${deco.flip ? ' scaleX(-1)' : ''}`,
                                                  opacity: deco.opacity,
                                                  zIndex: deco.zIndex,
                                                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))',
                                                }}
                                              />
                                            ))}
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}

                                  {/* 渲染本页小组件 */}
                                  {pageWidgets.map(widget => renderWidgetInstance(widget, () => handleRemoveCustomPageWidget(customPageIdx, widget.id)))}

                                  {/* 渲染本页应用网格 */}
                                  <AppGridPage
                                      apps={pageApps}
                                      openApp={openApp}
                                      acnh={acnh}
                                      editing={layoutEditing}
                                      onRemoveApp={handleRemoveApp}
                                  />

                                  {/* 编辑模式下的真实手机桌面网格插槽 */}
                                  {layoutEditing && (
                                      <div className="space-y-4 pt-2">
                                          {/* 虚线 App 槽位（4个一排） */}
                                          <div className="grid grid-cols-4 gap-y-6 gap-x-2 place-items-center">
                                              {Array.from({ length: Math.max(0, 4 - (pageApps.length % 4 || 4)) || 4 }).map((_, slotIdx) => (
                                                  <button
                                                      key={`empty-app-slot-${slotIdx}`}
                                                      onClick={() => {
                                                          setGalleryTarget(`page_${idx + 1}`);
                                                          setGalleryInitialTab('apps');
                                                          setGalleryOpen(true);
                                                      }}
                                                      className="w-14 h-14 rounded-[1.35rem] border-2 border-dashed border-white/30 hover:border-white/50 bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition cursor-pointer"
                                                      style={{ color: contentColor }}
                                                      title="添加应用到此槽位"
                                                  >
                                                      <Plus size={16} weight="bold" />
                                                  </button>
                                              ))}
                                          </div>

                                          {/* 虚线小组件添加槽位 */}
                                          <button
                                              onClick={() => {
                                                  setGalleryTarget(`page_${idx + 1}`);
                                                  setGalleryInitialTab('widgets');
                                                  setGalleryOpen(true);
                                              }}
                                              className="w-full py-3.5 rounded-3xl border-2 border-dashed border-white/30 hover:border-white/50 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-xs font-bold active:scale-98 transition shadow-xs backdrop-blur-sm"
                                              style={{ color: contentColor }}
                                          >
                                              <Plus size={15} weight="bold" />
                                              <span>添加小组件到此页</span>
                                          </button>
                                      </div>
                                  )}

                                  <div className="flex-1"></div>

                                  {layoutEditing && idx === appPages.length - 1 && (
                                      <div className="flex justify-center pt-4 pb-2">
                                          <button
                                              onClick={handleAddPage}
                                              className="flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-xs bg-white/20 hover:bg-white/30 active:scale-95 transition shadow-md"
                                              style={{ color: contentColor }}
                                          >
                                              <Plus size={14} weight="bold" />
                                              <span>添加新页面</span>
                                          </button>
                                      </div>
                                  )}
                              </div>
                          );
                      })()
                  )}
              </div>
          ))}

      </div>

      {/* Page Indicators */}
      <div
          className="absolute left-0 w-full flex justify-center gap-1 pointer-events-none z-20"
          style={{ bottom: `calc(${launcherBottomInset} + 5.5rem)` }}
          aria-hidden="true"
      >
          {Array.from({ length: totalPages }).map((_, i) => (
              // 每个页码占固定 16px 槽位，只动画内部圆点。旧版直接动画 flex child 的宽度，
              // 快速划过多页时 WebKit 会一边改宽一边重算整行居中，几个过渡态就会挤成方块串。
              <div key={i} className="flex h-1.5 w-4 shrink-0 items-center justify-center">
                  <div
                    className={`h-1.5 rounded-full transform-gpu transition-[width,opacity] duration-300 ${activePageIndex === i ? 'w-4 opacity-100' : 'w-1.5 opacity-40'}`}
                    style={{ backgroundColor: contentColor }}
                  />
              </div>
          ))}
      </div>

      {/* Floating Dock - Updated Margin and Safe Area handling */}
      <div
           className="mt-auto flex justify-center w-full px-4 relative z-30"
           style={{ paddingBottom: launcherBottomInset }}
      >
           <div
             className={`rounded-[1.75rem] px-4 py-3 flex gap-3 sm:gap-6 items-center mx-auto max-w-full justify-between overflow-x-auto no-scrollbar transform-gpu ${acnh || paper ? '' : 'bg-white/30 border border-white/25 shadow-[0_8px_40px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.08)]'}`}
             style={acnh ? { background: 'transparent' } : paper ? {
               background: 'rgba(224,221,215,0.42)',
               border: '1px solid rgba(91,72,51,0.07)',
               boxShadow: '0 6px 18px rgba(91,72,51,0.065)',
             } : undefined}
           >
               {dockAppsConfig.map(app => (
                   <div key={app.id} data-launcher-item={app.id} data-launcher-kind="dock" className={`relative ${layoutEditing ? 'launcher-edit-item' : ''}`}>
                        {layoutEditing && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveApp(app.id);
                                }}
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white font-bold text-[10px] flex items-center justify-center shadow-md active:scale-90 z-30 transition-transform hover:bg-red-600 cursor-pointer"
                                title="移除应用"
                            >
                                <Minus size={10} weight="bold" />
                            </button>
                        )}
                        <AppIcon app={app} onClick={() => { if (!layoutEditing) openApp(app.id); }} variant="dock" size="md" />
                        {app.id === 'chat' && totalUnread > 0 && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center border-2 border-white/20 shadow-sm font-bold pointer-events-none animate-pop-in">
                                {totalUnread > 9 ? '9+' : totalUnread}
                            </div>
                        )}
                   </div>
               ))}
           </div>
      </div>

      <ScheduleFullscreenViewer
          open={scheduleViewerOpen}
          onClose={() => setScheduleViewerOpen(false)}
          characters={characters}
          activeCharId={scheduleChar?.id || null}
          onSwitchCharacter={(id) => setScheduleCharId(id)}
          schedule={scheduleData}
          activeCharacter={scheduleChar}
          contentColor={contentColor}
      />

      <WidgetGalleryModal
          isOpen={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          onSelectWidget={handleAddWidget}
          onSelectApp={handleRestoreApp}
          hiddenAppIds={theme.launcherHiddenApps || []}
          targetLabel={galleryTarget === 'minus_one' ? '到小组件页' : '到桌面'}
          initialTab={galleryInitialTab}
          acnh={acnh}
          paper={paper}
      />

    </div>
  );
};

export default Launcher;
