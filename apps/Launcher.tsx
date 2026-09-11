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
import { ImagePickerModal } from '../components/os/ImagePickerModal';
import { DesktopClockWidget } from '../components/os/widgets/DesktopClockWidget';
import { CharacterCardWidget } from '../components/os/widgets/CharacterCardWidget';
import {
    renderGridItemContent, WIDGET_META, defaultSizeFor,
    type WidgetRenderContext,
} from '../components/os/desktopWidgetRegistry';
import {
    GRID_COLS, GRID_ROWS, rowsForScreen, DEFAULT_LOCKED_KINDS,
    migrateLegacyLauncher, collectPlacedAppIds,
    emptyPage, addItem, removeItem, moveItem, resizeItem, toggleLock, canPlace,
} from '../utils/desktopGrid';
import { Plus, Minus, X, Lock, LockOpen, ArrowsOutSimple, House } from '@phosphor-icons/react';
import { getDailyScheduleForChar } from '../utils/dailySchedule';
import { useLocalDateKey } from '../hooks/useLocalDateKey';
import { resolveCharTimeZone } from '../utils/timezone';
import { trackEvent } from '../utils/analytics';

const CompanionHome = React.lazy(() => import('../components/os/CompanionHome'));

// --- 自由网格桌面 ---
// 每页 = GRID_COLS × GRID_ROWS 格子矩阵；App 与小组件都是 PlacedItem，按 (x,y,w,h) 摆，
// 允许任意留空。数据模型 / 纯逻辑见 utils/desktopGrid.ts，组件渲染见 desktopWidgetRegistry。
// DesktopClock / CharacterWidget / DesktopSquareImage 已抽到 components/os/widgets/。

// 跨 remount 记住停在第几页（从 App 返回时用）。-1 = 本次会话首次挂载，还没定位过 →
// 用 theme.launcherStartPageId 定起始页（未设置 = 时钟那页 pages[1]）。
let _lastPageIndex = -1;

