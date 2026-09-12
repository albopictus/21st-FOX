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
export const GRID_ROWS = 6;

/**
 * 主屏（Screen 1）表头下面的网格只有这么高：时钟+角色卡占了大半屏，硬塞 GRID_ROWS
 * 行会把每行压得很扁（组件截断、圆角看着像被切掉）。所以主屏单独给一个更小的行数，
 * 行高和其它页保持一致（不挤压）。
 */
export const HOME_PAGE_ROWS = 2;
export const WINDMILL_PAGE_ROWS = 6;
export const APP_PAGE_ROWS = 6;

/**
 * 某个 Screen 的网格行数。优先看 page.layout 标记（'home' 认作主屏矮行数，
 * 不管它现在被摆在第几页——主屏可以被用户挪到任意下标）；没打标记的旧数据
 * 才退回到"下标 1 = 主屏"这条兜底规则。0/2 已经和 3+ 同值(6)，只是历史遗留区分。
 */
export const rowsForScreen = (screenIndex: number, page?: DesktopPage): number => {
    // layout:'home' 优先级最高：主屏被挪到哪个下标都要认出矮行数。
    if (page?.layout === 'home') return HOME_PAGE_ROWS;
    // 其它情况维持原优先级：下标 1（旧数据没打 home 标记时的兜底）先于
    // 'windmill'/'standard' 这两个纯语义标记。
    if (screenIndex === 1) return HOME_PAGE_ROWS;
    if (page?.layout === 'windmill') return WINDMILL_PAGE_ROWS;
    if (page?.layout === 'standard') return APP_PAGE_ROWS;
    if (screenIndex === 0 || screenIndex === 2) return WINDMILL_PAGE_ROWS;
    return APP_PAGE_ROWS;
};

/**
 * 主屏在 pages 数组里的下标：优先找打了 layout:'home' 标记的那一页（可能被用户
 * 挪到任意位置），找不到（旧数据还没打过标记）就退回"下标 1"兜底。
 */
export const findHomeIndex = (pages: DesktopPage[]): number => {
    const tagged = pages.findIndex(p => p.layout === 'home');
    if (tagged >= 0) return tagged;
    return Math.min(1, pages.length - 1);
};

/** 旧数据里还没有任何一页打 layout:'home' 标记时，给兜底识别出的那一页补上标记一次。 */
export const ensureHomeTag = (pages: DesktopPage[]): DesktopPage[] => {
    if (pages.length === 0 || pages.some(p => p.layout === 'home')) return pages;
    const idx = findHomeIndex(pages);
    return pages.map((p, i) => (i === idx ? { ...p, layout: 'home' as const } : p));
};

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
    quad_apps: { w: 2, h: 2 },
    study_paper: { w: 2, h: 2 },
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

export interface DisplacementResult {
    ok: boolean;
    displacedItems: Map<string, { x: number; y: number }>;
}

/**
 * 尝试将目标区域 rect 放置在 page 中并挤开原本在该位置的条目：
 * - 若 rect 越界，返回 null。
 * - 若无重叠，返回 { ok: true, displacedItems: Map() }。
 * - 若碰撞条目中包含锁定条目（locked），返回 null（锁定项不可挤开）。
 * - 为所有被碰撞的条目寻找离其最近的可用空格（优先相邻格子及拖拽项腾出的原位置）。
 * - 若所有碰撞条目均成功找到新空位，返回 { ok: true, displacedItems }。
 * - 若网格无足够空位安放被碰撞条目，返回 null。
 */
