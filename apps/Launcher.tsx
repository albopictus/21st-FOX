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
    GRID_COLS, GRID_ROWS, DEFAULT_LOCKED_KINDS,
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

  const [activePageIndex, setActivePageIndex] = useState(() => {
    if (_lastPageIndex < 0) {
      const pgs = theme.launcherPages || [];
      const idx = theme.launcherStartPageId ? pgs.findIndex(p => p.id === theme.launcherStartPageId) : -1;
      _lastPageIndex = idx >= 0 ? idx : 1; // 未设置 / 找不到 → 时钟那页
    }
    return Math.max(0, _lastPageIndex);
  });
  const activePageIndexRef = useRef(activePageIndex);
  useEffect(() => { activePageIndexRef.current = activePageIndex; }, [activePageIndex]);

  const handleSetStartPage = useCallback((pageId: string) => {
    const cur = theme.launcherStartPageId;
    void updateTheme({ launcherStartPageId: cur === pageId ? undefined : pageId });
  }, [theme.launcherStartPageId, updateTheme]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageGridRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 正方形格子：边长按实际容器自适应 —— 同时满足「4 列塞进宽度」和「8 行塞进高度」，取小的那个。
  // 夹在 [56, 128] 之间，网格整体水平居中。任何屏幕尺寸都合适。
  const GRID_GAP = 10; // px
  const PAGE_PAD_Y = 80; // pt-12 + pb-8 约值
  const [cellPx, setCellPx] = useState(80);
  useLayoutEffect(() => {
    const measure = () => {
      const el = scrollContainerRef.current;
      const w = el?.clientWidth || 380;
      const h = el?.clientHeight || 640;
      const byW = (w - 32 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
      const byH = (h - PAGE_PAD_Y - GRID_GAP * (GRID_ROWS - 1)) / GRID_ROWS;
      const size = Math.max(56, Math.min(128, Math.floor(Math.min(byW, byH))));
      setCellPx(prev => (prev === size ? prev : size));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && scrollContainerRef.current) ro.observe(scrollContainerRef.current);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const gridWidthPx = GRID_COLS * cellPx + (GRID_COLS - 1) * GRID_GAP;

  // ───────── 页面数据 ─────────
  const validAppIds = useMemo(
    () => new Set(
      INSTALLED_APPS
        .filter(a => !DOCK_APPS.includes(a.id) && (a.id !== AppID.CharCreatorDev || devDebugVisible))
        .map(a => a.id),
    ),
    [devDebugVisible],
  );

  const migratedPages = useMemo(
    () => migrateLegacyLauncher(theme, validAppIds),
    // 依赖旧字段：迁移只在没有 launcherPages 时才真正跑，有了就直接透传
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme.launcherPages, theme.launcherAppOrder, theme.launcherMinusOneApps,
     theme.launcherMinusOneWidgets, theme.launcherCustomPages, theme.launcherWidgets, validAppIds],
  );

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
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    const target = Math.max(0, Math.min(pagesRef.current.length - 1, _lastPageIndex));
    if (el && target > 0) {
      el.style.scrollBehavior = 'auto';
      el.scrollLeft = el.clientWidth * target;
      requestAnimationFrame(() => { el.style.scrollBehavior = 'smooth'; });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = () => {
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

  useEffect(() => () => { clearPress(); clearPageTurn(); gesture.current?.ghost?.remove(); }, []);

  const makeGhost = (el: HTMLElement) => {
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
    const r = el.getBoundingClientRect();
    const stride = cellPx + GRID_GAP; // 固定正方形格子的步距（getBoundingClientRect 已含滚动偏移）
    let col = Math.floor((clientX - r.left) / stride);
    let row = Math.floor((clientY - r.top) / stride);
    col = Math.max(0, Math.min(GRID_COLS - w, col));
    row = Math.max(0, Math.min(GRID_ROWS - h, row));
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
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;

    if (g.mode === 'resize' && g.item) {
      const meta = WIDGET_META[g.item.kind];
      const cell = cellFromPoint(g.fromPage!, e.clientX, e.clientY, 1, 1);
      if (!cell) return;
      let w = Math.max(meta.minW, Math.min(meta.maxW, cell.x - g.item.x + 1, GRID_COLS - g.item.x));
      let h = Math.max(meta.minH, Math.min(meta.maxH, cell.y - g.item.y + 1, GRID_ROWS - g.item.y));
      const ok = canPlace(pagesRef.current[g.fromPage!], { x: g.item.x, y: g.item.y, w, h }, g.item.id);
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
    const ok = canPlace(pagesRef.current[visPage], { x: cell.x, y: cell.y, w: item.w, h: item.h }, ignoreId);
    setDragPreview({ pageIndex: visPage, x: cell.x, y: cell.y, w: item.w, h: item.h, ok });
  };

  const onRootPointerUp = (e?: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (e && g && g.pointerId !== e.pointerId) return;
    clearPress();
    clearPageTurn();

    if (g?.active && g.mode === 'resize' && g.item) {
      const p = dragPreview;
      if (p && p.ok) replacePage(g.fromPage!, resizeItem(pagesRef.current[g.fromPage!], g.item.id, p.w, p.h));
    } else if (g?.active && g.mode === 'move' && g.item) {
      if (g.el) g.el.style.opacity = '';
      g.ghost?.remove();
      const p = dragPreview;
      if (p && p.ok) {
        if (p.pageIndex === g.fromPage) {
          replacePage(g.fromPage!, moveItem(pagesRef.current[g.fromPage!], g.item.id, p.x, p.y));
        } else {
          const src = removeItem(pagesRef.current[g.fromPage!], g.item.id);
          const placed = addItem(pagesRef.current[p.pageIndex], {
            kind: g.item.kind, refId: g.item.refId, w: g.item.w, h: g.item.h,
            locked: g.item.locked, title: g.item.title, config: g.item.config,
            x: p.x, y: p.y,
          });
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

  const finishEditing = () => { onRootPointerUp(); setLayoutEditing(false); };

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
    const placed = addItem(pagesRef.current[cur], { ...spec, w: size.w, h: size.h, locked });
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

  // 一页的自由网格（6 行铺满、行距宽松）。主屏(pageIndex===1)把它放在时钟+角色卡表头下面，
  // 其余页直接铺满整页。
  const renderPageGrid = (page: DesktopPage, pageIndex: number) => (
    <div
      ref={el => { pageGridRefs.current[pageIndex] = el; }}
      className="relative grid mx-auto"
      style={{
        gap: `${GRID_GAP}px`,
        width: `${gridWidthPx}px`,
        // 正方形格子：列宽 = 行高 = cellPx 固定，整块居中
        gridTemplateColumns: `repeat(${GRID_COLS}, ${cellPx}px)`,
        gridTemplateRows: `repeat(${GRID_ROWS}, ${cellPx}px)`,
        gridAutoRows: `${cellPx}px`,
        alignContent: 'start',
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
            <div className="w-full h-full overflow-hidden">{content}</div>

            {layoutEditing && (
              item.locked ? (
                <button
                  data-grid-action="lock"
                  onClick={(e) => { e.stopPropagation(); handleToggleLock(pageIndex, item.id); }}
                  className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center shadow-md active:scale-90 z-30"
                  title="已锁定 · 点击解锁"
                >
                  <Lock size={11} weight="fill" />
                </button>
              ) : (
                <>
                  <button
                    data-grid-action="delete"
                    onClick={(e) => { e.stopPropagation(); handleDeleteItem(pageIndex, item.id); }}
                    className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md active:scale-90 z-30 hover:bg-red-600"
                    title="移除"
                  >
                    <Minus size={11} weight="bold" />
                  </button>
                  {WIDGET_META[item.kind].defaultLocked && (
                    <button
                      data-grid-action="lock"
                      onClick={(e) => { e.stopPropagation(); handleToggleLock(pageIndex, item.id); }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-500 text-white flex items-center justify-center shadow-md active:scale-90 z-30"
                      title="锁定"
                    >
                      <LockOpen size={11} weight="fill" />
                    </button>
                  )}
                  {canResize(item.kind) && (
                    <button
                      data-grid-action="resize"
                      onPointerDown={(e) => onResizePointerDown(e, item, pageIndex)}
                      className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-white/90 text-slate-700 flex items-center justify-center shadow-md active:scale-90 z-30 cursor-nwse-resize"
                      title="拖动改大小"
                    >
                      <ArrowsOutSimple size={11} weight="bold" />
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

      {layoutEditing && (
        <div className="absolute -bottom-1 left-0 right-0 flex items-center justify-center gap-2 pointer-events-none">
          {(() => {
            const isStart = theme.launcherStartPageId
              ? theme.launcherStartPageId === page.id
              : pageIndex === 1; // 未设置时时钟那页算默认起始页
            return (
              <button
                onClick={() => handleSetStartPage(page.id)}
                className={`pointer-events-auto px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-md active:scale-95 ${
                  isStart ? 'bg-amber-400 text-slate-900' : 'bg-white/25 hover:bg-white/35'
                }`}
                style={isStart ? undefined : { color: contentColor }}
                title={isStart ? '当前起始页 · 再点取消（回默认时钟页）' : '设为开机起始页'}
              >
                <House size={11} weight={isStart ? 'fill' : 'regular'} />
                <span>{isStart ? '起始页' : '设为起始页'}</span>
              </button>
            );
          })()}
          {page.items.length === 0 && totalPages > 1 && (
            <button
              onClick={() => handleRemovePage(pageIndex)}
              className="pointer-events-auto px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/80 hover:bg-red-500 text-white flex items-center gap-1 shadow-md active:scale-95"
            >
              <X size={11} weight="bold" /><span>移除空页</span>
            </button>
          )}
          {pageIndex === totalPages - 1 && (
            <button
              onClick={handleAddPage}
              className="pointer-events-auto px-3 py-1 rounded-full text-[10px] font-bold bg-white/25 hover:bg-white/35 shadow-md active:scale-95"
              style={{ color: contentColor }}
            >
              <Plus size={11} weight="bold" className="inline mr-0.5" />新页面
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      data-launcher-root
      className="h-full w-full flex flex-col relative z-10 overflow-hidden font-sans select-none"
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
            className="w-full flex-shrink-0 snap-center snap-always h-full px-4 pt-12 pb-8 flex flex-col"
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
                <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">{renderPageGrid(page, pageIndex)}</div>
              </>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">{renderPageGrid(page, pageIndex)}</div>
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