const Launcher: React.FC = () => {
  const { openApp, characters, activeCharacterId, theme, updateTheme, lastMsgTimestamp, isDataLoaded, unreadMessages } = useOS();

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

  const [devDebugVisible, setDevDebugVisible] = useState(() => isDevDebugAvailable());
  useEffect(() => subscribeDevDebugAvailability(setDevDebugVisible), []);

  // 初始页在下面的 useLayoutEffect 里定位（要用到已迁移的 pages + startPageId）。这里先给个占位。
  const [activePageIndex, setActivePageIndex] = useState(() => Math.max(0, _lastPageIndex < 0 ? 1 : _lastPageIndex));
  const activePageIndexRef = useRef(activePageIndex);
  useEffect(() => { activePageIndexRef.current = activePageIndex; }, [activePageIndex]);
  const initialScrollDone = useRef(false);

  const handleSetStartPage = useCallback((pageId: string) => {
    const cur = theme.launcherStartPageId;
    void updateTheme({ launcherStartPageId: cur === pageId ? undefined : pageId });
  }, [theme.launcherStartPageId, updateTheme]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageGridRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 格子边长只按宽度算，不管高度——所有页用同一个 cellPx，处处正方形。
  // 行数按页不同（rowsForScreen：首页矮、其它页高），但格子本身大小不变，
  // 不会出现「切页时格子形状变了」。总网格高度 = 行数 × cellPx + 行距，超出可纵向滚动。
  // 间距照原项目的约定：横 gap-x-2(8px) / 竖 gap-y-6(24px) 不对称，竖向留够呼吸感，
  // 不然卡片圆角/阴影贴在一起会看着像重叠。页面左右留白也照原项目用 px-6(24px)。
  const PAGE_PAD_X = 24; // px-6
  const GRID_COL_GAP = 8;  // gap-x-2
  const GRID_ROW_GAP = 24; // gap-y-6
  const [cellPx, setCellPx] = useState(84);
  useLayoutEffect(() => {
    const measure = () => {
      const raw = scrollContainerRef.current?.clientWidth || 380;
      const w = Math.min(raw, 27 * 16); // 27rem 上限（宽屏收窄居中）
      const inner = w - PAGE_PAD_X * 2 - GRID_COL_GAP * (GRID_COLS - 1);
      // 下限 80：AppIcon md 尺寸自然高度(图标56+间距+文字标签) ≈ 77px，格子比这矮标签会被裁掉
      const size = Math.max(80, Math.floor(inner / GRID_COLS));
      setCellPx(prev => (prev === size ? prev : size));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
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
  // （未设置 = 时钟那页 pages[1]）；从 App 返回则回上次浏览页。定位完成前忽略 onScroll，
  // 免得容器刚挂载时 scrollLeft=0 触发的那次事件把落点覆盖成负一屏。
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    const pgs = pagesRef.current;
    let target: number;
    if (_lastPageIndex < 0) {
      const idx = theme.launcherStartPageId
        ? pgs.findIndex(p => p.id === theme.launcherStartPageId)
        : -1;
      target = idx >= 0 ? idx : Math.min(1, pgs.length - 1);
    } else {
      target = _lastPageIndex;
    }
    target = Math.max(0, Math.min(pgs.length - 1, target));
    _lastPageIndex = target;
    activePageIndexRef.current = target;
    setActivePageIndex(target);
    if (el) {
      el.style.scrollBehavior = 'auto';
      el.scrollLeft = el.clientWidth * target;
      requestAnimationFrame(() => {
        el.style.scrollBehavior = 'smooth';
        initialScrollDone.current = true;
      });
    } else {
      initialScrollDone.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = () => {
    if (!initialScrollDone.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActivePageIndex(index);
    activePageIndexRef.current = index;
    _lastPageIndex = index;
  };

  // 桌面鼠标拖拽翻页（非编辑态）
  const isMouseDragging = useRef(false);
  const mouseStartX = useRef(0);
  const mouseScrollLeft = useRef(0);
  const mouseMoved = useRef(0);
  const suppressClickUntil = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current || layoutEditing) return;
    isMouseDragging.current = true;
    mouseMoved.current = 0;
    mouseStartX.current = e.pageX - scrollContainerRef.current.offsetLeft;
    mouseScrollLeft.current = scrollContainerRef.current.scrollLeft;
    scrollContainerRef.current.style.scrollBehavior = 'auto';
    scrollContainerRef.current.style.scrollSnapType = 'none';
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (layoutEditing || !isMouseDragging.current || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollContainerRef.current.scrollLeft = mouseScrollLeft.current - (x - mouseStartX.current);
    mouseMoved.current = Math.abs(x - mouseStartX.current);
  };
  const handleMouseUp = () => {
    if (!isMouseDragging.current || !scrollContainerRef.current) return;
    isMouseDragging.current = false;
    if (mouseMoved.current > 5) suppressClickUntil.current = Date.now() + 200;
    scrollContainerRef.current.style.scrollBehavior = 'smooth';
    scrollContainerRef.current.style.scrollSnapType = 'x mandatory';
  };
  const handleClickCapture = (e: React.MouseEvent) => {
    if (mouseMoved.current > 5 || Date.now() < suppressClickUntil.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  // ───────── 编辑态：长按进入 + 拖拽 / 改大小 ─────────
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageTurnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageTurnDir = useRef<-1 | 0 | 1>(0);
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
    pageIndex: number; x: number; y: number; w: number; h: number; ok: boolean;
  }>(null);

  const clearPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); pressTimer.current = null; };
  const clearPageTurn = () => { if (pageTurnTimer.current) clearTimeout(pageTurnTimer.current); pageTurnTimer.current = null; pageTurnDir.current = 0; };

  // 长按桌面空白处（不是某个图标/组件）也能进整理态，不用非得按在图标上。
  const bgPressStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const onBackgroundPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (layoutEditing) return;
    if ((e.target as HTMLElement).closest('[data-grid-item], [data-grid-action]')) return;
    clearPress();
    bgPressStart.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    pressTimer.current = setTimeout(() => {
      if (!bgPressStart.current || bgPressStart.current.pointerId !== e.pointerId) return;
      bgPressStart.current = null;
      setLayoutEditing(true);
      trackEvent('进入桌面整理模式（空白处长按）');
    }, 520);
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
    return () => { clearPress(); clearPageTurn(); gesture.current?.ghost?.remove(); sweepStrayGhosts(); };
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
    const rows = rowsForScreen(pageIndex);
    const r = el.getBoundingClientRect();
    // 格子固定正方形边长；横竖间距不对称（照原项目 gap-x-2/gap-y-6），步距分开算
    let col = Math.floor((clientX - r.left) / (cellPx + GRID_COL_GAP));
    let row = Math.floor((clientY - r.top) / (cellPx + GRID_ROW_GAP));
    col = Math.max(0, Math.min(GRID_COLS - w, col));
    row = Math.max(0, Math.min(rows - h, row));
    return { x: col, y: row };
  };

  const queuePageTurn = (dir: -1 | 1) => {
    if (pageTurnDir.current === dir && pageTurnTimer.current) return;
    clearPageTurn();
    pageTurnDir.current = dir;
    const turn = () => {
      const g = gesture.current;
      const scroller = scrollContainerRef.current;
      if (!g?.active || g.mode !== 'move' || !scroller || pageTurnDir.current !== dir) { clearPageTurn(); return; }
      const next = Math.max(0, Math.min(totalPages - 1, activePageIndexRef.current + dir));
      if (next === activePageIndexRef.current) { clearPageTurn(); return; }
      activePageIndexRef.current = next;
      setActivePageIndex(next);
      _lastPageIndex = next;
      scroller.scrollTo({ left: scroller.clientWidth * next, behavior: 'smooth' });
      pageTurnTimer.current = setTimeout(turn, 760);
    };
    pageTurnTimer.current = setTimeout(turn, 560);
  };

  const onItemPointerDown = (e: React.PointerEvent, item: PlacedItem, pageIndex: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-grid-action]')) return; // 徽标按钮自己处理
    const rootEl = e.currentTarget as HTMLElement;
    const itemEl = (e.target as HTMLElement).closest<HTMLElement>('[data-grid-item]');
    clearPress();

    if (!layoutEditing) {
      // 长按进入整理
      pressTimer.current = setTimeout(() => {
        setLayoutEditing(true);
        trackEvent('进入桌面整理模式');
        suppressClickUntil.current = Date.now() + 700;
      }, 520);
      return;
    }

    if (item.locked || !itemEl) return; // 锁定项不可拖

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
  };

  const onResizePointerDown = (e: React.PointerEvent, item: PlacedItem, pageIndex: number) => {
    e.stopPropagation();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesture.current = {
      mode: 'resize', pointerId: e.pointerId, item, fromPage: pageIndex,
      startX: e.clientX, startY: e.clientY, active: true,
    };
    (e.target as HTMLElement).closest('[data-launcher-root]')?.setPointerCapture?.(e.pointerId);
    setDragPreview({ pageIndex, x: item.x, y: item.y, w: item.w, h: item.h, ok: true });
  };

  const onRootPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (bgPressStart.current && bgPressStart.current.pointerId === e.pointerId) {
      const dx = e.clientX - bgPressStart.current.x;
      const dy = e.clientY - bgPressStart.current.y;
      if (Math.hypot(dx, dy) > 10) { clearPress(); bgPressStart.current = null; }
      return; // 空白处手势不参与拖拽/改大小逻辑
    }
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;

    if (g.mode === 'resize' && g.item) {
      const meta = WIDGET_META[g.item.kind];
      const rows = rowsForScreen(g.fromPage!);
      const cell = cellFromPoint(g.fromPage!, e.clientX, e.clientY, 1, 1);
      if (!cell) return;
      let w = Math.max(meta.minW, Math.min(meta.maxW, cell.x - g.item.x + 1, GRID_COLS - g.item.x));
      let h = Math.max(meta.minH, Math.min(meta.maxH, cell.y - g.item.y + 1, rows - g.item.y));
      const ok = canPlace(pagesRef.current[g.fromPage!], { x: g.item.x, y: g.item.y, w, h }, g.item.id, GRID_COLS, rows);
      setDragPreview({ pageIndex: g.fromPage!, x: g.item.x, y: g.item.y, w, h, ok });
      return;
    }

    if (!g.active) {
      // 还没进入拖拽：横向大幅移动 → 当作翻页滑动
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (Math.hypot(dx, dy) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        clearPress();
        g.mode = 'scroll';
      }
      return;
    }

    if (g.mode === 'scroll') {
      const container = scrollContainerRef.current;
      if (container && g.scrollStartLeft !== undefined) {
        container.scrollLeft = g.scrollStartLeft - (e.clientX - g.startX);
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
    if (e.clientX <= rootRect.left + 64) queuePageTurn(-1);
    else if (e.clientX >= rootRect.right - 64) queuePageTurn(1);
    else clearPageTurn();

    const visPage = activePageIndexRef.current;
    const item = g.item!;
    const cell = cellFromPoint(visPage, e.clientX - (g.grabDX || 0) + 1, e.clientY - (g.grabDY || 0) + 1, item.w, item.h);
    if (!cell) { setDragPreview(null); return; }
    const ignoreId = visPage === g.fromPage ? item.id : undefined;
    const ok = canPlace(pagesRef.current[visPage], { x: cell.x, y: cell.y, w: item.w, h: item.h }, ignoreId, GRID_COLS, rowsForScreen(visPage));
    setDragPreview({ pageIndex: visPage, x: cell.x, y: cell.y, w: item.w, h: item.h, ok });
  };

  const onRootPointerUp = (e?: React.PointerEvent<HTMLDivElement>) => {
    bgPressStart.current = null;
    const g = gesture.current;
    // pointerId 对不上（多指 / 系统手势打断了原来那根手指的序列）也不能放过残影：
    // 真正拥有这个手势的 gesture.ghost 清一遍，再顺手扫场一次兜底。
    if (e && g && g.pointerId !== e.pointerId) { g.ghost?.remove(); sweepStrayGhosts(); return; }
    clearPress();
    clearPageTurn();

    if (g?.active && g.mode === 'resize' && g.item) {
      const p = dragPreview;
      if (p && p.ok) replacePage(g.fromPage!, resizeItem(pagesRef.current[g.fromPage!], g.item.id, p.w, p.h, GRID_COLS, rowsForScreen(g.fromPage!)));
    } else if (g?.active && g.mode === 'move' && g.item) {
      if (g.el) g.el.style.opacity = '';
      g.ghost?.remove();
      const p = dragPreview;
      if (p && p.ok) {
        if (p.pageIndex === g.fromPage) {
          replacePage(g.fromPage!, moveItem(pagesRef.current[g.fromPage!], g.item.id, p.x, p.y, GRID_COLS, rowsForScreen(g.fromPage!)));
        } else {
          const src = removeItem(pagesRef.current[g.fromPage!], g.item.id);
          const placed = addItem(pagesRef.current[p.pageIndex], {
            kind: g.item.kind, refId: g.item.refId, w: g.item.w, h: g.item.h,
            locked: g.item.locked, title: g.item.title, config: g.item.config,
            x: p.x, y: p.y,
          }, GRID_COLS, rowsForScreen(p.pageIndex));
          const next = pagesRef.current.map((pg, i) =>
            i === g.fromPage ? src : i === p.pageIndex ? (placed?.page ?? pg) : pg);
          commitPages(next);
        }
      } else if (g.el) {
        g.el.style.opacity = '';
      }
      suppressClickUntil.current = Date.now() + 400;
    } else if (g?.el) {
      g.el.style.opacity = '';
      g.ghost?.remove();
    }
    setDragPreview(null);
    gesture.current = null;
  };

  const finishEditing = () => { onRootPointerUp(); sweepStrayGhosts(); setLayoutEditing(false); };

  // ───────── 条目增删 / 页面增删 ─────────
  const handleDeleteItem = useCallback((pageIndex: number, itemId: string) => {
    replacePage(pageIndex, removeItem(pagesRef.current[pageIndex], itemId));
    trackEvent('桌面移除条目');
  }, [replacePage]);

  const handleToggleLock = useCallback((pageIndex: number, itemId: string) => {
    replacePage(pageIndex, toggleLock(pagesRef.current[pageIndex], itemId));
  }, [replacePage]);

  const handleAddToCurrentPage = useCallback((spec: { kind: GridItemKind; refId?: string }) => {
    const cur = activePageIndexRef.current;
    const size = defaultSizeFor(spec.kind);
    const locked = DEFAULT_LOCKED_KINDS.has(spec.kind);
    const placed = addItem(pagesRef.current[cur], { ...spec, w: size.w, h: size.h, locked }, GRID_COLS, rowsForScreen(cur));
    if (placed) {
      replacePage(cur, placed.page);
    } else {
      // 当前页放不下 → 在它后面插一张新页
      const np = emptyPage();
      const res = addItem(np, { ...spec, w: size.w, h: size.h, locked });
      const next = [...pagesRef.current.slice(0, cur + 1), res ? res.page : np, ...pagesRef.current.slice(cur + 1)];
      commitPages(next);
    }
    trackEvent('桌面添加条目', { kind: spec.kind });
  }, [replacePage, commitPages]);

  const handleAddPage = useCallback(() => {
    commitPages([...pagesRef.current, emptyPage()]);
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

  // ───────── 主题派生 ─────────
  const contentColor = theme.contentColor || '#ffffff';
  const acnh = theme.skin === 'animalcrossing';
  const paper = theme.skin !== 'animalcrossing' && theme.skin !== 'mobilegame' && theme.skin !== 'tamagotchi' && isPaperWallpaper(theme.wallpaper);
  const launcherBottomInset = '1.25rem';
  const totalUnread = Object.values(unreadMessages).reduce((a, b) => a + b, 0);
  const widgetUnread = widgetChar && unreadMessages[widgetChar.id] ? unreadMessages[widgetChar.id] : 0;

  const widgetCtx: WidgetRenderContext = {
    contentColor, acnh, paper, editing: layoutEditing,
    openApp: (id: string) => openApp(id as AppID),
    anniversaries, characters,
    widgetChar, unreadCount: widgetUnread, lastMessage,
    onOpenCharCard: () => openApp(AppID.Chat),
    scheduleData, scheduleChar,
    onOpenSchedule: () => { setScheduleViewerOpen(true); trackEvent('打开角色日程面板'); },
    onEditImage: openImagePicker,
  };

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

  const canResize = (kind: GridItemKind) => {
    const m = WIDGET_META[kind];
    return kind !== 'app' && (m.maxW > m.minW || m.maxH > m.minH);
  };

  // 一页的自由网格：固定边长的正方形格子，4 列 × rowsForScreen(pageIndex) 行。
  // 格子大小处处一样（不随页高变），总高度随行数变化，超出纵向滚动。
  const renderPageGrid = (page: DesktopPage, pageIndex: number) => (
    <div
      ref={el => { pageGridRefs.current[pageIndex] = el; }}
      className="relative grid mx-auto"
      style={{
        columnGap: `${GRID_COL_GAP}px`,
        rowGap: `${GRID_ROW_GAP}px`,
        width: `${gridWidthPx}px`,
        gridTemplateColumns: `repeat(${GRID_COLS}, ${cellPx}px)`,
        gridTemplateRows: `repeat(${rowsForScreen(pageIndex)}, ${cellPx}px)`,
        gridAutoRows: `${cellPx}px`,
      }}
    >
      {page.items.map(item => {
        const content = renderGridItemContent(item, widgetCtx);
        if (content == null) return null;
        const draggable = layoutEditing && !item.locked;
        return (
          <div
            key={item.id}
            data-grid-item={item.id}
            className={`relative min-w-0 min-h-0 ${item.kind === 'app' ? 'flex items-center justify-center' : ''} ${draggable ? 'launcher-edit-wobble' : ''}`}
            style={{
              gridColumn: `${item.x + 1} / span ${item.w}`,
              gridRow: `${item.y + 1} / span ${item.h}`,
              touchAction: layoutEditing ? 'none' : undefined,
            }}
            onPointerDown={(e) => onItemPointerDown(e, item, pageIndex)}
          >
            {/* 非 app 的小组件卡片自带 box-shadow：留 3px 内缩空隙让阴影能完整画出来，
                不然卡片严丝合缝贴着这层 overflow-hidden 的裁切边，阴影会被贴边裁得
                东一块西一块（圆角处漏一点、直边处全被裁掉），看着很诡异。 */}
            <div className={`w-full h-full overflow-hidden ${item.kind === 'app' ? 'flex items-center justify-center' : 'p-[3px]'}`}>{content}</div>

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
                    className="absolute top-1 left-1 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md active:scale-90 z-30 hover:bg-red-600"
                    title="移除"
                  >
                    <Minus size={13} weight="bold" />
                  </button>
                  {WIDGET_META[item.kind].defaultLocked && (
                    <button
                      data-grid-action="lock"
                      onClick={(e) => { e.stopPropagation(); handleToggleLock(pageIndex, item.id); }}
                      className="absolute top-1 right-1 w-7 h-7 rounded-full bg-slate-500 text-white flex items-center justify-center shadow-md active:scale-90 z-30"
                      title="锁定"
                    >
                      <LockOpen size={13} weight="fill" />
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
        <div
          className="pointer-events-none rounded-2xl border-2 border-dashed z-20"
          style={{
            gridColumn: `${dragPreview.x + 1} / span ${dragPreview.w}`,
            gridRow: `${dragPreview.y + 1} / span ${dragPreview.h}`,
            borderColor: dragPreview.ok ? 'rgba(255,255,255,0.7)' : 'rgba(239,68,68,0.8)',
            background: dragPreview.ok ? 'rgba(255,255,255,0.12)' : 'rgba(239,68,68,0.12)',
          }}
        />
      )}

    </div>
  );

  return (
    <div
      data-launcher-root
      className="h-full w-full flex flex-col relative z-10 overflow-hidden font-sans select-none"
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onRootPointerMove}
      onPointerUp={onRootPointerUp}
      onPointerCancel={onRootPointerUp}
      onContextMenu={(e) => { if ((e.target as HTMLElement).closest('[data-grid-item]')) e.preventDefault(); }}
    >
      <style>{`
        .launcher-drag-ghost { opacity:.96; filter: drop-shadow(0 12px 14px rgba(75,65,54,.18)); }
        .launcher-edit-wobble { animation: launcherWobble 2.4s ease-in-out infinite; }
        @keyframes launcherWobble { 0%,100%{transform:rotate(-0.5deg)} 50%{transform:rotate(0.5deg)} }
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
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClickCapture={handleClickCapture}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory no-scrollbar cursor-grab active:cursor-grabbing"
        style={{
          scrollBehavior: 'smooth', overscrollBehaviorX: 'contain', overscrollBehaviorY: 'none',
          touchAction: layoutEditing ? 'none' : 'pan-x pan-y',
          willChange: 'scroll-position', contain: 'layout paint', transform: 'translateZ(0)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {pages.map((page, pageIndex) => (
          <div
            key={page.id}
            className="w-full flex-shrink-0 snap-center snap-always h-full px-6 pt-12 pb-8 flex flex-col"
            style={{ contentVisibility: 'auto', contain: 'layout paint', transform: 'translateZ(0)' }}
          >
            {pageIndex === 1 ? (
              <>
                {/* 主屏表头：时钟 + 角色卡，原生流式、贴顶、不可删。宽度与下方网格对齐居中 */}
                <div className="shrink-0 w-full mx-auto" style={{ maxWidth: `${gridWidthPx}px` }}>
                  <DesktopClockWidget />
                  <CharacterCardWidget
                    char={widgetChar}
                    unreadCount={widgetUnread}
                    lastMessage={lastMessage}
                    onClick={() => openApp(AppID.Chat)}
                    contentColor={contentColor}
                    paper={paper}
                  />
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar" style={{ overscrollBehaviorY: 'contain' }}>{renderPageGrid(page, pageIndex)}</div>
              </>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar" style={{ overscrollBehaviorY: 'contain' }}>{renderPageGrid(page, pageIndex)}</div>
            )}
          </div>
        ))}
      </div>

      {/* 页码点 */}
      <div
        className="absolute left-0 w-full flex justify-center gap-1 pointer-events-none z-20"
        style={{ bottom: `calc(${launcherBottomInset} + 5.5rem)` }}
        aria-hidden="true"
      >
        {Array.from({ length: totalPages }).map((_, i) => (
          <div key={i} className="flex h-1.5 w-4 shrink-0 items-center justify-center">
            <div
              className={`h-1.5 rounded-full transform-gpu transition-[width,opacity] duration-300 ${activePageIndex === i ? 'w-4 opacity-100' : 'w-1.5 opacity-40'}`}
              style={{ backgroundColor: contentColor }}
            />
          </div>
        ))}
      </div>

      {/* 编辑态：当前页控件（起始页 / 增删页），放在固定栏与网格之间，方便单手点击 */}
      {layoutEditing && (() => {
        const curPage = pages[activePageIndex];
        if (!curPage) return null;
        const isStart = theme.launcherStartPageId
          ? theme.launcherStartPageId === curPage.id
          : activePageIndex === 1;
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
            <button
              onClick={handleAddPage}
              className="px-3 py-1 rounded-full text-[11px] font-bold bg-white/70 text-slate-800 flex items-center gap-1 shadow-lg active:scale-95 backdrop-blur-xl border border-white/50"
            >
              <Plus size={12} weight="bold" />新页面
            </button>
          </div>
        );
      })()}

      {/* Dock */}
      <div className="mt-auto flex justify-center w-full px-4 relative z-30" style={{ paddingBottom: launcherBottomInset }}>
        <div
          className={`rounded-[1.75rem] px-4 py-3 flex gap-3 sm:gap-6 items-center mx-auto max-w-full justify-between overflow-x-auto no-scrollbar transform-gpu ${acnh || paper ? '' : 'bg-white/30 border border-white/25 shadow-[0_8px_40px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.08)]'}`}
          style={acnh ? { background: 'transparent' } : paper ? { background: 'rgba(224,221,215,0.42)', border: '1px solid rgba(91,72,51,0.07)', boxShadow: '0 6px 18px rgba(91,72,51,0.065)' } : undefined}
        >
          {dockAppsConfig.map(app => (
            <div key={app.id} className="relative">
              <AppIcon app={app} onClick={() => openApp(app.id)} variant="dock" size="md" />
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
    </div>
  );
};

export default Launcher;
