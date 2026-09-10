/**
 * 自由网格桌面（Android 式）—— 纯逻辑层，不碰 UI。
 *
 * 模型：每页是 GRID_COLS × GRID_ROWS 的格子矩阵；App 与小组件都是 PlacedItem，
 * 按 (x,y,w,h) 摆在格子上，允许任意留空。这一份取代旧的
 * launcherAppOrder / launcherCustomPages / launcherMinusOne* / launcherPinwheelOrder。
 *
 * 所有 page 操作都返回**新对象**（不改入参），方便 React setState / 撤销。
 */
import type {
    OSTheme,
    DesktopPage,
    PlacedItem,
    GridItemKind,
    DesktopWidgetInstance,
} from '../types';

export const GRID_COLS = 4;
export const GRID_ROWS = 8;

/** 每种条目的默认尺寸（格数）。app 恒为 1×1。 */
export const DEFAULT_ITEM_SIZE: Record<GridItemKind, { w: number; h: number }> = {
    app: { w: 1, h: 1 },
    clock: { w: 4, h: 3 },
    charCard: { w: 4, h: 2 },
    schedule: { w: 4, h: 2 },
    music: { w: 2, h: 2 },
    image: { w: 2, h: 2 },
    calendar: { w: 4, h: 3 },
    anniversary: { w: 4, h: 2 },
    memo: { w: 2, h: 2 },
};

/** 默认锁定（不可拖 / 改大小 / 删，除非在编辑态解锁）的条目。 */
export const DEFAULT_LOCKED_KINDS: ReadonlySet<GridItemKind> = new Set(['schedule']);

/**
 * 主屏表头专属：时钟 + 角色卡不是网格条目，由 Launcher 在第 1 页顶部单独渲染
 * （原生流式布局，贴顶，不可删）。它们绝不出现在 page.items 里。
 */
export const HEADER_ONLY_KINDS: ReadonlySet<GridItemKind> = new Set(['clock', 'charCard']);

