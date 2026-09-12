import React, { useMemo, useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { isPaperWallpaper, useOS } from '../context/OSContext';
import { INSTALLED_APPS, DOCK_APPS } from '../constants';
import { isDevDebugAvailable, subscribeDevDebugAvailability } from '../utils/devDebug';
import AppIcon from '../components/os/AppIcon';
import { DB } from '../utils/db';
import { CharacterProfile, Anniversary, AppID, DailySchedule, DesktopPage, PlacedItem, GridItemKind } from '../types';
import { ScheduleFullscreenViewer } from '../components/schedule/ScheduleHomeWidget';
import MobileGameHome from '../components/os/MobileGameHome';
import TamagotchiHome from '../components/os/TamagotchiHome';
import { DesktopGalleryModal } from '../components/os/DesktopGalleryModal';
import { QuadAppPickerModal } from '../components/os/QuadAppPickerModal';
import { ImagePickerModal } from '../components/os/ImagePickerModal';
import { DesktopClockWidget } from '../components/os/widgets/DesktopClockWidget';
import { CharacterCardWidget } from '../components/os/widgets/CharacterCardWidget';
import {
    renderGridItemContent, WIDGET_META, defaultSizeFor,
    type WidgetRenderContext,
} from '../components/os/desktopWidgetRegistry';
import {
    GRID_COLS, GRID_ROWS, rowsForScreen, DEFAULT_LOCKED_KINDS,
    migrateLegacyLauncher, collectPlacedAppIds, findHomeIndex,
    emptyPage, addItem, removeItem, moveItem, resizeItem, toggleLock, canPlace,
    tryDisplace, applyDisplacements,
} from '../utils/desktopGrid';
import { Plus, Minus, X, Lock, LockOpen, ArrowsOutSimple, House, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { getDailyScheduleForChar } from '../utils/dailySchedule';
import { useLocalDateKey } from '../hooks/useLocalDateKey';
import { useIsDesktopMode } from '../hooks/useDeviceMode';
import { resolveCharTimeZone } from '../utils/timezone';
import { trackEvent } from '../utils/analytics';

const CompanionHome = React.lazy(() => import('../components/os/CompanionHome'));

// --- 自由网格桌面 ---
// 每页 = GRID_COLS × GRID_ROWS 格子矩阵；App 与小组件都是 PlacedItem，按 (x,y,w,h) 摆，
// 允许任意留空。数据模型 / 纯逻辑见 utils/desktopGrid.ts，组件渲染见 desktopWidgetRegistry。
// DesktopClock / CharacterWidget / DesktopSquareImage 已抽到 components/os/widgets/。

const PAGE_PAD_X = 24; // px-6
const GRID_COL_GAP = 8;  // gap-x-2
const GRID_ROW_GAP = 12; // 紧凑行距(12px)，对齐手机视口高度，防纵向撑满滚动

// 所有页面统一用这份公式算格子高度：横向 gap(GRID_COL_GAP) 和纵向 gap(GRID_ROW_GAP)
// 不相等，如果格子高度直接照抄 cellPx，跨 2 格拼出来的组件（四宫格、相框、音乐组件……）
// 就不是正方形。反推出 cellH，让"2 格 + 1 个 gap"横竖拼出来的总长度相等，2×2 组件
// 无论放在哪一页都严格是正方形。以前这份公式只套在"风车页"身上，其它页面直接用
// cellPx 当高度，导致同款 2×2 组件挪到别的页面就不方了——现在统一，不再分页面特判。
const cellHeightFor = (cellPx: number) => Math.floor((2 * cellPx + GRID_COL_GAP - GRID_ROW_GAP) / 2);

// 长按进整理态阈值：原来 520ms 偏短，正常单击稍慢一点就容易被判成长按，
// 点开 App 的点击被吞掉却毫无征兆。调到 620ms 拉开与单击的安全距离；
// WARN_MS 是提前量，从这个时刻起图标会轻微下沉变暗作为"再按住就要进编辑了"
// 的预警，用户看到就能主动松手取消，不会莫名其妙地打不开 App。
const LONGPRESS_MS = 620;
const LONGPRESS_WARN_MS = 340;

const canResize = (kind: GridItemKind) => {
  const m = WIDGET_META[kind];
  return kind !== 'app' && (m.maxW > m.minW || m.maxH > m.minH);
};

interface DesktopPageViewProps {
  page: DesktopPage;
  pageIndex: number;
  gridWidthPx: number;
  cellPx: number;
  layoutEditing: boolean;
  widgetCtx: WidgetRenderContext;
  onItemPointerDown: (e: React.PointerEvent, item: PlacedItem, pageIndex: number) => void;
  handleToggleLock: (pageIndex: number, itemId: string) => void;
  handleDeleteItem: (pageIndex: number, itemId: string) => void;
  onResizePointerDown: (e: React.PointerEvent, item: PlacedItem, pageIndex: number) => void;
  dragPreview: null | {
    pageIndex: number;
    x: number;
    y: number;
    w: number;
    h: number;
    ok: boolean;
    dropToQuad?: {
      quadId: string;
      pageIndex: number;
      slotIndex: number;
    };
    displacements?: Map<string, { x: number; y: number }>;
  };
  registerPageGridRef: (pageIndex: number, el: HTMLDivElement | null) => void;
  widgetChar: CharacterProfile | null;
  widgetUnread: number;
  lastMessage: string;
  onOpenChat: () => void;
  contentColor: string;
  paper: boolean;
}

const DesktopPageView: React.FC<DesktopPageViewProps> = React.memo(({
  page,
  pageIndex,
  gridWidthPx,
  cellPx,
  layoutEditing,
  widgetCtx,
  onItemPointerDown,
  handleToggleLock,
  handleDeleteItem,
  onResizePointerDown,
  dragPreview,
  registerPageGridRef,
  widgetChar,
  widgetUnread,
  lastMessage,
  onOpenChat,
  contentColor,
  paper,
}) => {
  const rows = rowsForScreen(pageIndex, page);
  // 主屏表头（时钟+角色卡）认哪一页不再靠"是不是第 1 页"这个下标——
  // 主屏可以被用户拖到左右任意位置，靠 layout:'home' 标记跟着走。
  const isHomePage = page.layout === 'home';
  // 风车页同理靠标记认，不再顺带认"不管什么页只要摆在下标 2 就算风车页"——
  // 主屏都能被挪走了，死认下标更站不住脚。
  const isWindmillPage = page.layout === 'windmill';
  // rowGap / cellH 不再按页面类型特判，所有页面统一走同一份正方形补偿公式
  // （这条是真 bug 修复，保留：不然 2×2 组件挪到非风车页就不方了）。
  const rowGap = GRID_ROW_GAP;
  const cellH = cellHeightFor(cellPx);
  // 内边距 / 是否居中：对照上游原版发现，原版只有风车页这一种"更小顶部留白 +
  // 整体居中"的松弛观感；主屏和纯图标页（自定义页 / -1 屏）原本就是贴顶对齐、
  // 彼此风格一致的——不是历史遗留的不统一，是设计上本来就该分两种。之前误把
  // 风车页的观感套到所有页面头上，这里改回来：主屏和图标页一组，风车页单独一组。
  const pagePadClass = isWindmillPage ? 'pt-2 pb-4' : 'pt-10 pb-8';

  return (
    <div
      className={`w-full flex-shrink-0 snap-center snap-always h-full flex flex-col ${pagePadClass}`}
      // 之前给每一页都加了 translateZ(0) + contain:'layout paint'，想法是"每页独立合成层"，
      // 但这个项目所有页面是一直全部挂载在 DOM 里的（不管可不可见），页数一多，
      // 就变成同时存在一大堆独立合成层，反而更费——而且这个仓库自己的提交历史里
      // 就有一条"移除 contentVisibility 避免滑入掉帧"，之前顺手把 translateZ/contain:paint
      // 也降回了 contain:'layout'，大概率不是误删，是真的测出来有问题。先退回去验证。
      // scrollSnapStop:'always' 会强制浏览器碰到下一个吸附点就先停下来，能防止用力
      // 甩动时跳过好几页，但代价是每次甩动都被"摁停"，手感会发软、损失了原本靠惯性
      // 顺畅翻页的跟手感——测出来这个副作用比较明显，先撤回默认的 'normal'。
      style={{ contain: 'layout' }}
    >
      {isHomePage ? (
        <>
          {/* 主屏表头：时钟 + 角色卡，原生流式、贴顶、不可删。宽度与下方网格对齐居中。
              贴顶对齐，不居中——跟图标页是一组，风车页才是单独居中的那个。 */}
          <div className="shrink-0 w-full mx-auto px-6" style={{ maxWidth: `${gridWidthPx + 48}px` }}>
            <DesktopClockWidget />
            <CharacterCardWidget
              char={widgetChar}
              unreadCount={widgetUnread}
              lastMessage={lastMessage}
              onClick={onOpenChat}
              contentColor={contentColor}
              paper={paper}
            />
          </div>
          <div
            className="flex-1 min-h-0 overflow-hidden px-6 flex flex-col"
          >
            <div
              ref={el => registerPageGridRef(pageIndex, el)}
              className="relative grid mx-auto"
              style={{
                columnGap: `${GRID_COL_GAP}px`,
                rowGap: `${rowGap}px`,
                width: `${gridWidthPx}px`,
                gridTemplateColumns: `repeat(${GRID_COLS}, ${cellPx}px)`,
                gridTemplateRows: `repeat(${rows}, ${cellH}px)`,
                gridAutoRows: `${cellH}px`,
              }}
            >
              {page.items.map(item => {
                const content = renderGridItemContent(item, widgetCtx);
                if (content == null) return null;
                const draggable = layoutEditing && !item.locked;
                const displacedPos = (dragPreview && dragPreview.pageIndex === pageIndex && dragPreview.displacements)
                  ? dragPreview.displacements.get(item.id)
                  : undefined;
                const deltaX = displacedPos ? (displacedPos.x - item.x) * (cellPx + GRID_COL_GAP) : 0;
                const deltaY = displacedPos ? (displacedPos.y - item.y) * (cellH + rowGap) : 0;
                const isDisplaced = displacedPos !== undefined && (deltaX !== 0 || deltaY !== 0);

                return (
                  <div
                    key={item.id}
                    data-grid-item={item.id}
                    data-grid-kind={item.kind}
                    className={`relative min-w-0 min-h-0 ${item.kind === 'app' ? 'flex items-center justify-center' : ''}`}
                    style={{
                      gridColumn: `${item.x + 1} / span ${item.w}`,
                      gridRow: `${item.y + 1} / span ${item.h}`,
                      touchAction: layoutEditing ? 'none' : undefined,
                      transform: isDisplaced ? `translate3d(${deltaX}px, ${deltaY}px, 0)` : 'translate3d(0px, 0px, 0)',
                      transition: layoutEditing ? 'transform 260ms cubic-bezier(0.2, 0.9, 0.3, 1.15)' : undefined,
                      zIndex: isDisplaced ? 15 : undefined,
                      willChange: layoutEditing ? 'transform' : undefined,
                    }}
                    onPointerDown={(e) => onItemPointerDown(e, item, pageIndex)}
                    onClickCapture={(e) => {
                      if (layoutEditing && item.kind === 'app') {
                        if (!(e.target as HTMLElement).closest('[data-grid-action]')) {
                          e.stopPropagation();
                          e.preventDefault();
                        }
                      }
                    }}
                  >
                    <div className={`w-full h-full overflow-visible ${item.kind === 'app' ? 'flex items-center justify-center' : ''} ${draggable ? 'launcher-edit-wobble' : ''}`}>
                      {content}
                    </div>

                    {layoutEditing && (
                      item.locked ? (
                        <button
                          data-grid-action="lock"
                          onClick={(e) => { e.stopPropagation(); handleToggleLock(pageIndex, item.id); }}
                          className="absolute top-1 left-1 w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center shadow-md active:scale-90 z-30"
                          title="已锁定 · 点击解锁"
                        >
                          <Lock size={13} weight="fill" />
                        </button>
                      ) : (
                        <>
                          <button
                            data-grid-action="delete"
                            onClick={(e) => { e.stopPropagation(); handleDeleteItem(pageIndex, item.id); }}
                            className="absolute top-1 right-1 z-30 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md active:scale-90 hover:bg-red-600 transition cursor-pointer before:absolute before:-inset-2 before:content-['']"
                            title="移除"
                          >
                            <X size={11} weight="bold" />
                          </button>
                          {WIDGET_META[item.kind].defaultLocked && (
                            <button
                              data-grid-action="lock"
                              onClick={(e) => { e.stopPropagation(); handleToggleLock(pageIndex, item.id); }}
                              className="absolute top-1 left-1 w-6 h-6 rounded-full bg-slate-500 text-white flex items-center justify-center shadow-md active:scale-90 z-30 before:absolute before:-inset-2 before:content-['']"
                              title="锁定"
                            >
                              <LockOpen size={11} weight="fill" />
                            </button>
                          )}
                          {canResize(item.kind) && (
                            <button
                              data-grid-action="resize"
                              onPointerDown={(e) => onResizePointerDown(e, item, pageIndex)}
                              className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-white/90 text-slate-700 flex items-center justify-center shadow-md active:scale-90 z-30 cursor-nwse-resize"
                              title="拖动改大小"
                            >
                              <ArrowsOutSimple size={13} weight="bold" />
                            </button>
                          )}
                        </>
                      )
                    )}
                  </div>
                );
              })}

              {dragPreview && dragPreview.pageIndex === pageIndex && (
                dragPreview.dropToQuad ? (
                  <div
                    className="pointer-events-none rounded-3xl border-2 border-dashed z-20 transition-all duration-150 flex items-center justify-center animate-pulse"
                    style={{
                      gridColumn: `${dragPreview.x + 1} / span ${dragPreview.w}`,
                      gridRow: `${dragPreview.y + 1} / span ${dragPreview.h}`,
                      borderColor: 'rgba(45, 212, 191, 0.95)',
                      background: 'rgba(45, 212, 191, 0.16)',
                      boxShadow: '0 0 24px rgba(45, 212, 191, 0.35)',
                    }}
                  >
                    <div className="px-3 py-1 rounded-full bg-teal-500 text-white text-[11px] font-bold shadow-lg tracking-wider flex items-center gap-1">
                      <Plus size={12} weight="bold" />
                      <span>放入四宫格</span>
                    </div>
                  </div>
                ) : (
                  <div
                    className="pointer-events-none rounded-2xl border-2 border-dashed z-20 launcher-drag-placeholder"
                    style={{
                      gridColumn: `${dragPreview.x + 1} / span ${dragPreview.w}`,
                      gridRow: `${dragPreview.y + 1} / span ${dragPreview.h}`,
                      borderColor: dragPreview.ok ? 'rgba(255,255,255,0.7)' : 'rgba(239,68,68,0.8)',
                      background: dragPreview.ok ? 'rgba(255,255,255,0.12)' : 'rgba(239,68,68,0.12)',
                    }}
                  />
                )
              )}
            </div>
          </div>
        </>
      ) : (
        <div
          className="flex-1 min-h-0 overflow-hidden px-6 flex flex-col"
        >
          <div
            ref={el => registerPageGridRef(pageIndex, el)}
            className={`relative grid mx-auto ${isWindmillPage ? 'my-auto' : ''}`}
            style={{
              columnGap: `${GRID_COL_GAP}px`,
              rowGap: `${rowGap}px`,
              width: `${gridWidthPx}px`,
              gridTemplateColumns: `repeat(${GRID_COLS}, ${cellPx}px)`,
              gridTemplateRows: `repeat(${rows}, ${cellH}px)`,
              gridAutoRows: `${cellH}px`,
            }}
          >
            {page.items.map(item => {
              const content = renderGridItemContent(item, widgetCtx);
              if (content == null) return null;
              const draggable = layoutEditing && !item.locked;
              const displacedPos = (dragPreview && dragPreview.pageIndex === pageIndex && dragPreview.displacements)
                ? dragPreview.displacements.get(item.id)
                : undefined;
              const deltaX = displacedPos ? (displacedPos.x - item.x) * (cellPx + GRID_COL_GAP) : 0;
              const deltaY = displacedPos ? (displacedPos.y - item.y) * (cellH + rowGap) : 0;
              const isDisplaced = displacedPos !== undefined && (deltaX !== 0 || deltaY !== 0);

              return (
                <div
                  key={item.id}
                  data-grid-item={item.id}
                  data-grid-kind={item.kind}
                  className={`relative min-w-0 min-h-0 ${item.kind === 'app' ? 'flex items-center justify-center' : ''}`}
                  style={{
                    gridColumn: `${item.x + 1} / span ${item.w}`,
                    gridRow: `${item.y + 1} / span ${item.h}`,
                    touchAction: layoutEditing ? 'none' : undefined,
                    transform: isDisplaced ? `translate3d(${deltaX}px, ${deltaY}px, 0)` : 'translate3d(0px, 0px, 0)',
                    transition: layoutEditing ? 'transform 260ms cubic-bezier(0.2, 0.9, 0.3, 1.15)' : undefined,
                    zIndex: isDisplaced ? 15 : undefined,
                    willChange: layoutEditing ? 'transform' : undefined,
                  }}
                  onPointerDown={(e) => onItemPointerDown(e, item, pageIndex)}
                  onClickCapture={(e) => {
                    if (layoutEditing && item.kind === 'app') {
                      if (!(e.target as HTMLElement).closest('[data-grid-action]')) {
                        e.stopPropagation();
                        e.preventDefault();
                      }
                    }
                  }}
                >
                  <div className={`w-full h-full overflow-visible ${item.kind === 'app' ? 'flex items-center justify-center' : ''} ${draggable ? 'launcher-edit-wobble' : ''}`}>
                    {content}
                  </div>

                  {layoutEditing && (
                    item.locked ? (
                      <button
                        data-grid-action="lock"
                        onClick={(e) => { e.stopPropagation(); handleToggleLock(pageIndex, item.id); }}
                        className="absolute top-1 left-1 w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center shadow-md active:scale-90 z-30"
                        title="已锁定 · 点击解锁"
                      >
                        <Lock size={13} weight="fill" />
                      </button>
                    ) : (
                      <>
                        <button
                          data-grid-action="delete"
                          onClick={(e) => { e.stopPropagation(); handleDeleteItem(pageIndex, item.id); }}
                          className="absolute top-1 right-1 z-30 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md active:scale-90 hover:bg-red-600 transition cursor-pointer before:absolute before:-inset-2 before:content-['']"
                          title="移除"
                        >
                          <X size={11} weight="bold" />
                        </button>
                        {WIDGET_META[item.kind].defaultLocked && (
                          <button
                            data-grid-action="lock"
                            onClick={(e) => { e.stopPropagation(); handleToggleLock(pageIndex, item.id); }}
                            className="absolute top-1 left-1 w-6 h-6 rounded-full bg-slate-500 text-white flex items-center justify-center shadow-md active:scale-90 z-30 before:absolute before:-inset-2 before:content-['']"
                            title="锁定"
                          >
                            <LockOpen size={11} weight="fill" />
                          </button>
                        )}
                        {canResize(item.kind) && (
                          <button
                            data-grid-action="resize"
                            onPointerDown={(e) => onResizePointerDown(e, item, pageIndex)}
                            className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-white/90 text-slate-700 flex items-center justify-center shadow-md active:scale-90 z-30 cursor-nwse-resize"
                            title="拖动改大小"
                          >
                            <ArrowsOutSimple size={13} weight="bold" />
                          </button>
                        )}
                      </>
                    )
                  )}
                </div>
              );
            })}

            {dragPreview && dragPreview.pageIndex === pageIndex && (
              dragPreview.dropToQuad ? (
                <div
                  className="pointer-events-none rounded-3xl border-2 border-dashed z-20 transition-all duration-150 flex items-center justify-center animate-pulse"
                  style={{
                    gridColumn: `${dragPreview.x + 1} / span ${dragPreview.w}`,
                    gridRow: `${dragPreview.y + 1} / span ${dragPreview.h}`,
                    borderColor: 'rgba(45, 212, 191, 0.95)',
                    background: 'rgba(45, 212, 191, 0.16)',
                    boxShadow: '0 0 24px rgba(45, 212, 191, 0.35)',
                  }}
                >
                  <div className="px-3 py-1 rounded-full bg-teal-500 text-white text-[11px] font-bold shadow-lg tracking-wider flex items-center gap-1">
                    <Plus size={12} weight="bold" />
                    <span>放入四宫格</span>
                  </div>
                </div>
              ) : (
                <div
                  className="pointer-events-none rounded-2xl border-2 border-dashed z-20 launcher-drag-placeholder"
                  style={{
                    gridColumn: `${dragPreview.x + 1} / span ${dragPreview.w}`,
                    gridRow: `${dragPreview.y + 1} / span ${dragPreview.h}`,
                    borderColor: dragPreview.ok ? 'rgba(255,255,255,0.7)' : 'rgba(239,68,68,0.8)',
                    background: dragPreview.ok ? 'rgba(255,255,255,0.12)' : 'rgba(239,68,68,0.12)',
                  }}
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
});

interface PageIndicatorsProps {
  totalPages: number;
  activePageIndex: number;
  contentColor: string;
  bottomInset: string;
  onJumpToPage?: (index: number) => void;
}

// 移动端保持原本纤细无交互的点状条；电脑模式（见 useIsDesktopMode）静默升级成
// 悬浮毛玻璃胶囊，放大点位与点击热区，点击任意点平滑跳页。见
// desktop-adaptation-plan.md 模块 2。
const PageIndicators: React.FC<PageIndicatorsProps> = React.memo(({
  totalPages,
  activePageIndex,
  contentColor,
  bottomInset,
  onJumpToPage,
}) => {
  const isDesktop = useIsDesktopMode();

  return (
    <div
      className={`absolute left-0 w-full flex justify-center z-20 ${isDesktop ? 'pointer-events-none' : 'gap-1 pointer-events-none'}`}
      style={{ bottom: `calc(${bottomInset} + 5.5rem)` }}
      aria-hidden={!isDesktop}
    >
      <div
        className={isDesktop
          ? 'flex items-center gap-0.5 rounded-full border border-white/20 bg-black/10 px-3.5 py-1.5 shadow-sm backdrop-blur-md pointer-events-auto dark:bg-white/10'
          : 'flex items-center gap-1'}
      >
        {Array.from({ length: totalPages }).map((_, i) => (
          <button
            key={i}
            type="button"
            tabIndex={isDesktop ? 0 : -1}
            aria-label={isDesktop ? `跳转到第 ${i + 1} 页` : undefined}
            onClick={isDesktop ? (e) => { e.stopPropagation(); onJumpToPage?.(i); } : undefined}
            className={`group flex shrink-0 items-center justify-center ${isDesktop ? 'h-6 w-6 cursor-pointer' : 'h-1.5 w-4'}`}
          >
            <span
              className={`rounded-full transform-gpu transition-[width,opacity,transform] duration-300 ${
                isDesktop
                  ? `h-2.5 group-hover:scale-125 ${activePageIndex === i ? 'w-7 opacity-100' : 'w-2.5 opacity-50 group-hover:opacity-80'}`
                  : `h-1.5 ${activePageIndex === i ? 'w-4 opacity-100' : 'w-1.5 opacity-40'}`
              }`}
              style={{ backgroundColor: contentColor }}
            />
          </button>
        ))}
      </div>
    </div>
  );
});

interface LauncherDockProps {
  dockApps: typeof INSTALLED_APPS;
  totalUnread: number;
  openApp: (id: AppID) => void;
  acnh: boolean;
  paper: boolean;
  bottomInset: string;
  layoutEditing?: boolean;
}

const LauncherDock: React.FC<LauncherDockProps> = React.memo(({
  dockApps,
  totalUnread,
  openApp,
  acnh,
  paper,
  bottomInset,
  layoutEditing = false,
}) => (
  <div className="mt-auto flex justify-center w-full px-4 relative z-30" style={{ paddingBottom: bottomInset }}>
    <div
      onClickCapture={(e) => {
        if (layoutEditing) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      className={`rounded-[1.75rem] px-4 py-3 flex gap-3 sm:gap-6 items-center mx-auto max-w-full justify-between overflow-x-auto no-scrollbar transform-gpu ${acnh || paper ? '' : 'bg-white/30 border border-white/25 shadow-[0_8px_40px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.08)]'}`}
      style={acnh ? { background: 'transparent' } : paper ? { background: 'rgba(224,221,215,0.42)', border: '1px solid rgba(91,72,51,0.07)', boxShadow: '0 6px 18px rgba(91,72,51,0.065)' } : undefined}
    >
      {dockApps.map(app => (
        <div key={app.id} className="relative">
          <AppIcon
            app={app}
            onClick={() => {
              if (!layoutEditing) openApp(app.id);
            }}
            disabled={layoutEditing}
            variant="dock"
            size="md"
          />
          {app.id === 'chat' && totalUnread > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center border-2 border-white/20 shadow-sm font-bold pointer-events-none animate-pop-in">
              {totalUnread > 9 ? '9+' : totalUnread}
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
));

// 跨 remount 记住停在第几页（从 App 返回时用）。-1 = 本次会话首次挂载，还没定位过 →
// 用 theme.launcherStartPageId 定起始页（未设置 = 时钟那页 pages[1]）。
let _lastPageIndex = -1;

const Launcher: React.FC = () => {
  const { openApp, characters, activeCharacterId, theme, updateTheme, lastMsgTimestamp, isDataLoaded, unreadMessages } = useOS();
  const isDesktop = useIsDesktopMode();

  // 小组件数据（本地缓存，避免 context 抖动）
  const [widgetChar, setWidgetChar] = useState<CharacterProfile | null>(null);
  const [lastMessage, setLastMessage] = useState<string>('');
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
  const [scheduleData, setScheduleData] = useState<DailySchedule | null>(null);
  const [scheduleCharId, setScheduleCharId] = useState<string | null>(null);
  const [scheduleViewerOpen, setScheduleViewerOpen] = useState(false);

  const [layoutEditing, setLayoutEditing] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryInitialTab, setGalleryInitialTab] = useState<'widgets' | 'apps'>('widgets');
  // 点 ◀+/+▶ 弹出的小菜单：选"普通页"还是"风车页"，为 null 时菜单关闭。
  const [addPageMenu, setAddPageMenu] = useState<null | 'left' | 'right'>(null);

  const [devDebugVisible, setDevDebugVisible] = useState(() => isDevDebugAvailable());
  useEffect(() => subscribeDevDebugAvailability(setDevDebugVisible), []);

  // 初始页在下面的 useLayoutEffect 里定位（要用到已迁移的 pages + startPageId）。这里先给个占位。
  const [activePageIndex, setActivePageIndex] = useState(() => {
    if (_lastPageIndex >= 0) return _lastPageIndex;
    if (theme.launcherStartPageId && theme.launcherPages) {
      const idx = theme.launcherPages.findIndex(p => p.id === theme.launcherStartPageId);
      if (idx >= 0) return idx;
    }
    return 1;
  });
  const activePageIndexRef = useRef(activePageIndex);
  useEffect(() => { activePageIndexRef.current = activePageIndex; }, [activePageIndex]);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const initialScrollDoneRef = useRef(false);

  const handleSetStartPage = useCallback((pageId: string) => {
    const cur = theme.launcherStartPageId;
    void updateTheme({ launcherStartPageId: cur === pageId ? undefined : pageId });
  }, [theme.launcherStartPageId, updateTheme]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageGridRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 格子边长只按宽度算，不管高度——所有页用同一个 cellPx，处处正方形。
  // 行数按页不同（rowsForScreen：首页矮、其它页高），但格子本身大小不变，
  // 格子边长只按宽度算，处处正方形。
  // 间距横 gap-x-2(8px) / 竖向 12px，网格紧凑精致，手机屏幕一屏完整放下。
  const [cellPx, setCellPx] = useState(78);
  useLayoutEffect(() => {
    const measure = () => {
      const raw = scrollContainerRef.current?.clientWidth || 380;
      // 电脑模式：允许桌面网格明显变宽变大，不再收窄成手机宽度——用户反馈过窄屏两侧
      // 大片空白不好看。仍然设上限，避免超宽屏下格子被拉得过于夸张；GRID_COLS 依旧
      // 是 4，不改列数（改列数要连带迁移所有已保存布局的坐标系，风险高得多），只是
      // 让同样 4 列的格子本身更大。见 desktop-adaptation-plan.md 模块 4-C 的调整记录。
      const widthCap = isDesktop ? 46 * 16 : 27 * 16; // 手机 27rem(432px)，桌面 46rem(736px)
      const cellCap = isDesktop ? 108 : 82;
      const w = Math.min(raw, widthCap);
      const inner = w - PAGE_PAD_X * 2 - GRID_COL_GAP * (GRID_COLS - 1);
      // 下限 72：自适应填满横向宽度，两侧间距对称饱满，避免小卡片被挤得过小
      const size = Math.max(72, Math.min(cellCap, Math.floor(inner / GRID_COLS)));
      setCellPx(prev => (prev === size ? prev : size));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isDesktop]);
  const gridWidthPx = GRID_COLS * cellPx + (GRID_COLS - 1) * GRID_COL_GAP;

  // ───────── 页面数据 ─────────
  const validAppIds = useMemo(
    () => new Set(
      INSTALLED_APPS
        .filter(a => !DOCK_APPS.includes(a.id) && (a.id !== AppID.CharCreatorDev || devDebugVisible))
        .map(a => a.id),
    ),
    [devDebugVisible],
  );

  const migratedPages = useMemo(() => {
    // 防御性兜底：旧数据里任何意外形状都不该把整个桌面渲染树带崩（白屏 / 打不开）。
    // 崩了就退回一页空桌面——好歹能进桌面，不至于完全打不开；「恢复默认桌面布局」
    // （外观页）能进一步接上全部已装 App。
    try {
      return migrateLegacyLauncher(theme, validAppIds);
    } catch (e) {
      console.error('[Launcher] migrateLegacyLauncher 崩了，退回空桌面：', e);
      return [emptyPage(), emptyPage()];
    }
    // 依赖旧字段：迁移只在没有 launcherPages 时才真正跑，有了就直接透传
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.launcherPages, theme.launcherAppOrder, theme.launcherMinusOneApps,
     theme.launcherMinusOneWidgets, theme.launcherCustomPages, theme.launcherWidgets, validAppIds]);

  const [pages, setPages] = useState<DesktopPage[]>(migratedPages);
  const pagesRef = useRef(pages);
  useEffect(() => { pagesRef.current = pages; }, [pages]);

  // 不在编辑态时跟随 theme（备份导入 / 另一个标签页改了）
  useEffect(() => {
    if (layoutEditing) return;
    setPages(migratedPages);
    pagesRef.current = migratedPages;
  }, [migratedPages, layoutEditing]);

  // 首次迁移落库一次（之后 theme.launcherPages 就存在了）
  const migrationPersisted = useRef(false);
  useEffect(() => {
    if (migrationPersisted.current || !isDataLoaded) return;
    if (theme.launcherPages && theme.launcherPages.length) { migrationPersisted.current = true; return; }
    migrationPersisted.current = true;
    void updateTheme({ launcherPages: migratedPages });
  }, [isDataLoaded, theme.launcherPages, migratedPages, updateTheme]);

  const commitPages = useCallback((next: DesktopPage[]) => {
    pagesRef.current = next;
    setPages(next);
    void updateTheme({ launcherPages: next });
  }, [updateTheme]);

  const replacePage = useCallback((pageIndex: number, nextPage: DesktopPage) => {
    const next = pagesRef.current.map((p, i) => (i === pageIndex ? nextPage : p));
    commitPages(next);
  }, [commitPages]);

  const placedAppIds = useMemo(() => collectPlacedAppIds(pages), [pages]);
  const existingKinds = useMemo(() => {
    const s = new Set<GridItemKind>();
    for (const p of pages) for (const it of p.items) s.add(it.kind);
    return s;
  }, [pages]);

  const totalPages = pages.length;

  // ───────── 数据加载 ─────────
  useEffect(() => {
    const loadData = async () => {
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
          DB.getAllAnniversaries(),
        ]);
        if (msgs.length > 0) {
          const visibleMsgs = msgs.filter(m => m.role !== 'system');
          if (visibleMsgs.length > 0) {
            const last = visibleMsgs[visibleMsgs.length - 1];
            const cleanContent = last.content.replace(/\[.*?\]/g, '').trim();
            setLastMessage(cleanContent || (last.type === 'image' ? '[图片]' : '[消息]'));
          } else {
            setLastMessage(targetChar.description || 'System Ready.');
          }
        } else {
          setLastMessage(targetChar.description || 'System Ready.');
        }
        setAnniversaries(annis);
      } catch (e) {
        console.error(e);
      }
    };
    if (isDataLoaded) loadData();
  }, [activeCharacterId, lastMsgTimestamp, isDataLoaded, characters]);

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

  // ───────── 横向翻页（滚动壳）─────────
  // 初始定位：本次会话首次挂载（_lastPageIndex < 0）用 launcherStartPageId 定起始页
  // （未设置 = 主屏，不管主屏现在被挪到第几页）；从 App 返回则回上次浏览页。
  // 定位完成前忽略 onScroll，免得容器刚挂载时 scrollLeft=0 触发的那次事件把落点
  // 覆盖成第一页。
  //
  // 这里按当时的 el.clientWidth 算 scrollLeft 只是「第一次」定位，还不算完事：
  // 外壳（PhoneShell）挂载后经常还会有一次视口宽度收缩（铺满窗口 → 收成手机画幅），
  // 这次收缩发生在这段定位逻辑跑完*之后*，会让刚刚按旧宽度算好的绝对像素值
  // 对不上收缩后的新页宽——实测复现过好几次「明明该停在主屏却停在第 0 页」。
  // 用 ResizeObserver 盯着容器宽度：用户还没自己动过手（interacted）之前，
  // 宽度一变就按当前目标页重新贴一次 scrollLeft；用户一旦自己滑动/长按过，
  // 就再也不插手，避免和用户手势打架。1.5s 安全阀兜底，防止某些设备上宽度
  // 一直抖动导致纠正逻辑永远不退出。
  useLayoutEffect(() => {
    if (initialScrollDoneRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;

    const pgs = pagesRef.current;
    let target: number;
    if (_lastPageIndex >= 0) {
      target = _lastPageIndex;
    } else if (isDataLoaded) {
      const idx = theme.launcherStartPageId
        ? pgs.findIndex(p => p.id === theme.launcherStartPageId)
        : -1;
      target = idx >= 0 ? idx : findHomeIndex(pgs);
      _lastPageIndex = target;
    } else {
      target = findHomeIndex(pgs);
    }
    target = Math.max(0, Math.min(pgs.length - 1, target));

    activePageIndexRef.current = target;
    setActivePageIndex(target);

    let settledCount = 0;
    let rafId = 0;
    let interacted = false;

    const markDone = () => {
      if (!initialScrollDoneRef.current) {
        initialScrollDoneRef.current = true;
        setInitialScrollDone(true);
      }
    };

    const markInteracted = () => {
      interacted = true;
      markDone();
    };
    el.addEventListener('pointerdown', markInteracted, { once: true });

    const settle = () => {
      if (interacted || !el) return;
      const clientW = el.clientWidth;
      const scrollW = el.scrollWidth;
      // 容器子页面尚未展开时，直接跳过等下一帧
      if (target > 0 && scrollW <= clientW) return;

      const want = clientW * target;
      if (Math.abs(el.scrollLeft - want) > 1) {
        el.scrollLeft = want;
        settledCount = 0;
      } else {
        settledCount++;
        // 稳定对齐连续 2 帧，且如果数据已经就绪（或从 App 返回），完成初始定位！
        if (settledCount >= 2 && (_lastPageIndex >= 0 || isDataLoaded)) {
          markDone();
        }
      }
    };

    settle();
    const tick = () => {
      settle();
      if (!interacted && !initialScrollDoneRef.current) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);

    const ro = new ResizeObserver(settle);
    ro.observe(el);

    const stopTimer = setTimeout(() => {
      markDone();
      ro.disconnect();
    }, 8000);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
      clearTimeout(stopTimer);
      el.removeEventListener('pointerdown', markInteracted);
    };
  }, [isDataLoaded, theme.launcherStartPageId]);

  const handleScroll = () => {
    if (!initialScrollDoneRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    // 真的在横向翻页了 → 说明这一下是滑动手势，不是长按：兜底清掉挂起的
    // 长按计时器（正常情况下 onRootPointerMove 的位移阈值已经会清，这里
    // 是双保险，防止个别设备指针事件被合并/延迟导致长按误触发编辑态）。
    if (bgPressStart.current || itemPressStart.current) clearPress();

    // 如果正在靠边程序化翻页，避免平滑滚动过程中的中间插值把 activePageIndexRef 冲掉
    if (programmaticScrollTargetRef.current !== null) {
      const targetLeft = programmaticScrollTargetRef.current * el.clientWidth;
      if (Math.abs(el.scrollLeft - targetLeft) < 12) {
        programmaticScrollTargetRef.current = null;
      }
      return;
    }

    const index = Math.max(0, Math.min(pagesRef.current.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
    if (index !== activePageIndexRef.current) {
      activePageIndexRef.current = index;
      _lastPageIndex = index;
      setActivePageIndex(index);
      setAddPageMenu(null); // 翻页了，之前那页弹出的加页菜单跟当前页对不上了，收掉
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(10);
        }
      } catch {}
    }
  };

  // 桌面鼠标拖拽翻页（非编辑态，窗口级平滑追踪 + 惯性吸附）
  const isMouseDragging = useRef(false);
  const mouseStartX = useRef(0);
  const mouseStartTime = useRef(0);
  const mouseScrollLeft = useRef(0);
  const mouseMoved = useRef(0);
  const suppressClickUntil = useRef(0);

  // 只认「真鼠标」：绑在 onPointerDown 上并用 pointerType 过滤，而不是绑在
  // onMouseDown/window 'mousemove'/'mouseup' 上。原因：手机浏览器在一次触摸
  // 结束后经常会补发一遍兼容性的 mousedown/mouseup/click（无障碍/兼容历史包袱），
  // 之前这段逻辑绑的正是这几个事件——每次真实的手指滑动都会被这几个"迟到"的
  // 假鼠标事件二次触发一遍：先把 scroll-snap 关掉，再在 mouseup 里用一个（相对
  // 触摸手势而言）过时的起始坐标算出一个目标页，强行 scrollTo 回去——原生触摸
  // 滚动明明已经顺滑地停在正确的页上，却被这段代码"纠正"回去或叠加一次动画，
  // 表现出来就是横向来回抖一下。PointerEvent 自带 pointerType，触摸产生的指针
  // 永远是 'touch'，不会被误判成 'mouse'，从根上避免踩到这个兼容事件的坑。
  const handleMouseDown = (e: React.PointerEvent) => {
    if (!scrollContainerRef.current || layoutEditing || e.pointerType !== 'mouse' || e.button !== 0) return;
    const scroller = scrollContainerRef.current;
    const pointerId = e.pointerId;
    isMouseDragging.current = true;
    mouseMoved.current = 0;
    mouseStartX.current = e.pageX;
    mouseStartTime.current = Date.now();
    mouseScrollLeft.current = scroller.scrollLeft;

    // 拖动过程中临时禁用 CSS snap，确保像素级跟随鼠标，不被吸附引擎强行拉扯
    scroller.style.scrollSnapType = 'none';

    const onWindowPointerMove = (me: PointerEvent) => {
      if (me.pointerId !== pointerId || !isMouseDragging.current || !scrollContainerRef.current) return;
      const dx = me.pageX - mouseStartX.current;
      scrollContainerRef.current.scrollLeft = mouseScrollLeft.current - dx;
      mouseMoved.current = Math.abs(dx);
    };

    const onWindowPointerUp = (ue: PointerEvent) => {
      if (ue.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);

      const el = scrollContainerRef.current;
      if (!isMouseDragging.current || !el) return;
      isMouseDragging.current = false;

      if (mouseMoved.current > 5) {
        suppressClickUntil.current = Date.now() + 250;
      }

      const dx = ue.pageX - mouseStartX.current;
      const dt = Math.max(1, Date.now() - mouseStartTime.current);
      const velocity = dx / dt; // px / ms

      const curPage = Math.round(mouseScrollLeft.current / el.clientWidth);
      let targetPage = curPage;

      // 只要有明显的快速甩动（速度 > 0.35 或拖动超过 20% 页面宽度），就顺畅翻页
      if (velocity < -0.35 || dx < -el.clientWidth * 0.2) {
        targetPage = Math.min(pagesRef.current.length - 1, curPage + 1);
      } else if (velocity > 0.35 || dx > el.clientWidth * 0.2) {
        targetPage = Math.max(0, curPage - 1);
      }

      el.scrollTo({ left: targetPage * el.clientWidth, behavior: 'smooth' });

      // 平滑滚动完成到达目标位置后再恢复 scroll-snap
      const restoreSnap = () => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.style.scrollSnapType = 'x mandatory';
        }
      };
      el.addEventListener('scrollend', restoreSnap, { once: true });
      setTimeout(restoreSnap, 420); // 兜底
    };

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    if (layoutEditing) {
      const target = e.target as HTMLElement;
      // 徽标操作按钮（删除、锁定、缩放）放行
      if (target.closest('[data-grid-action]')) {
        return;
      }
      // 组件内快捷操作（如黑胶深浅色切换、贴纸等）放行
      if (target.closest('[data-action="widget-action"]')) {
        return;
      }
      // 风车四宫格（quad_apps）在编辑态下需要响应点击打开管理面板，放行！
      if (target.closest('[data-grid-kind="quad_apps"]')) {
        return;
      }
      // 其他网格条目在编辑态下拦截点击，禁止打开 App
      const itemEl = target.closest('[data-grid-item]');
      if (itemEl) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
    }
    if (mouseMoved.current > 5 || Date.now() < suppressClickUntil.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };


  // ───────── 编辑态：长按进入 + 拖拽 / 改大小 ─────────
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageTurnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageTurnDir = useRef<-1 | 0 | 1>(0);
  const programmaticScrollTargetRef = useRef<number | null>(null);
  const lastPointerPos = useRef<{ clientX: number; clientY: number } | null>(null);
  const gesture = useRef<null | {
    mode: 'move' | 'resize' | 'scroll';
    pointerId: number;
    item?: PlacedItem;
    fromPage?: number;
    startX: number;
    startY: number;
    grabDX?: number;
    grabDY?: number;
    el?: HTMLElement;
    ghost?: HTMLElement;
    active: boolean;
    scrollStartLeft?: number;
  }>(null);
  const [dragPreview, setDragPreview] = useState<null | {
    pageIndex: number;
    x: number;
    y: number;
    w: number;
    h: number;
    ok: boolean;
    dropToQuad?: {
      quadId: string;
      pageIndex: number;
      slotIndex: number;
    };
    displacements?: Map<string, { x: number; y: number }>;
  }>(null);

  // 电脑模式：点击分页胶囊直接跳页。复用「边缘拖拽自动翻页」同一套 programmaticScrollTargetRef
  // 标记（见上面 handleScroll 里的读取逻辑），避免平滑滚动过程中 handleScroll 读到的中间
  // scrollLeft 插值把 activePageIndex 冲乱，和现有拖拽状态机走同一条路，不另起一套判断。
  const jumpToPage = useCallback((index: number) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const target = Math.max(0, Math.min(pagesRef.current.length - 1, index));
    if (target === activePageIndexRef.current) return;
    programmaticScrollTargetRef.current = target;
    activePageIndexRef.current = target;
    setActivePageIndex(target);
    _lastPageIndex = target;
    el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' });
  }, []);

  // 长按预警：按到临界值前一小段时间，先让被按住的图标轻微下沉变暗，
  // 给用户一个「再按住就要进编辑态了」的信号，可以主动松手取消——
  // 不然单击稍微慢一点点、又完全没有过渡提示，很容易莫名其妙把 App 点开失败。
  const pressWarnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressWarnEl = useRef<HTMLElement | null>(null);
  const clearPressWarn = () => {
    if (pressWarnTimer.current) clearTimeout(pressWarnTimer.current);
    pressWarnTimer.current = null;
    pressWarnEl.current?.classList.remove('launcher-press-warn');
    pressWarnEl.current = null;
  };
  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    clearPressWarn();
  };
  const clearPageTurn = () => { if (pageTurnTimer.current) clearTimeout(pageTurnTimer.current); pageTurnTimer.current = null; pageTurnDir.current = 0; };

  const displaceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredDisplaceTarget = useRef<{
    pageIndex: number;
    x: number;
    y: number;
    w: number;
    h: number;
    key: string;
  } | null>(null);

  const clearDisplaceTimer = useCallback(() => {
    if (displaceTimer.current) {
      clearTimeout(displaceTimer.current);
      displaceTimer.current = null;
    }
    hoveredDisplaceTarget.current = null;
  }, []);

  // 长按桌面空白处（不是某个图标/组件）也能进整理态，不用非得按在图标上。
  const bgPressStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const onBackgroundPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-grid-item], [data-grid-action]')) return;
    if (layoutEditing) {
      // 已经在整理态了，空白处长按进整理态这套没意义——但整理态下滚动容器
      // 整个是 touchAction:'none'（给拖拽腾地方），原生触摸翻页被彻底关掉，
      // 按在空白处就再也没有任何手势能翻页了。这里直接起一个 'scroll' 手势，
      // 交给 onRootPointerMove/onRootPointerUp 里已有的翻页逻辑接手。
      clearPress();
      if (scrollContainerRef.current) scrollContainerRef.current.style.scrollSnapType = 'none';
      gesture.current = {
        mode: 'scroll', pointerId: e.pointerId,
        startX: e.clientX, startY: e.clientY, active: true,
        scrollStartLeft: scrollContainerRef.current?.scrollLeft ?? 0,
      };
      return;
    }
    clearPress();
    bgPressStart.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    pressTimer.current = setTimeout(() => {
      if (!bgPressStart.current || bgPressStart.current.pointerId !== e.pointerId) return;
      bgPressStart.current = null;
      setLayoutEditing(true);
      trackEvent('进入桌面整理模式（空白处长按）');
    }, LONGPRESS_MS);
  };

  // 拖拽「幽灵」元素直接挂在 document.body 上（脱离 React 管控），只靠自己清理。
  // 手机上偶尔会出现清不掉的残影（真机上 pointerup/pointercancel 没有可靠触发，
  // 比如系统手势打断、切后台），所以除了正常清理，再加一道扫场兜底：
  // 进入/退出整理态、每次按下新的拖拽、组件挂载卸载时都清一遍，绝不留死角。
  const sweepStrayGhosts = () => {
    document.querySelectorAll('.launcher-drag-ghost').forEach(el => el.remove());
  };
  useEffect(() => {
    sweepStrayGhosts(); // 挂载时清掉上个会话/崩溃可能留下的残影
    return () => { clearPress(); clearPageTurn(); clearDisplaceTimer(); gesture.current?.ghost?.remove(); sweepStrayGhosts(); };
  }, []);

  const makeGhost = (el: HTMLElement) => {
    sweepStrayGhosts(); // 万一上一次没清干净，新建之前先扫一遍，绝不叠加
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-grid-item');
    ghost.classList.add('launcher-drag-ghost');
    Object.assign(ghost.style, {
      position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`, margin: '0',
      pointerEvents: 'none', zIndex: '9999', transform: 'scale(1.04)', transition: 'none',
    });
    document.body.appendChild(ghost);
    return { ghost, rect };
  };

  const cellFromPoint = (pageIndex: number, clientX: number, clientY: number, w: number, h: number) => {
    const el = pageGridRefs.current[pageIndex];
    if (!el) return null;
    const page = pagesRef.current[pageIndex];
    const rows = rowsForScreen(pageIndex, page);
    // 命中测试要跟渲染用的同一份公式，否则拖拽落点会跟视觉格子对不上。
    const rowGap = GRID_ROW_GAP;
    const cellH = cellHeightFor(cellPx);
    const r = el.getBoundingClientRect();
    let col = Math.floor((clientX - r.left) / (cellPx + GRID_COL_GAP));
    let row = Math.floor((clientY - r.top) / (cellH + rowGap));
    col = Math.max(0, Math.min(GRID_COLS - w, col));
    row = Math.max(0, Math.min(rows - h, row));
    return { x: col, y: row };
  };

  // 以被拖拽条目的首个 1×1 单元几何中心为基准探测网格落点：只要重叠度超过 50%，即可灵敏对称地命中目标格子
  const itemCellFromPoint = useCallback((
    pageIndex: number,
    clientX: number,
    clientY: number,
    item: { w: number; h: number },
    grabDX: number = 0,
    grabDY: number = 0,
  ) => {
    const cellH = cellHeightFor(cellPx);
    return cellFromPoint(
      pageIndex,
      clientX - grabDX + cellPx / 2,
      clientY - grabDY + cellH / 2,
      item.w,
      item.h,
    );
  }, [cellPx]);

  // 记录拖拽过程中是否临时自动新建了末尾页，用于在用户未放置时撤销清理
  const createdPageInDragRef = useRef<string | null>(null);
  // 多点触控：主手指拖拽 App 期间，允许第二根手指在屏幕上滑动翻页
  const secondaryScrollRef = useRef<{ pointerId: number; startX: number; scrollStartLeft: number } | null>(null);

  // 计算拖拽落点及邻近避让（挤开）方案：若目标格子被占用，且旁边有空位可容纳，则挤开原条目
  const resolveDragPlacement = useCallback((
    pageIndex: number,
    targetCell: { x: number; y: number },
    w: number,
    h: number,
    ignoreId?: string,
  ) => {
    const page = pagesRef.current[pageIndex];
    if (!page) return { ok: false, displacements: undefined };
    const rows = rowsForScreen(pageIndex, page);
    const disp = tryDisplace(page, { x: targetCell.x, y: targetCell.y, w, h }, ignoreId, GRID_COLS, rows);
    if (disp && disp.ok) {
      return { ok: true, displacements: disp.displacedItems.size > 0 ? disp.displacedItems : undefined };
    }
    return { ok: false, displacements: undefined };
  }, []);

  // 带防抖延迟的拖拽落点与避让设置：当需要挤开邻近条目时，需悬停停留一定时间（360ms）才触发位移，防止快速划过造成图标乱跳
  const setDragPlacementWithDwell = useCallback((
    pageIndex: number,
    cell: { x: number; y: number },
    w: number,
    h: number,
    ignoreId?: string,
  ) => {
    const { ok, displacements } = resolveDragPlacement(pageIndex, cell, w, h, ignoreId);
    if (!ok) {
      clearDisplaceTimer();
      setDragPreview({ pageIndex, x: cell.x, y: cell.y, w, h, ok: false, displacements: undefined });
      return;
    }

    if (!displacements || displacements.size === 0) {
      // 目标位置为空白区域，无需挤开任何已有条目：立即显示候选框，清除悬停倒计时
      clearDisplaceTimer();
      setDragPreview({ pageIndex, x: cell.x, y: cell.y, w, h, ok: true, displacements: undefined });
      return;
    }

    // 目标位置已被占用，需要挤开邻近条目：启用悬停防抖延迟（280ms），避免手指滑动经过时产生过度灵敏的图标晃动
    const targetKey = `${pageIndex}:${cell.x},${cell.y}:${w}x${h}`;
    if (hoveredDisplaceTarget.current?.key === targetKey) {
      // 仍然停留在同一个被占用的格子上：若计时器正在跑则继续等待，若已触发过则保持当前位移不变
      return;
    }

    // 进入了新的被占用格子：立即清除上一格的计时器，先显示该格子的静态候选，待悬停稳定后再挤开
    if (displaceTimer.current) {
      clearTimeout(displaceTimer.current);
      displaceTimer.current = null;
    }
    hoveredDisplaceTarget.current = { pageIndex, x: cell.x, y: cell.y, w, h, key: targetKey };
    setDragPreview({ pageIndex, x: cell.x, y: cell.y, w, h, ok: true, displacements: undefined });

    displaceTimer.current = setTimeout(() => {
      displaceTimer.current = null;
      if (
        gesture.current?.active &&
        gesture.current.mode === 'move' &&
        hoveredDisplaceTarget.current?.key === targetKey
      ) {
        try {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(12);
          }
        } catch {}
        setDragPreview(prev => {
          if (!prev || prev.pageIndex !== pageIndex || prev.x !== cell.x || prev.y !== cell.y) return prev;
          return { ...prev, ok: true, displacements };
        });
      }
    }, 280);
  }, [resolveDragPlacement, clearDisplaceTimer]);

  const queuePageTurn = (dir: -1 | 1) => {
    if (pageTurnDir.current === dir && pageTurnTimer.current) return;
    clearPageTurn();
    pageTurnDir.current = dir;
    const turn = () => {
      const g = gesture.current;
      const scroller = scrollContainerRef.current;
      if (!g?.active || g.mode !== 'move' || !scroller || pageTurnDir.current !== dir) { clearPageTurn(); return; }
      
      const cur = activePageIndexRef.current;
      let next = cur + dir;
      const pgs = pagesRef.current;
      let isNewPageCreated = false;

      // 向右翻页且已在现有最后一页：自动在末尾追加一张新页！
      if (dir === 1 && cur >= pgs.length - 1) {
        const newPg = emptyPage();
        createdPageInDragRef.current = newPg.id;
        const nextPages = [...pgs, newPg];
        commitPages(nextPages);
        next = nextPages.length - 1;
        isNewPageCreated = true;
      }

      next = Math.max(0, Math.min(pagesRef.current.length - 1, next));
      if (next === cur) { clearPageTurn(); return; }

      clearDisplaceTimer();

      programmaticScrollTargetRef.current = next;
      activePageIndexRef.current = next;
      setActivePageIndex(next);
      _lastPageIndex = next;

      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(15);
        }
      } catch {}

      if (isNewPageCreated) {
        setTimeout(() => {
          const sc = scrollContainerRef.current;
          if (sc) {
            sc.scrollTo({ left: sc.clientWidth * next, behavior: 'smooth' });
          }
          if (lastPointerPos.current && gesture.current?.item) {
            const item = gesture.current.item;
            const cell = itemCellFromPoint(next, lastPointerPos.current.clientX, lastPointerPos.current.clientY, item, gesture.current.grabDX, gesture.current.grabDY);
            if (cell) {
              setDragPlacementWithDwell(next, cell, item.w, item.h, undefined);
            }
          }
        }, 25);
      } else {
        scroller.scrollTo({ left: scroller.clientWidth * next, behavior: 'smooth' });
        if (lastPointerPos.current && g.item) {
          const item = g.item;
          const cell = itemCellFromPoint(next, lastPointerPos.current.clientX, lastPointerPos.current.clientY, item, g.grabDX, g.grabDY);
          if (cell) {
            const ignoreId = next === g.fromPage ? item.id : undefined;
            setDragPlacementWithDwell(next, cell, item.w, item.h, ignoreId);
          }
        }
      }

      // 连续翻页间隔设为 500ms
      pageTurnTimer.current = setTimeout(turn, 500);
    };
    // 首次翻页延迟设为 480ms（给边缘停顿或放置留出充裕时间，避免误翻页）
    pageTurnTimer.current = setTimeout(turn, 480);
  };

  const itemPressStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const onItemPointerDown = useCallback((e: React.PointerEvent, item: PlacedItem, pageIndex: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-grid-action]')) return; // 徽标按钮自己处理
    const rootEl = e.currentTarget as HTMLElement;
    const itemEl = (e.target as HTMLElement).closest<HTMLElement>('[data-grid-item]');
    clearPress();

    if (!layoutEditing) {
      // 长按进入整理：记录起始坐标，若发生轻微移动则取消计时
      itemPressStart.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      if (itemEl) {
        pressWarnEl.current = itemEl;
        pressWarnTimer.current = setTimeout(() => {
          if (!itemPressStart.current || itemPressStart.current.pointerId !== e.pointerId) return;
          itemEl.classList.add('launcher-press-warn');
        }, LONGPRESS_WARN_MS);
      }
      pressTimer.current = setTimeout(() => {
        clearPressWarn();
        if (!itemPressStart.current || itemPressStart.current.pointerId !== e.pointerId) return;
        itemPressStart.current = null;
        setLayoutEditing(true);
        trackEvent('进入桌面整理模式');
        suppressClickUntil.current = Date.now() + 700;
      }, LONGPRESS_MS);
      return;
    }

    if (item.locked || !itemEl) return; // 锁定项不可拖

    lastPointerPos.current = { clientX: e.clientX, clientY: e.clientY };
    gesture.current = {
      mode: 'move', pointerId: e.pointerId, item, fromPage: pageIndex,
      startX: e.clientX, startY: e.clientY, el: itemEl, active: false,
      scrollStartLeft: scrollContainerRef.current?.scrollLeft ?? 0,
    };
    pressTimer.current = setTimeout(() => {
      const g = gesture.current;
      if (!g || g.pointerId !== e.pointerId || g.mode !== 'move' || !g.el) return;
      g.active = true;
      const { ghost, rect } = makeGhost(g.el);
      g.ghost = ghost;
      g.grabDX = e.clientX - rect.left;
      g.grabDY = e.clientY - rect.top;
      g.el.style.opacity = '0.18';
      rootEl.setPointerCapture(e.pointerId);
      suppressClickUntil.current = Date.now() + 400;
    }, 160);
  }, [layoutEditing]);

  const onResizePointerDown = useCallback((e: React.PointerEvent, item: PlacedItem, pageIndex: number) => {
    e.stopPropagation();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesture.current = {
      mode: 'resize', pointerId: e.pointerId, item, fromPage: pageIndex,
      startX: e.clientX, startY: e.clientY, active: true,
    };
    (e.target as HTMLElement).closest('[data-launcher-root]')?.setPointerCapture?.(e.pointerId);
    setDragPreview({ pageIndex, x: item.x, y: item.y, w: item.w, h: item.h, ok: true });
  }, []);

  // 多指手势：主手按住拖动 App 图标时，捕获第二根手指的滑动，实现边拖边滑屏翻页
  const onRootPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (g && g.active && g.mode === 'move' && e.pointerId !== g.pointerId) {
      e.stopPropagation();
      e.preventDefault();
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
      secondaryScrollRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        scrollStartLeft: scrollContainerRef.current?.scrollLeft ?? 0,
      };
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.scrollSnapType = 'none';
      }
      return;
    }
  };

  const onRootPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // 检查是否是副手指在滑屏翻页
    if (secondaryScrollRef.current && secondaryScrollRef.current.pointerId === e.pointerId) {
      const container = scrollContainerRef.current;
      if (container) {
        const dx = e.clientX - secondaryScrollRef.current.startX;
        container.scrollLeft = secondaryScrollRef.current.scrollStartLeft - dx;
      }
      return;
    }

    lastPointerPos.current = { clientX: e.clientX, clientY: e.clientY };

    if (bgPressStart.current && bgPressStart.current.pointerId === e.pointerId) {
      const dx = e.clientX - bgPressStart.current.x;
      const dy = e.clientY - bgPressStart.current.y;
      if (Math.hypot(dx, dy) > 10) { clearPress(); bgPressStart.current = null; }
      return; // 空白处手势不参与拖拽/改大小逻辑
    }
    if (itemPressStart.current && itemPressStart.current.pointerId === e.pointerId) {
      const dx = e.clientX - itemPressStart.current.x;
      const dy = e.clientY - itemPressStart.current.y;
      if (Math.hypot(dx, dy) > 8) { clearPress(); itemPressStart.current = null; }
    }
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;

    if (g.mode === 'resize' && g.item) {
      const meta = WIDGET_META[g.item.kind];
      const rows = rowsForScreen(g.fromPage!, pagesRef.current[g.fromPage!]);
      const cell = cellFromPoint(g.fromPage!, e.clientX, e.clientY, 1, 1);
      if (!cell) return;
      let w = Math.max(meta.minW, Math.min(meta.maxW, cell.x - g.item.x + 1, GRID_COLS - g.item.x));
      let h = Math.max(meta.minH, Math.min(meta.maxH, cell.y - g.item.y + 1, rows - g.item.y));
      const ok = canPlace(pagesRef.current[g.fromPage!], { x: g.item.x, y: g.item.y, w, h }, g.item.id, GRID_COLS, rows);
      setDragPreview({ pageIndex: g.fromPage!, x: g.item.x, y: g.item.y, w, h, ok });
      return;
    }

    // 'scroll' 模式一旦确认就要一直跟手翻页，不能再卡在下面 `!g.active` 那道
    if (g.mode === 'scroll') {
      const container = scrollContainerRef.current;
      if (container && g.scrollStartLeft !== undefined) {
        container.scrollLeft = g.scrollStartLeft - (e.clientX - g.startX);
      }
      return;
    }

    if (!g.active) {
      // 还没进入拖拽：横向大幅移动 → 当作翻页滑动
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (Math.hypot(dx, dy) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        clearPress();
        g.mode = 'scroll';
        if (scrollContainerRef.current) scrollContainerRef.current.style.scrollSnapType = 'none';
      }
      return;
    }

    // move
    e.preventDefault();
    if (g.ghost) {
      g.ghost.style.left = `${e.clientX - (g.grabDX || 0)}px`;
      g.ghost.style.top = `${e.clientY - (g.grabDY || 0)}px`;
    }
    const rootRect = e.currentTarget.getBoundingClientRect();
    const edgeZone = Math.max(48, Math.floor(rootRect.width * 0.12));
    const ghostRect = g.ghost?.getBoundingClientRect();

    const atLeftEdge = e.clientX <= rootRect.left + edgeZone || (ghostRect ? ghostRect.left <= rootRect.left + 8 : false);
    const atRightEdge = e.clientX >= rootRect.right - edgeZone || (ghostRect ? ghostRect.right >= rootRect.right - 8 : false);

    if (atLeftEdge) queuePageTurn(-1);
    else if (atRightEdge) queuePageTurn(1);
    else clearPageTurn();

    const visPage = activePageIndexRef.current;
    const item = g.item!;
    const cell = itemCellFromPoint(visPage, e.clientX, e.clientY, item, g.grabDX, g.grabDY);
    if (!cell) {
      clearDisplaceTimer();
      setDragPreview(null);
      return;
    }

    // 拖拽 1×1 App 时，检测是否悬停在某个「四宫格风车组件」上方：直接吸附进四宫格
    if (item.kind === 'app' && item.refId) {
      const pCell = cellFromPoint(visPage, e.clientX, e.clientY, 1, 1);
      const hitCell = pCell || cell;
      if (hitCell) {
        const quad = pagesRef.current[visPage]?.items.find(it =>
          it.kind === 'quad_apps' &&
          hitCell.x >= it.x && hitCell.x < it.x + it.w &&
          hitCell.y >= it.y && hitCell.y < it.y + it.h
        );
        if (quad) {
          const quadApps: (string | null)[] = Array.isArray(quad.config?.apps)
            ? [0, 1, 2, 3].map(i => quad.config.apps[i] ?? null)
            : [null, null, null, null];

          const alreadyInQuad = quadApps.includes(item.refId);
          if (!alreadyInQuad) {
            const slotX = hitCell.x - quad.x;
            const slotY = hitCell.y - quad.y;
            const hoveredSlot = Math.max(0, Math.min(3, slotY * 2 + slotX));

            let targetSlot = hoveredSlot;
            if (quadApps[hoveredSlot]) {
              const emptyIdx = [0, 1, 2, 3].find(idx => !quadApps[idx]);
              targetSlot = emptyIdx !== undefined ? emptyIdx : -1;
            }

            if (targetSlot >= 0) {
              clearDisplaceTimer();
              setDragPreview({
                pageIndex: visPage,
                x: quad.x,
                y: quad.y,
                w: quad.w,
                h: quad.h,
                ok: true,
                dropToQuad: {
                  quadId: quad.id,
                  pageIndex: visPage,
                  slotIndex: targetSlot,
                },
              });
              return;
            }
          }
        }
      }
    }

    const ignoreId = visPage === g.fromPage ? item.id : undefined;
    setDragPlacementWithDwell(visPage, cell, item.w, item.h, ignoreId);
  };

  const onRootPointerUp = (e?: React.PointerEvent<HTMLDivElement>) => {
    // 1. 如果是副手指抬起
    if (secondaryScrollRef.current && e && secondaryScrollRef.current.pointerId === e.pointerId) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      secondaryScrollRef.current = null;
      const container = scrollContainerRef.current;
      if (container) {
        const pgs = pagesRef.current;
        const rawTarget = Math.round(container.scrollLeft / container.clientWidth);
        let target = Math.max(0, rawTarget);
        let isNew = false;
        if (target >= pgs.length) {
          const newPg = emptyPage();
          createdPageInDragRef.current = newPg.id;
          const nextPages = [...pgs, newPg];
          commitPages(nextPages);
          target = nextPages.length - 1;
          isNew = true;
        } else {
          target = Math.min(pgs.length - 1, target);
        }

        activePageIndexRef.current = target;
        _lastPageIndex = target;
        setActivePageIndex(target);

        const restoreSnap = () => {
          if (scrollContainerRef.current) scrollContainerRef.current.style.scrollSnapType = 'x mandatory';
        };

        if (isNew) {
          setTimeout(() => {
            const sc = scrollContainerRef.current;
            if (sc) {
              sc.scrollTo({ left: target * sc.clientWidth, behavior: 'smooth' });
            }
            restoreSnap();
          }, 25);
        } else {
          container.scrollTo({ left: target * container.clientWidth, behavior: 'smooth' });
          container.addEventListener('scrollend', restoreSnap, { once: true });
          setTimeout(restoreSnap, 420);
        }

        clearDisplaceTimer();
        // 副手指翻页完成后，立即为目标页计算落点预览
        if (lastPointerPos.current && gesture.current?.item) {
          const item = gesture.current.item;
          const cell = itemCellFromPoint(target, lastPointerPos.current.clientX, lastPointerPos.current.clientY, item, gesture.current.grabDX, gesture.current.grabDY);
          if (cell) {
            const ignoreId = target === gesture.current.fromPage ? item.id : undefined;
            setDragPlacementWithDwell(target, cell, item.w, item.h, ignoreId);
          }
        }
      }
      return;
    }

    bgPressStart.current = null;
    itemPressStart.current = null;
    const g = gesture.current;

    // 如果是指针不匹配的其它未知指针抬起，忽略它，不破坏主手势
    if (e && g && g.pointerId !== e.pointerId) {
      return;
    }

    clearPress();
    clearPageTurn();
    clearDisplaceTimer();
    programmaticScrollTargetRef.current = null;

    if (g?.active && g.mode === 'resize' && g.item) {
      const p = dragPreview;
      if (p && p.ok) replacePage(g.fromPage!, resizeItem(pagesRef.current[g.fromPage!], g.item.id, p.w, p.h, GRID_COLS, rowsForScreen(g.fromPage!, pagesRef.current[g.fromPage!])));
    } else if (g?.active && g.mode === 'move' && g.item) {
      if (g.el) g.el.style.opacity = '';
      g.ghost?.remove();

      // 落点预览：若当前 dragPreview 为空或停在旧页，重新按当前停留在屏幕上的 activePageIndex 进行最终落点判定
      const visPage = activePageIndexRef.current;
      let finalPreview = dragPreview;
      if ((!finalPreview || finalPreview.pageIndex !== visPage) && lastPointerPos.current && g.item) {
        const item = g.item;
        const cell = itemCellFromPoint(visPage, lastPointerPos.current.clientX, lastPointerPos.current.clientY, item, g.grabDX, g.grabDY);
        if (cell) {
          const ignoreId = visPage === g.fromPage ? item.id : undefined;
          const { ok, displacements } = resolveDragPlacement(visPage, cell, item.w, item.h, ignoreId);
          finalPreview = { pageIndex: visPage, x: cell.x, y: cell.y, w: item.w, h: item.h, ok, displacements };
        }
      }

      // 若处于有效落点但因为手指停留时间未达到 360ms 悬停延迟导致 displacements 尚未填充，
      // 在松手落下的瞬间补齐 displacements，保证即刻松手（quick drop）也能正确挤开条目
      if (finalPreview && finalPreview.ok && !finalPreview.displacements && !finalPreview.dropToQuad) {
        const ignoreId = finalPreview.pageIndex === g.fromPage ? g.item.id : undefined;
        const { displacements } = resolveDragPlacement(
          finalPreview.pageIndex,
          { x: finalPreview.x, y: finalPreview.y },
          finalPreview.w,
          finalPreview.h,
          ignoreId
        );
        if (displacements) {
          finalPreview = { ...finalPreview, displacements };
        }
      }

      let droppedOnTempPage = false;
      const p = finalPreview;
      if (p && p.ok) {
        if (p.dropToQuad && g.item.kind === 'app' && g.item.refId) {
          const { quadId, pageIndex: targetPi, slotIndex } = p.dropToQuad;
          const appRefId = g.item.refId;

          const srcPageWithoutApp = removeItem(pagesRef.current[g.fromPage!], g.item.id);
          const nextPages = pagesRef.current.map((pg, pi) => {
            let pageToUpdate = pi === g.fromPage ? srcPageWithoutApp : pg;
            if (pi === targetPi) {
              pageToUpdate = {
                ...pageToUpdate,
                items: pageToUpdate.items.map(it => {
                  if (it.id !== quadId) return it;
                  const curApps: (string | null)[] = Array.isArray(it.config?.apps)
                    ? [0, 1, 2, 3].map(i => it.config.apps[i] ?? null)
                    : [null, null, null, null];
                  curApps[slotIndex] = appRefId;
                  return {
                    ...it,
                    config: { ...(it.config || {}), apps: curApps }
                  };
                })
              };
            }
            return pageToUpdate;
          });

          commitPages(nextPages);
          trackEvent('桌面拖拽收纳应用入四宫格');
        } else if (p.pageIndex === g.fromPage) {
          // 同一页内放置：应用挤开位移 + 移动自身到目标位置
          const pageWithDisplacement = applyDisplacements(pagesRef.current[g.fromPage!], p.displacements);
          const nextPg: DesktopPage = {
            ...pageWithDisplacement,
            items: pageWithDisplacement.items.map(i => i.id === g.item!.id ? { ...i, x: p.x, y: p.y } : i),
          };
          replacePage(g.fromPage!, nextPg);
        } else {
          // 跨页放置：原页移除被拖拽项，目标页应用挤开位移 + 添加被拖拽项
          const src = removeItem(pagesRef.current[g.fromPage!], g.item.id);
          const targetWithDisplacement = applyDisplacements(pagesRef.current[p.pageIndex], p.displacements);
          const placed = addItem(targetWithDisplacement, {
            kind: g.item.kind, refId: g.item.refId, w: g.item.w, h: g.item.h,
            locked: g.item.locked, title: g.item.title, config: g.item.config,
            x: p.x, y: p.y,
          }, GRID_COLS, rowsForScreen(p.pageIndex, pagesRef.current[p.pageIndex]));
          const next = pagesRef.current.map((pg, i) =>
            i === g.fromPage ? src : i === p.pageIndex ? (placed?.page ?? targetWithDisplacement) : pg);
          commitPages(next);

          if (createdPageInDragRef.current && pagesRef.current[p.pageIndex]?.id === createdPageInDragRef.current) {
            droppedOnTempPage = true;
          }
        }
      } else if (g.el) {
        g.el.style.opacity = '';
      }

      // 如果拖拽中途自动新建了末尾页，而用户最终未将条目放置在该页上，撤销该空页
      const tempId = createdPageInDragRef.current;
      createdPageInDragRef.current = null;
      if (tempId && !droppedOnTempPage) {
        const pgs = pagesRef.current;
        const tempPg = pgs.find(pg => pg.id === tempId);
        if (tempPg && tempPg.items.length === 0 && pgs.length > 1) {
          const cleaned = pgs.filter(pg => pg.id !== tempId);
          commitPages(cleaned);
          const curPi = activePageIndexRef.current;
          if (curPi >= cleaned.length) {
            const clamped = cleaned.length - 1;
            activePageIndexRef.current = clamped;
            _lastPageIndex = clamped;
            setActivePageIndex(clamped);
            scrollContainerRef.current?.scrollTo({ left: clamped * (scrollContainerRef.current?.clientWidth || 0), behavior: 'smooth' });
          }
        }
      }

      suppressClickUntil.current = Date.now() + 400;
    } else if (g?.active && g.mode === 'scroll') {
      const container = scrollContainerRef.current;
      if (container) {
        const target = Math.max(0, Math.min(totalPages - 1, Math.round(container.scrollLeft / container.clientWidth)));
        activePageIndexRef.current = target;
        _lastPageIndex = target;
        setActivePageIndex(target);
        container.scrollTo({ left: target * container.clientWidth, behavior: 'smooth' });
        const restoreSnap = () => { if (scrollContainerRef.current) scrollContainerRef.current.style.scrollSnapType = 'x mandatory'; };
        container.addEventListener('scrollend', restoreSnap, { once: true });
        setTimeout(restoreSnap, 420);
      }
    } else if (g?.el) {
      g.el.style.opacity = '';
      g.ghost?.remove();
    }
    setDragPreview(null);
    gesture.current = null;
  };

  const finishEditing = () => { onRootPointerUp(); sweepStrayGhosts(); setLayoutEditing(false); setAddPageMenu(null); };

  // ───────── 条目增删 / 页面增删 ─────────
  const handleDeleteItem = useCallback((pageIndex: number, itemId: string) => {
    replacePage(pageIndex, removeItem(pagesRef.current[pageIndex], itemId));
    trackEvent('桌面移除条目');
  }, [replacePage]);

  const handleToggleLock = useCallback((pageIndex: number, itemId: string) => {
    replacePage(pageIndex, toggleLock(pagesRef.current[pageIndex], itemId));
  }, [replacePage]);

  const registerPageGridRef = useCallback((index: number, el: HTMLDivElement | null) => {
    pageGridRefs.current[index] = el;
  }, []);

  const handleOpenChat = useCallback(() => {
    if (layoutEditing) return;
    openApp(AppID.Chat);
  }, [layoutEditing, openApp]);

  const handleAddToCurrentPage = useCallback((spec: { kind: GridItemKind; refId?: string }) => {
    const cur = activePageIndexRef.current;
    const size = defaultSizeFor(spec.kind);
    const locked = DEFAULT_LOCKED_KINDS.has(spec.kind);
    const placed = addItem(pagesRef.current[cur], { ...spec, w: size.w, h: size.h, locked }, GRID_COLS, rowsForScreen(cur, pagesRef.current[cur]));
    if (placed) {
      replacePage(cur, placed.page);
    } else {
      // 当前页放不下 → 在它后面插一张新页
      const np = emptyPage();
      const res = addItem(np, { ...spec, w: size.w, h: size.h, locked }, GRID_COLS, rowsForScreen(cur + 1, np));
      const next = [...pagesRef.current.slice(0, cur + 1), res ? res.page : np, ...pagesRef.current.slice(cur + 1)];
      commitPages(next);
    }
    trackEvent('桌面添加条目', { kind: spec.kind });
  }, [replacePage, commitPages]);

  // 新页插在"当前页的左边"还是"右边"——不再是只能往最后追加一页。主屏的表头
  // 跟着 layout:'home' 标记走（见 desktopGrid.ts），不跟下标，所以就算往主屏左边
  // 插页把主屏从下标 1 挤到别的位置，表头也不会跟丢。
  const handleAddPage = useCallback((direction: 'left' | 'right', layout?: 'windmill') => {
    const cur = activePageIndexRef.current;
    const insertAt = direction === 'left' ? cur : cur + 1;
    const newPage = emptyPage(undefined, layout);
    const next = [
      ...pagesRef.current.slice(0, insertAt),
      newPage,
      ...pagesRef.current.slice(insertAt),
    ];
    commitPages(next);
    setActivePageIndex(insertAt);
    activePageIndexRef.current = insertAt;
    _lastPageIndex = insertAt;
    const el = scrollContainerRef.current;
    if (el) {
      // 插在左边时前面页数变多，得等这一帧布局（页宽 × 下标）落定了再跳，
      // 不然会用旧的页面数量算出错误的 scrollLeft。
      requestAnimationFrame(() => {
        el.scrollTo({ left: el.clientWidth * insertAt, behavior: 'auto' });
      });
    }
  }, [commitPages]);

  const handleRemovePage = useCallback((pageIndex: number) => {
    if (pagesRef.current.length <= 1) return;
    const next = pagesRef.current.filter((_, i) => i !== pageIndex);
    commitPages(next);
    const clamped = Math.min(activePageIndexRef.current, next.length - 1);
    activePageIndexRef.current = clamped;
    setActivePageIndex(clamped);
    _lastPageIndex = clamped;
  }, [commitPages]);

  // 相框换图：写回某个 image 条目的 config.src
  const [imagePicker, setImagePicker] = useState<{ pageIndex: number; itemId: string; src?: string } | null>(null);
  const setItemConfigSrc = useCallback((pageIndex: number, itemId: string, src: string | undefined) => {
    const p = pagesRef.current[pageIndex];
    if (!p) return;
    replacePage(pageIndex, {
      ...p,
      items: p.items.map(it => it.id === itemId ? { ...it, config: { ...(it.config || {}), src } } : it),
    });
  }, [replacePage]);
  const openImagePicker = useCallback((item: PlacedItem) => {
    const pi = pagesRef.current.findIndex(p => p.items.some(i => i.id === item.id));
    if (pi < 0) return;
    setImagePicker({ pageIndex: pi, itemId: item.id, src: item.config?.src });
  }, []);

  // 四宫格组件管理：点击打开管理抽屉，直观查看 4 个槽位并增删替换
  const [quadManagerTarget, setQuadManagerTarget] = useState<{
    pageIndex: number;
    itemId: string;
    slotIndex?: number;
  } | null>(null);

  const handleOpenQuadManager = useCallback((item: PlacedItem, slotIndex?: number) => {
    const pi = pagesRef.current.findIndex(p => p.items.some(i => i.id === item.id));
    if (pi < 0) return;
    setQuadManagerTarget({ pageIndex: pi, itemId: item.id, slotIndex });
  }, []);

  // 电脑模式：全局方向键翻页（←/→）。见 desktop-adaptation-plan.md 模块 3。
  // 防冲突范围：
  // - 焦点在输入框/textarea/select/contenteditable 时不接管，文本光标优先；
  // - 中文输入法组词中（isComposing）不接管，拼音选字要用方向键翻候选词；
  // - 按了 Alt/Ctrl/Cmd 等修饰键不接管，避免拦掉浏览器自己的前进后退等系统手势；
  // - 编辑态或任何弹层（组件库/图片选择/四宫格管理/加页菜单/见面全屏）打开时不
  //   接管，这些弹层自己的方向键交互（如果以后加）优先；
  // - 元素标了 [data-no-arrow-nav] 视为自行声明"这里方向键归我管"，同样放行。
  useEffect(() => {
    if (!isDesktop) return;
    const overlayOpen = layoutEditing || galleryOpen || scheduleViewerOpen || !!imagePicker || !!quadManagerTarget || addPageMenu !== null;
    if (overlayOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
        if (target.closest('[data-no-arrow-nav]')) return;
      }
      e.preventDefault();
      jumpToPage(activePageIndexRef.current + (e.key === 'ArrowLeft' ? -1 : 1));
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDesktop, layoutEditing, galleryOpen, scheduleViewerOpen, imagePicker, quadManagerTarget, addPageMenu, jumpToPage]);

  const handleRemoveQuadApp = useCallback((pageIndex: number, itemId: string, slotIndex: number) => {
    const page = pagesRef.current[pageIndex];
    if (!page) return;
    const targetItem = page.items.find(i => i.id === itemId);
    if (!targetItem) return;
    const currentApps: (string | null)[] = Array.isArray(targetItem.config?.apps)
      ? [0, 1, 2, 3].map(i => targetItem.config.apps[i] ?? null)
      : [null, null, null, null];
    currentApps[slotIndex] = null;
    replacePage(pageIndex, {
      ...page,
      items: page.items.map(it => it.id === itemId ? {
        ...it,
        config: { ...(it.config || {}), apps: currentApps }
      } : it)
    });
    trackEvent('四宫格移除应用');
  }, [replacePage]);

  const handleSelectQuadApp = useCallback((pageIndex: number, itemId: string, slotIndex: number, appId: string) => {
    // 1. 如果该 appId 已经在其它页面的普通 1×1 app 条目中，则将其从原位置移除（收纳进四宫格）
    let currentPages = pagesRef.current.map(p => ({
      ...p,
      items: p.items.filter(it => !(it.kind === 'app' && it.refId === appId))
    }));

    // 2. 将 appId 放入目标 quad_apps 的 slotIndex
    const targetPage = currentPages[pageIndex];
    if (!targetPage) return;
    const targetItem = targetPage.items.find(i => i.id === itemId);
    if (!targetItem) return;

    const currentApps: (string | null)[] = Array.isArray(targetItem.config?.apps)
      ? [0, 1, 2, 3].map(i => targetItem.config.apps[i] ?? null)
      : [null, null, null, null];
    currentApps[slotIndex] = appId;

    currentPages = currentPages.map((p, i) => i === pageIndex ? {
      ...p,
      items: p.items.map(it => it.id === itemId ? {
        ...it,
        config: { ...(it.config || {}), apps: currentApps }
      } : it)
    } : p);

    commitPages(currentPages);
    trackEvent('四宫格添加应用');
  }, [commitPages]);

  // ───────── 主题派生 ─────────
  const contentColor = theme.contentColor || '#ffffff';
  const acnh = theme.skin === 'animalcrossing';
  const paper = theme.skin !== 'animalcrossing' && theme.skin !== 'mobilegame' && theme.skin !== 'tamagotchi' && isPaperWallpaper(theme.wallpaper);
  const launcherBottomInset = '1.25rem';
  const totalUnread = Object.values(unreadMessages).reduce((a, b) => a + b, 0);
  const widgetUnread = widgetChar && unreadMessages[widgetChar.id] ? unreadMessages[widgetChar.id] : 0;

  const widgetCtx: WidgetRenderContext = useMemo(() => ({
    contentColor, acnh, paper, editing: layoutEditing,
    openApp: (id: string) => { if (!layoutEditing) openApp(id as AppID); },
    anniversaries, characters,
    widgetChar, unreadCount: widgetUnread, lastMessage,
    onOpenCharCard: () => { if (!layoutEditing) openApp(AppID.Chat); },
    scheduleData, scheduleChar,
    onOpenSchedule: () => {
      if (layoutEditing) return;
      setScheduleViewerOpen(true);
      trackEvent('打开角色日程面板');
    },
    onEditImage: openImagePicker,
    onOpenQuadManager: handleOpenQuadManager,
    widgetOpacity: theme.widgetOpacity,
  }), [
    contentColor, acnh, paper, layoutEditing, openApp,
    anniversaries, characters, widgetChar, widgetUnread,
    lastMessage, scheduleData, scheduleChar, openImagePicker,
    handleOpenQuadManager, theme.widgetOpacity,
  ]);

  const dockAppsConfig = useMemo(() => {
    const byId = new Map(INSTALLED_APPS.map(app => [app.id, app]));
    const order = (theme.launcherDockOrder && theme.launcherDockOrder.length ? theme.launcherDockOrder : DOCK_APPS as unknown as string[]);
    return order.map(id => byId.get(id as AppID)).filter(Boolean) as typeof INSTALLED_APPS;
  }, [theme.launcherDockOrder]);

  // 皮肤分流（独立组件自渲染）
  if (theme.skin === 'mobilegame') return <MobileGameHome />;
  if (theme.skin === 'tamagotchi') return <TamagotchiHome />;
  if (theme.skin === 'companion') {
    return (
      <React.Suspense fallback={<div className="h-full w-full bg-[#100d1c]" />}>
        <CompanionHome />
      </React.Suspense>
    );
  }



  return (
    <div
      data-launcher-root
      className="h-full w-full flex flex-col relative z-10 overflow-hidden font-sans select-none"
      onPointerDownCapture={onRootPointerDownCapture}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onRootPointerMove}
      onPointerUp={onRootPointerUp}
      onPointerCancel={onRootPointerUp}
      onContextMenu={(e) => { if ((e.target as HTMLElement).closest('[data-grid-item]')) e.preventDefault(); }}
    >
      <style>{`
        .launcher-drag-ghost { opacity:.96; filter: drop-shadow(0 12px 14px rgba(75,65,54,.18)); }
        .launcher-edit-wobble { animation: launcherWobble 2.4s ease-in-out infinite; transform-origin: 50% 50%; }
        @keyframes launcherWobble { 0%,100%{transform:rotate(-0.6deg)} 50%{transform:rotate(0.6deg)} }
        /* 长按预警：还没到「进入整理态」的临界点，先给个「快松手」的信号 */
        .launcher-press-warn { transition: transform 160ms ease, filter 160ms ease, opacity 160ms ease; transform: scale(0.88); filter: brightness(0.8); opacity: 0.85; }
        /* 拖拽落点候选框浮现微弹动画 */
        .launcher-drag-placeholder { animation: launcherPlaceholderPop 160ms cubic-bezier(0.2, 0.9, 0.3, 1.2); }
        @keyframes launcherPlaceholderPop { 0% { opacity: 0.2; transform: scale(0.92); } 100% { opacity: 1; transform: scale(1); } }
      `}</style>

      {layoutEditing && (
        <div className="absolute top-[calc(var(--safe-top)+0.65rem)] left-5 right-5 z-50 flex items-center justify-between pointer-events-none">
          <button
            onClick={() => { setGalleryInitialTab('widgets'); setGalleryOpen(true); }}
            className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold backdrop-blur-xl border shadow-lg active:scale-95 transition"
            style={{
              background: paper ? 'rgba(224,221,215,0.75)' : acnh ? 'rgba(250,246,236,0.85)' : 'rgba(255,255,255,0.65)',
              color: paper ? '#4a3e31' : acnh ? '#725d42' : '#1e293b',
              borderColor: paper ? 'rgba(91,72,51,0.15)' : acnh ? '#e8e2d6' : 'rgba(255,255,255,0.5)',
            }}
          >
            <Plus size={14} weight="bold" /><span>添加组件 / 应用</span>
          </button>
          <button
            onClick={finishEditing}
            className="pointer-events-auto px-4 py-1.5 rounded-full text-xs font-bold shadow-lg active:scale-95 transition backdrop-blur-xl border"
            style={{ background: paper ? '#788369' : acnh ? '#19c8b9' : '#0f172a', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
          >
            完成
          </button>
        </div>
      )}


      {!acnh && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full" style={{ background: paper ? 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, transparent 68%)' : 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full" style={{ background: paper ? 'radial-gradient(circle, rgba(123,104,78,0.06) 0%, transparent 68%)' : 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)' }} />
        </div>
      )}

      {/* 桌面自由摆放装饰（贴纸），铺满整个滚动区上方 */}
      {theme.desktopDecorations && theme.desktopDecorations.length > 0 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]">
          {theme.desktopDecorations.map(deco => (
            <img
              key={deco.id} src={deco.content} alt="" loading="lazy"
              className="absolute w-16 h-16 object-contain select-none"
              style={{
                left: `${deco.x}%`, top: `${deco.y}%`,
                transform: `translate(-50%, -50%) scale(${deco.scale}) rotate(${deco.rotation}deg)${deco.flip ? ' scaleX(-1)' : ''}`,
                opacity: deco.opacity, zIndex: deco.zIndex,
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))',
              }}
            />
          ))}
        </div>
      )}

      {/* 横向翻页容器 */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onPointerDown={handleMouseDown}
        onClickCapture={handleClickCapture}
        className={`flex-1 flex overflow-x-auto no-scrollbar cursor-grab active:cursor-grabbing ${initialScrollDone ? 'snap-x snap-mandatory' : ''}`}
        style={{
          scrollBehavior: initialScrollDone ? 'smooth' : 'auto',
          overscrollBehaviorX: 'contain',
          overscrollBehaviorY: 'none',
          touchAction: layoutEditing ? 'none' : 'pan-x pan-y',
          willChange: 'scroll-position',
          contain: 'layout paint',
          transform: 'translateZ(0)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {pages.map((page, pageIndex) => (
          <DesktopPageView
            key={page.id}
            page={page}
            pageIndex={pageIndex}
            gridWidthPx={gridWidthPx}
            cellPx={cellPx}
            layoutEditing={layoutEditing}
            widgetCtx={widgetCtx}
            onItemPointerDown={onItemPointerDown}
            handleToggleLock={handleToggleLock}
            handleDeleteItem={handleDeleteItem}
            onResizePointerDown={onResizePointerDown}
            dragPreview={dragPreview}
            registerPageGridRef={registerPageGridRef}
            widgetChar={widgetChar}
            widgetUnread={widgetUnread}
            lastMessage={lastMessage}
            onOpenChat={handleOpenChat}
            contentColor={contentColor}
            paper={paper}
          />
        ))}
      </div>

      {/* 页码点 */}
      <PageIndicators
        totalPages={totalPages}
        activePageIndex={activePageIndex}
        contentColor={contentColor}
        bottomInset={launcherBottomInset}
        onJumpToPage={jumpToPage}
      />

      {/* 编辑态：当前页控件（起始页 / 增删页），放在固定栏与网格之间，方便单手点击 */}
      {layoutEditing && (() => {
        const curPage = pages[activePageIndex];
        if (!curPage) return null;
        const isStart = theme.launcherStartPageId
          ? theme.launcherStartPageId === curPage.id
          : curPage.layout === 'home';
        return (
          <div className="relative z-30 flex items-center justify-center gap-2 pb-2">
            <button
              onClick={() => handleSetStartPage(curPage.id)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 shadow-lg active:scale-95 backdrop-blur-xl border ${
                isStart ? 'bg-amber-400 text-slate-900 border-amber-300' : 'bg-white/70 text-slate-800 border-white/50'
              }`}
              title={isStart ? '当前起始页 · 再点取消' : '把「第 ' + (activePageIndex + 1) + ' 页」设为开机起始页'}
            >
              <House size={12} weight={isStart ? 'fill' : 'regular'} />
              {isStart ? '起始页 ✓' : '设为起始页'}
            </button>
            {curPage.items.length === 0 && pages.length > 1 && (
              <button
                onClick={() => handleRemovePage(activePageIndex)}
                className="px-3 py-1 rounded-full text-[11px] font-bold bg-red-500/85 text-white flex items-center gap-1 shadow-lg active:scale-95"
              >
                <X size={12} weight="bold" />移除空页
              </button>
            )}
            {(['left', 'right'] as const).map(direction => (
              <div key={direction} className="relative">
                <button
                  onClick={() => setAddPageMenu(m => (m === direction ? null : direction))}
                  title={direction === 'left' ? '在当前页左边插入新页' : '在当前页右边插入新页'}
                  className="px-3 py-1 rounded-full text-[11px] font-bold bg-white/70 text-slate-800 flex items-center gap-1 shadow-lg active:scale-95 backdrop-blur-xl border border-white/50"
                >
                  {direction === 'left'
                    ? <><CaretLeft size={12} weight="bold" /><Plus size={12} weight="bold" /></>
                    : <><Plus size={12} weight="bold" /><CaretRight size={12} weight="bold" /></>}
                </button>
                {addPageMenu === direction && (
                  <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 flex flex-col gap-1 p-1.5 rounded-2xl bg-white/95 backdrop-blur-xl border border-white/50 shadow-xl z-40 whitespace-nowrap">
                    <button
                      onClick={() => { handleAddPage(direction); setAddPageMenu(null); }}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-slate-800 hover:bg-slate-100 active:scale-95 text-left"
                    >
                      普通页
                    </button>
                    <button
                      onClick={() => { handleAddPage(direction, 'windmill'); setAddPageMenu(null); }}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-slate-800 hover:bg-slate-100 active:scale-95 text-left"
                    >
                      风车页
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Dock */}
      <LauncherDock
        dockApps={dockAppsConfig}
        totalUnread={totalUnread}
        openApp={openApp}
        acnh={acnh}
        paper={paper}
        bottomInset={launcherBottomInset}
        layoutEditing={layoutEditing}
      />

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

      <DesktopGalleryModal
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onAddWidget={(kind) => handleAddToCurrentPage({ kind })}
        onAddApp={(appId) => handleAddToCurrentPage({ kind: 'app', refId: appId })}
        existingKinds={existingKinds}
        placedAppIds={placedAppIds}
        targetLabel={`到第 ${activePageIndex + 1} 页`}
        initialTab={galleryInitialTab}
        acnh={acnh}
        paper={paper}
      />

      <ImagePickerModal
        isOpen={!!imagePicker}
        currentSrc={imagePicker?.src}
        onSave={(src) => { if (imagePicker) setItemConfigSrc(imagePicker.pageIndex, imagePicker.itemId, src); }}
        onClose={() => setImagePicker(null)}
        acnh={acnh}
        paper={paper}
      />

      {quadManagerTarget && (() => {
        const page = pages[quadManagerTarget.pageIndex];
        const item = page?.items.find(i => i.id === quadManagerTarget.itemId);
        if (!item) return null;
        return (
          <QuadAppPickerModal
            isOpen={true}
            onClose={() => setQuadManagerTarget(null)}
            onSelectApp={(appId, slotIdx) => handleSelectQuadApp(quadManagerTarget.pageIndex, item.id, slotIdx, appId)}
            onRemoveApp={(slotIdx) => handleRemoveQuadApp(quadManagerTarget.pageIndex, item.id, slotIdx)}
            slotIndex={quadManagerTarget.slotIndex}
            placedAppIds={placedAppIds}
            currentQuadAppIds={item.config?.apps}
            acnh={acnh}
            paper={paper}
          />
        );
      })()}
    </div>
  );
};

export default Launcher;