export const tryDisplace = (
    page: DesktopPage,
    rect: Rect,
    ignoreId?: string,
    cols: number = GRID_COLS,
    rows: number = GRID_ROWS,
): DisplacementResult | null => {
    if (!withinGrid(rect, cols, rows)) return null;

    const colliding = page.items.filter(it => it.id !== ignoreId && rectsOverlap(it, rect));
    if (colliding.length === 0) {
        return { ok: true, displacedItems: new Map() };
    }

    if (colliding.some(it => it.locked)) {
        return null;
    }

    const collidingIds = new Set(colliding.map(c => c.id));
    const occupiedByOthers: Rect[] = page.items
        .filter(it => it.id !== ignoreId && !collidingIds.has(it.id))
        .map(it => ({ x: it.x, y: it.y, w: it.w, h: it.h }));

    occupiedByOthers.push(rect);

    const displacedItems = new Map<string, { x: number; y: number }>();
    const currentOccupied = [...occupiedByOthers];

    const sortedColliding = [...colliding].sort((a, b) => (b.w * b.h - a.w * a.h) || a.y - b.y || a.x - b.x);

    const ignoreItem = ignoreId ? page.items.find(it => it.id === ignoreId) : undefined;

    for (const item of sortedColliding) {
        const candidates: { x: number; y: number; dist: number }[] = [];

        for (let y = 0; y + item.h <= rows; y++) {
            for (let x = 0; x + item.w <= cols; x++) {
                const candidateRect: Rect = { x, y, w: item.w, h: item.h };
                const overlaps = currentOccupied.some(occ => rectsOverlap(occ, candidateRect));
                if (!overlaps) {
                    const dx = x - item.x;
                    const dy = y - item.y;
                    let dirBonus = 0.005;
                    if (dx > 0 && dy === 0) dirBonus = 0.001; // 右
                    else if (dx === 0 && dy > 0) dirBonus = 0.002; // 下
                    else if (dx < 0 && dy === 0) dirBonus = 0.003; // 左
                    else if (dx === 0 && dy < 0) dirBonus = 0.004; // 上

                    // 1. 同尺寸直接重叠互换（1:1 swap）：若该位置是被拖拽项腾出的原位置且尺寸一致，给予最高优先级直接对调
                    const isDirectSwap = Boolean(
                        ignoreItem &&
                        x === ignoreItem.x &&
                        y === ignoreItem.y &&
                        item.w === ignoreItem.w &&
                        item.h === ignoreItem.h
                    );

                    // 2. 落入拖拽项腾出的区域（如 2×2 组件腾出空间供其它被撞条目填补）
                    const isVacatedArea = Boolean(
                        ignoreItem &&
                        !isDirectSwap &&
                        rectsOverlap(ignoreItem, candidateRect)
                    );

                    let swapBonus = 0;
                    if (isDirectSwap) {
                        swapBonus = -100;
                    } else if (isVacatedArea) {
                        swapBonus = -10;
                    }

                    // 使用欧几里得距离，确保物理几何距离最近的可用空位（斜对角相邻 1.414 优先于隔两格 2.0）
                    const dist = Math.hypot(dx, dy) + dirBonus + swapBonus;
                    candidates.push({ x, y, dist });
                }
            }
        }

        if (candidates.length === 0) {
            return null;
        }

        candidates.sort((a, b) => a.dist - b.dist);
        const best = candidates[0];

        displacedItems.set(item.id, { x: best.x, y: best.y });
        currentOccupied.push({ x: best.x, y: best.y, w: item.w, h: item.h });
    }

    return { ok: true, displacedItems };
};

/**
 * 将挤开位移应用到页面条目中
 */
export const applyDisplacements = (
    page: DesktopPage,
    displacements?: Map<string, { x: number; y: number }>,
): DesktopPage => {
    if (!displacements || displacements.size === 0) return page;
    return {
        ...page,
        items: page.items.map(it => {
            const pos = displacements.get(it.id);
            return pos ? { ...it, x: pos.x, y: pos.y } : it;
        }),
    };
};

// ───────────────────────── 单页操作 ─────────────────────────

export const emptyPage = (
    id: string = makePageId(),
    layout?: 'windmill' | 'standard' | 'home',
): DesktopPage => ({
    id,
    items: [],
    ...(layout ? { layout } : {}),
});

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
    /** 每页行数：固定数字，或按「这一页在返回数组里的下标」和页面对象给出行数的函数（主屏那页更矮）。 */
    rowsFor: number | ((pageArrayIndex: number, page?: DesktopPage) => number) = GRID_ROWS,
): DesktopPage[] => {
    const rowsAt = (idx: number, page?: DesktopPage) => typeof rowsFor === 'function' ? rowsFor(idx, page) : rowsFor;
    const pages = startPages.length ? startPages.map(p => ({ ...p, items: [...p.items] })) : [emptyPage()];
    let pi = 0;
    for (const spec of specs) {
        // 从当前页往后找第一个放得下的页
        let placed = false;
        while (pi < pages.length) {
            const res = addItem(pages[pi], spec, cols, rowsAt(pi, pages[pi]));
            if (res) { pages[pi] = res.page; placed = true; break; }
            pi++;
        }
        if (!placed) {
            const fresh = emptyPage(makePageId(), 'standard');
            const res = addItem(fresh, spec, cols, rowsAt(pages.length, fresh));
            pages.push(res ? res.page : fresh);
            pi = pages.length - 1;
        }
    }
    return pages;
};