let _seq = 0;
export const makeItemId = (kind: string): string =>
    `gi-${kind}-${Date.now().toString(36)}-${(_seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const makePageId = (): string =>
    `pg-${Date.now().toString(36)}-${(_seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// ───────────────────────── 几何 ─────────────────────────

type Rect = { x: number; y: number; w: number; h: number };

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const withinGrid = (
    r: Rect,
    cols: number = GRID_COLS,
    rows: number = GRID_ROWS,
): boolean =>
    Number.isInteger(r.x) && Number.isInteger(r.y) &&
    r.w > 0 && r.h > 0 &&
    r.x >= 0 && r.y >= 0 &&
    r.x + r.w <= cols && r.y + r.h <= rows;

/**
 * rect 能否放进 page：在网格内，且不与其它条目重叠。
 * ignoreId：移动 / 改大小时忽略条目自身。
 */
export const canPlace = (
    page: DesktopPage,
    rect: Rect,
    ignoreId?: string,
    cols: number = GRID_COLS,
    rows: number = GRID_ROWS,
): boolean => {
    if (!withinGrid(rect, cols, rows)) return false;
    return !page.items.some(it => it.id !== ignoreId && rectsOverlap(it, rect));
};

/** 行优先扫描，返回第一个能放下 w×h 的左上角坐标；放不下返回 null。 */
export const findFreeRect = (
    page: DesktopPage,
    w: number,
    h: number,
    cols: number = GRID_COLS,
    rows: number = GRID_ROWS,
): { x: number; y: number } | null => {
    if (w <= 0 || h <= 0 || w > cols || h > rows) return null;
    for (let y = 0; y + h <= rows; y++) {
        for (let x = 0; x + w <= cols; x++) {
            if (canPlace(page, { x, y, w, h }, undefined, cols, rows)) return { x, y };
        }
    }
    return null;
};

// ───────────────────────── 单页操作 ─────────────────────────

export const emptyPage = (id: string = makePageId()): DesktopPage => ({ id, items: [] });

export interface NewItemSpec {
    kind: GridItemKind;
    refId?: string;
    w?: number;
    h?: number;
    locked?: boolean;
    title?: string;
    config?: Record<string, any>;
    /** 指定落点；不传或放不下则自动找空位。 */
    x?: number;
    y?: number;
}

/**
 * 往页里加一个条目。返回 { page, item }（新页 + 新条目），整页放不下返回 null。
 */
export const addItem = (
    page: DesktopPage,
    spec: NewItemSpec,
    cols: number = GRID_COLS,
    rows: number = GRID_ROWS,
): { page: DesktopPage; item: PlacedItem } | null => {
    const size = DEFAULT_ITEM_SIZE[spec.kind] || { w: 1, h: 1 };
    const w = spec.w ?? size.w;
    const h = spec.h ?? size.h;

    let pos: { x: number; y: number } | null = null;
    if (spec.x != null && spec.y != null && canPlace(page, { x: spec.x, y: spec.y, w, h }, undefined, cols, rows)) {
        pos = { x: spec.x, y: spec.y };
    } else {
        pos = findFreeRect(page, w, h, cols, rows);
    }
    if (!pos) return null;

    const item: PlacedItem = {
        id: makeItemId(spec.kind),
        kind: spec.kind,
        ...(spec.refId != null ? { refId: spec.refId } : {}),
        x: pos.x, y: pos.y, w, h,
        ...(spec.locked ? { locked: true } : {}),
        ...(spec.title != null ? { title: spec.title } : {}),
        ...(spec.config != null ? { config: spec.config } : {}),
    };
    return { page: { ...page, items: [...page.items, item] }, item };
};

export const removeItem = (page: DesktopPage, itemId: string): DesktopPage =>
    ({ ...page, items: page.items.filter(it => it.id !== itemId) });

/** 移动条目到 (x,y)。放不下（越界 / 撞其它条目）返回原页不变。 */
export const moveItem = (
    page: DesktopPage,
    itemId: string,
    x: number,
    y: number,
    cols: number = GRID_COLS,
    rows: number = GRID_ROWS,
): DesktopPage => {
    const it = page.items.find(i => i.id === itemId);
    if (!it) return page;
    if (!canPlace(page, { x, y, w: it.w, h: it.h }, itemId, cols, rows)) return page;
    return { ...page, items: page.items.map(i => i.id === itemId ? { ...i, x, y } : i) };
};

/** 改大小（左上角不动）。放不下返回原页不变。 */
export const resizeItem = (
    page: DesktopPage,
    itemId: string,
    w: number,
    h: number,
    cols: number = GRID_COLS,
    rows: number = GRID_ROWS,
): DesktopPage => {
    const it = page.items.find(i => i.id === itemId);
    if (!it) return page;
    if (!canPlace(page, { x: it.x, y: it.y, w, h }, itemId, cols, rows)) return page;
    return { ...page, items: page.items.map(i => i.id === itemId ? { ...i, w, h } : i) };
};

export const toggleLock = (page: DesktopPage, itemId: string): DesktopPage =>
    ({ ...page, items: page.items.map(i => i.id === itemId ? { ...i, locked: !i.locked } : i) });

// ───────────────────────── 跨页操作 ─────────────────────────

/**
 * 把一串条目规格顺序铺进若干页：当前页放不下就开新页。
 * 用于迁移和「批量恢复」。startPages 里已有的条目（如锁定的三块）会被绕开。
 */
export const flowItems = (
    startPages: DesktopPage[],
    specs: NewItemSpec[],
    cols: number = GRID_COLS,
    rows: number = GRID_ROWS,
): DesktopPage[] => {
    const pages = startPages.length ? startPages.map(p => ({ ...p, items: [...p.items] })) : [emptyPage()];
    let pi = 0;
    for (const spec of specs) {
        // 从当前页往后找第一个放得下的页
        let placed = false;
        while (pi < pages.length) {
            const res = addItem(pages[pi], spec, cols, rows);
            if (res) { pages[pi] = res.page; placed = true; break; }
            pi++;
        }
        if (!placed) {
            const fresh = emptyPage();
            const res = addItem(fresh, spec, cols, rows);
            pages.push(res ? res.page : fresh);
            pi = pages.length - 1;
        }
    }
    return pages;
};

export const addPage = (pages: DesktopPage[]): DesktopPage[] => [...pages, emptyPage()];

/** 按阅读顺序（先 y 后 x）把条目重新贴到左上角，去掉空洞。锁定项也一起重排。 */
export const compactPage = (
    page: DesktopPage,
    cols: number = GRID_COLS,
    rows: number = GRID_ROWS,
): DesktopPage => {
    const sorted = [...page.items].sort((a, b) => (a.y - b.y) || (a.x - b.x));
    let out: DesktopPage = { ...page, items: [] };
    for (const it of sorted) {
        const pos = findFreeRect(out, it.w, it.h, cols, rows);
        out = { ...out, items: [...out.items, pos ? { ...it, x: pos.x, y: pos.y } : it] };
    }
    return out;
};

/** 从每页剔除表头专属条目（clock / charCard），然后压实。给「已迁移过的旧数据」纠偏用。 */
export const stripHeaderKinds = (pages: DesktopPage[]): DesktopPage[] => {
    let changed = false;
    const next = pages.map(p => {
        const kept = p.items.filter(it => !HEADER_ONLY_KINDS.has(it.kind));
        if (kept.length === p.items.length) return p;
        changed = true;
        return compactPage({ ...p, items: kept });
    });
    return changed ? next : pages;
};

/** 删除某页（纯 splice；调用方负责「非空页要不要确认 / 搬移」）。至少保留 1 页。 */
export const removePage = (pages: DesktopPage[], index: number): DesktopPage[] => {
    if (index < 0 || index >= pages.length || pages.length <= 1) return pages;
    return pages.filter((_, i) => i !== index);
};

// ───────────────────────── 迁移 ─────────────────────────

/** 旧 DesktopWidgetInstance.kind → 新 GridItemKind（quad_apps 无实现，丢弃）。 */
const LEGACY_WIDGET_KIND: Partial<Record<string, GridItemKind>> = {
    music: 'music', image: 'image', calendar: 'calendar', anniversary: 'anniversary', memo: 'memo',
};

const legacyWidgetSpec = (w: DesktopWidgetInstance): NewItemSpec | null => {
    const kind = LEGACY_WIDGET_KIND[w.kind];
    if (!kind) return null;
    const size = w.size === '4x2' ? { w: 4, h: 2 } : w.size === '2x2' ? { w: 2, h: 2 } : undefined;
    return { kind, ...(size || {}), ...(w.title != null ? { title: w.title } : {}), ...(w.config != null ? { config: w.config } : {}) };
};

const dedupe = (ids: (string | undefined | null)[], valid: Set<string>): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
        if (!id || seen.has(id) || !valid.has(id)) continue;
        seen.add(id); out.push(id);
    }
    return out;
};