export const addPage = (pages: DesktopPage[], layout?: 'windmill' | 'standard'): DesktopPage[] =>
    [...pages, emptyPage(makePageId(), layout)];

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

/**
 * 从每页剔除表头专属条目（clock / charCard），然后压实。给「已迁移过的旧数据」纠偏用。
 * pages 下标即 Screen 序号（[0]=负一屏 [1]=主屏…），主屏按它的矮行数压实，避免压出格外的行。
 */
export const stripHeaderKinds = (pages: DesktopPage[]): DesktopPage[] => {
    let changed = false;
    const next = pages.map((p, screenIdx) => {
        const kept = p.items.filter(it => !HEADER_ONLY_KINDS.has(it.kind));
        if (kept.length === p.items.length) return p;
        changed = true;
        return compactPage({ ...p, items: kept }, GRID_COLS, rowsForScreen(screenIdx, p));
    });
    return changed ? next : pages;
};

/**
 * 主屏(Screen 1)行数变矮（HOME_PAGE_ROWS）后的纠偏：把落在新行数之外的条目挪到后面的页，
 * 而不是被裁掉看不见。给「已经迁移过、可能还是按旧行数摆的」数据用。
 */
export const enforceHomeRowCap = (pages: DesktopPage[]): DesktopPage[] => {
    if (pages.length < 2) return pages;
    const homeIdx = findHomeIndex(pages);
    const home = pages[homeIdx];
    const overflow = home.items.filter(it => it.y + it.h > HOME_PAGE_ROWS || it.x + it.w > GRID_COLS);
    if (overflow.length === 0) return pages;
    const kept = home.items.filter(it => !overflow.includes(it));
    const newHome = { ...home, items: kept };
    const overflowSpecs: NewItemSpec[] = overflow.map(it => ({
        kind: it.kind, refId: it.refId, w: it.w, h: it.h, locked: it.locked, title: it.title, config: it.config,
    }));
    const before = pages.slice(0, homeIdx);
    const rest = pages.slice(homeIdx + 1);
    const flowed = flowItems(rest.length ? rest : [emptyPage()], overflowSpecs, GRID_COLS, (idx, pg) => rowsForScreen(idx + before.length + 1, pg));
    return [...before, newHome, ...flowed];
};

/**
 * 通用防重叠 / 越界纠偏：给「已经迁移过的旧数据」用。跨几版迁移逻辑改动，
 * 历史数据里可能留着真正重叠的坐标（同一块地方站着两个条目）或者超出该页
 * 行数的坐标——不是拖拽残影，是数据本身就摆错了，画面上就是"半透明卡片和
 * 图标叠在一起"。
 *
 * 只动真正有问题的条目：按原顺序走一遍，不越界且不跟前面「已确认没问题」
 * 的条目重叠就保留原位；一旦越界或重叠，找该页第一个空位挪过去；实在没空位
 * 的（页面早就该重排了）丢进溢出队列，顺流铺到后面的页。没问题的数据完全
 * 不挪动，不会无意义打乱用户摆好的布局。
 */
export const repairOverlaps = (pages: DesktopPage[]): DesktopPage[] => {
    let anyChanged = false;
    const overflowSpecs: NewItemSpec[] = [];
    const repaired = pages.map((page, screenIdx) => {
        const rows = rowsForScreen(screenIdx, page);
        const kept: PlacedItem[] = [];
        for (const it of page.items) {
            const ok = withinGrid(it, GRID_COLS, rows) && !kept.some(k => rectsOverlap(k, it));
            if (ok) { kept.push(it); continue; }
            anyChanged = true;
            const pos = findFreeRect({ id: page.id, items: kept, layout: page.layout }, it.w, it.h, GRID_COLS, rows);
            if (pos) {
                kept.push({ ...it, x: pos.x, y: pos.y });
            } else {
                overflowSpecs.push({
                    kind: it.kind, refId: it.refId, w: it.w, h: it.h,
                    locked: it.locked, title: it.title, config: it.config,
                });
            }
        }
        return { ...page, items: kept };
    });
    if (!anyChanged) return pages;
    if (overflowSpecs.length === 0) return repaired;
    return flowItems(repaired, overflowSpecs, GRID_COLS, (idx, pg) => rowsForScreen(idx, pg));
};

/** 删除某页（纯 splice；调用方负责「非空页要不要确认 / 搬移」）。至少保留 1 页。 */
export const removePage = (pages: DesktopPage[], index: number): DesktopPage[] => {
    if (index < 0 || index >= pages.length || pages.length <= 1) return pages;
    return pages.filter((_, i) => i !== index);
};

// ───────────────────────── 迁移 ─────────────────────────

/** 旧 DesktopWidgetInstance.kind → 新 GridItemKind。 */
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
 *   [2] 原风车页 = schedule（锁定）+ music + 四宫格A + 四宫格B + image
 *   [3+] 剩余 app + 自定义页小组件，按需开页（每页 7 行）
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
    if (theme.launcherPages && theme.launcherPages.length) {
        return repairOverlaps(enforceHomeRowCap(stripHeaderKinds(ensureHomeTag(theme.launcherPages))));
    }

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
    let page1 = emptyPage(makePageId(), 'home');

    // ── Page 2：原风车页（锁定的日程 + 音乐 + 四宫格A + 四宫格B + 相框）──
    let page2 = emptyPage(makePageId(), 'windmill');
    page2 = (addItem(page2, { kind: 'schedule', locked: true, x: 0, y: 0, w: 4, h: 2 }) || { page: page2 }).page;
    page2 = (addItem(page2, { kind: 'music', x: 0, y: 2, w: 2, h: 2 }) || { page: page2 }).page;

    const appSourceIds = theme.launcherAppOrder && theme.launcherAppOrder.length
        ? theme.launcherAppOrder
        : Array.from(validAppIds);
    const dedupedAppIds = dedupe(appSourceIds, validAppIds);

    // Page 1 铺前 8 个 App
    const page1Apps = dedupedAppIds.slice(0, 8);
    for (const id of page1Apps) {
        const res = addItem(page1, { kind: 'app', refId: id });
        if (res) page1 = res.page;
    }

    // Page 2 铺接下来 8 个 App（四宫格 A 4个，四宫格 B 4个）
    const quadAApps = dedupedAppIds.slice(8, 12);
    const quadBApps = dedupedAppIds.slice(12, 16);

    if (quadAApps.length > 0) {
        page2 = (addItem(page2, {
            kind: 'quad_apps', x: 2, y: 2, w: 2, h: 2,
            config: { apps: quadAApps }
        }) || { page: page2 }).page;
    }

    if (quadBApps.length > 0) {
        page2 = (addItem(page2, {
            kind: 'quad_apps', x: 0, y: 4, w: 2, h: 2,
            config: { apps: quadBApps }
        }) || { page: page2 }).page;
    }

    page2 = (addItem(page2, {
        kind: 'image', x: 2, y: 4, w: 2, h: 2,
        ...(theme.launcherWidgets?.dsq ? { config: { src: theme.launcherWidgets.dsq } } : {}),
    }) || { page: page2 }).page;

    // 剩余 app 顺流铺进 Page 3+（每页 6 行，即 APP_PAGE_ROWS）
    const remainingAppIds = dedupedAppIds.slice(16);
    const appSpecs: NewItemSpec[] = remainingAppIds.map(id => ({ kind: 'app' as GridItemKind, refId: id }));

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

    let pages = flowItems(
        [page1, page2],
        [...appSpecs, ...widgetSpecs, ...legacyImageSpecs],
        GRID_COLS,
        (idx) => idx === 0 ? HOME_PAGE_ROWS : idx === 1 ? WINDMILL_PAGE_ROWS : APP_PAGE_ROWS,
    );

    return [page0, ...pages];
};

/** 网格上所有页里出现过的 AppID（用于算「哪些 app 还没上桌 / 已隐藏」）。 */
export const collectPlacedAppIds = (pages: DesktopPage[]): Set<string> => {
    const s = new Set<string>();
    for (const p of pages) {
        for (const it of p.items) {
            if (it.kind === 'app' && it.refId) s.add(it.refId);
            if (it.kind === 'quad_apps' && Array.isArray(it.config?.apps)) {
                for (const id of it.config.apps) if (id) s.add(id);
            }
        }
    }
    return s;
};