/**
 * 旧 launcher 字段 → launcherPages。已经有 launcherPages 就原样返回。
 *
 * 页序：
 *   [0] 负一屏  = launcherMinusOneApps（+ 遗留的 launcherMinusOneWidgets）
 *   [1] 主屏    = 部分 app（时钟 / 角色卡是 Launcher 单独渲染的表头，不是条目）
 *   [2] 原风车页 = schedule（锁定）+ music + image + 部分 app
 *   [3+] 剩余 app + 自定义页小组件，按需开页
 *
 * 已经有 launcherPages 就只做纠偏：剔掉早期版本误塞进去的 clock / charCard 条目。
 *
 * @param validAppIds 允许出现在网格上的 AppID 集合（调用方已排除 dock / 隐藏 / 未解锁的 dev app）
 */
export const migrateLegacyLauncher = (
    theme: Pick<OSTheme,
        | 'launcherPages' | 'launcherAppOrder' | 'launcherMinusOneApps'
        | 'launcherMinusOneWidgets' | 'launcherCustomPages' | 'launcherWidgets'
    >,
    validAppIds: Set<string>,
): DesktopPage[] => {
    if (theme.launcherPages && theme.launcherPages.length) return stripHeaderKinds(theme.launcherPages);

    // ── Page 0：负一屏 ──
    let page0 = emptyPage();
    for (const id of dedupe(theme.launcherMinusOneApps || [], validAppIds)) {
        const res = addItem(page0, { kind: 'app', refId: id });
        if (res) page0 = res.page; // 满了就丢弃多出来的（负一屏 24 格，极少超）
    }
    for (const w of theme.launcherMinusOneWidgets || []) {
        const spec = legacyWidgetSpec(w);
        if (!spec) continue;
        const res = addItem(page0, spec);
        if (res) page0 = res.page;
    }

    // ── Page 1：主屏（时钟 + 角色卡是表头，不在这里；app 从顶格铺起）──
    const page1 = emptyPage();

    // ── Page 2：原风车页（锁定的日程 + 音乐 + 相框）──
    let page2 = emptyPage();
    page2 = (addItem(page2, { kind: 'schedule', locked: true, x: 0, y: 0 }) || { page: page2 }).page;
    page2 = (addItem(page2, { kind: 'music', x: 0, y: 2 }) || { page: page2 }).page;
    page2 = (addItem(page2, {
        kind: 'image', x: 2, y: 2,
        ...(theme.launcherWidgets?.dsq ? { config: { src: theme.launcherWidgets.dsq } } : {}),
    }) || { page: page2 }).page;

    // ── 待铺的流：主桌面 app + 自定义页小组件 + 旧的 tl/tr/wide 条幅图 ──
    const appSpecs: NewItemSpec[] = dedupe(theme.launcherAppOrder || [], validAppIds)
        .map(id => ({ kind: 'app' as GridItemKind, refId: id }));
    const widgetSpecs: NewItemSpec[] = (theme.launcherCustomPages || [])
        .flatMap(p => p.widgets || [])
        .map(legacyWidgetSpec)
        .filter((s): s is NewItemSpec => !!s);
    const lw = theme.launcherWidgets || {};
    const legacyImageSpecs: NewItemSpec[] = ([
        lw.tl ? { kind: 'image', w: 2, h: 2, config: { src: lw.tl } } : null,
        lw.tr ? { kind: 'image', w: 2, h: 2, config: { src: lw.tr } } : null,
        lw.wide ? { kind: 'image', w: 4, h: 2, config: { src: lw.wide } } : null,
    ] as (NewItemSpec | null)[]).filter((s): s is NewItemSpec => s !== null);

    // app 先铺（从 page1 开始，绕开锁定块），再铺自定义页小组件 + 旧条幅图
    let pages = flowItems([page1, page2], [...appSpecs, ...widgetSpecs, ...legacyImageSpecs]);

    return [page0, ...pages];
};

/** 网格上所有页里出现过的 AppID（用于算「哪些 app 还没上桌 / 已隐藏」）。 */
export const collectPlacedAppIds = (pages: DesktopPage[]): Set<string> => {
    const s = new Set<string>();
    for (const p of pages) for (const it of p.items) if (it.kind === 'app' && it.refId) s.add(it.refId);
    return s;
};
