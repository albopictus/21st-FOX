import { describe, it, expect } from 'vitest';
import type { DesktopPage, OSTheme, PlacedItem } from '../types';
import {
    GRID_COLS, GRID_ROWS, HOME_PAGE_ROWS, rowsForScreen,
    rectsOverlap, withinGrid, canPlace, findFreeRect,
    emptyPage, addItem, removeItem, moveItem, resizeItem, toggleLock,
    flowItems, addPage, removePage, enforceHomeRowCap, repairOverlaps,
    migrateLegacyLauncher, collectPlacedAppIds,
} from './desktopGrid';

const mk = (over: Partial<PlacedItem>): PlacedItem => ({
    id: over.id || 'x', kind: over.kind || 'app', x: 0, y: 0, w: 1, h: 1, ...over,
});
const page = (items: PlacedItem[]): DesktopPage => ({ id: 'p', items });

describe('desktopGrid · 几何', () => {
    it('rectsOverlap', () => {
        expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 })).toBe(true);
        expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 })).toBe(false); // 相邻不算
        expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 0, y: 2, w: 2, h: 2 })).toBe(false);
    });

    it('withinGrid 边界', () => {
        expect(withinGrid({ x: 0, y: 0, w: 4, h: 6 })).toBe(true);
        expect(withinGrid({ x: 3, y: 0, w: 2, h: 1 })).toBe(false); // 右边越界
        expect(withinGrid({ x: 0, y: 5, w: 1, h: 2 })).toBe(false); // 底部越界（GRID_ROWS=6）
        expect(withinGrid({ x: -1, y: 0, w: 1, h: 1 })).toBe(false);
        expect(withinGrid({ x: 0, y: 0, w: 0, h: 1 })).toBe(false);
    });

    it('canPlace 检测重叠与越界，ignoreId 生效', () => {
        const p = page([mk({ id: 'a', x: 0, y: 0, w: 2, h: 2 })]);
        expect(canPlace(p, { x: 2, y: 0, w: 2, h: 2 })).toBe(true);
        expect(canPlace(p, { x: 1, y: 1, w: 1, h: 1 })).toBe(false);
        expect(canPlace(p, { x: 0, y: 0, w: 2, h: 2 }, 'a')).toBe(true); // 忽略自身
    });

    it('findFreeRect 行优先', () => {
        const p = page([mk({ id: 'a', x: 0, y: 0, w: 4, h: 2 })]);
        expect(findFreeRect(p, 1, 1)).toEqual({ x: 0, y: 2 });
        const full = page([mk({ id: 'a', x: 0, y: 0, w: 4, h: 6 })]);
        expect(findFreeRect(full, 1, 1)).toBeNull();
    });
});

describe('desktopGrid · 单页操作（不可变）', () => {
    it('addItem 显式落点 / 自动找位 / 满页返回 null', () => {
        let p = emptyPage('p');
        const r1 = addItem(p, { kind: 'clock', x: 0, y: 0 })!;
        expect(r1.item).toMatchObject({ kind: 'clock', x: 0, y: 0, w: 4, h: 3 });
        expect(p.items).toHaveLength(0); // 原页不变

        const r2 = addItem(r1.page, { kind: 'app', refId: 'chat' })!;
        expect(r2.item).toMatchObject({ kind: 'app', refId: 'chat', x: 0, y: 3, w: 1, h: 1 });

        const filled = page([mk({ id: 'a', x: 0, y: 0, w: 4, h: 6 })]);
        expect(addItem(filled, { kind: 'app', refId: 'x' })).toBeNull();
    });

    it('addItem 显式落点被占用时回退到自动找位', () => {
        const p = page([mk({ id: 'a', x: 0, y: 0, w: 2, h: 2 })]);
        const r = addItem(p, { kind: 'app', refId: 'x', x: 0, y: 0 })!;
        expect(r.item).toMatchObject({ x: 2, y: 0 });
    });

    it('moveItem 合法移动 / 撞车不动 / 越界不动', () => {
        const p = page([
            mk({ id: 'a', x: 0, y: 0, w: 1, h: 1 }),
            mk({ id: 'b', x: 1, y: 0, w: 1, h: 1 }),
        ]);
        expect(moveItem(p, 'a', 0, 3).items.find(i => i.id === 'a')).toMatchObject({ x: 0, y: 3 });
        expect(moveItem(p, 'a', 1, 0)).toBe(p); // 撞 b
        expect(moveItem(p, 'a', 4, 0)).toBe(p); // 越界
    });

    it('resizeItem 合法 / 撞车不动', () => {
        const p = page([
            mk({ id: 'a', x: 0, y: 0, w: 1, h: 1 }),
            mk({ id: 'b', x: 0, y: 2, w: 1, h: 1 }),
        ]);
        expect(resizeItem(p, 'a', 2, 2).items.find(i => i.id === 'a')).toMatchObject({ w: 2, h: 2 });
        expect(resizeItem(p, 'a', 1, 4)).toBe(p); // 会盖到 b
    });

    it('removeItem / toggleLock', () => {
        const p = page([mk({ id: 'a' }), mk({ id: 'b' })]);
        expect(removeItem(p, 'a').items.map(i => i.id)).toEqual(['b']);
        expect(toggleLock(p, 'a').items.find(i => i.id === 'a')!.locked).toBe(true);
        expect(toggleLock(toggleLock(p, 'a'), 'a').items.find(i => i.id === 'a')!.locked).toBe(false);
    });
});

describe('desktopGrid · 跨页', () => {
    it('flowItems 溢出到新页，且绕开已有（锁定）条目', () => {
        const start = page([mk({ id: 'lock', kind: 'schedule', x: 0, y: 0, w: 4, h: 2, locked: true })]);
        const specs = Array.from({ length: 30 }, (_, i) => ({ kind: 'app' as const, refId: `app${i}` }));
        const pages = flowItems([start], specs);
        // 第一页锁定块占了 rows 0-1，剩 4 行 = 16 格（GRID_ROWS=6）
        expect(pages[0].items.filter(i => i.kind === 'app')).toHaveLength(16);
        expect(pages.length).toBe(2);
        expect(pages[1].items.filter(i => i.kind === 'app')).toHaveLength(14);
        // 锁定块没被动
        expect(pages[0].items.find(i => i.id === 'lock')).toMatchObject({ x: 0, y: 0, locked: true });
    });

    it('addPage / removePage 至少保留一页', () => {
        let pages = [emptyPage('a')];
        pages = addPage(pages);
        expect(pages).toHaveLength(2);
        expect(removePage(pages, 0)).toHaveLength(1);
        expect(removePage([emptyPage('only')], 0)).toHaveLength(1); // 不删最后一页
    });
});

describe('desktopGrid · migrateLegacyLauncher', () => {
    const valid = new Set(['chat', 'music', 'gallery', 'settings', 'call', 'social']);

    it('已有 launcherPages 且没有表头脏条目时原样返回', () => {
        const existing: DesktopPage[] = [{ id: 'p0', items: [] }];
        expect(migrateLegacyLauncher({ launcherPages: existing }, valid)).toBe(existing);
    });

    it('已有 launcherPages：早期版本误塞的 clock / charCard 条目会被剔掉并压实', () => {
        const dirty: DesktopPage[] = [
            { id: 'p1', items: [
                { id: 'c', kind: 'clock', x: 0, y: 0, w: 4, h: 3, locked: true },
                { id: 'cc', kind: 'charCard', x: 0, y: 3, w: 4, h: 2, locked: true },
                { id: 'a1', kind: 'app', refId: 'chat', x: 0, y: 5, w: 1, h: 1 },
            ] },
        ];
        const out = migrateLegacyLauncher({ launcherPages: dirty }, valid);
        expect(out[0].items.map(i => i.kind)).toEqual(['app']);
        expect(out[0].items[0]).toMatchObject({ refId: 'chat', x: 0, y: 0 }); // 压到左上角
    });

    it('从旧字段迁移：页序、app 去重与过滤（时钟/角色卡不塞成条目）', () => {
        const theme: Partial<OSTheme> = {
            launcherMinusOneApps: ['gallery', 'gallery', 'nonexistent', 'call'],
            launcherAppOrder: ['chat', 'music', 'chat', 'settings', 'bogus'],
            launcherCustomPages: [{ id: 'c1', widgets: [{ id: 'w1', kind: 'calendar', size: '4x2' }] }],
            launcherWidgets: { dsq: 'data:image/png;base64,AAA' },
        };
        const pages = migrateLegacyLauncher(theme as OSTheme, valid);

        // 页 0 = 负一屏：只有有效且去重后的 app
        expect(pages[0].items.map(i => i.refId)).toEqual(['gallery', 'call']);

        // 页 1 = 主屏：不含时钟 / 角色卡条目（它们是 Launcher 表头）；内容从顶格铺
        const allKindsFlat = pages.flatMap(p => p.items.map(i => i.kind));
        expect(allKindsFlat).not.toContain('clock');
        expect(allKindsFlat).not.toContain('charCard');
        expect(pages[1].items[0]).toMatchObject({ x: 0, y: 0 });

        // 页 2 = 原风车页：锁定的 schedule + music + image（image 带上 dsq 图）
        const p2 = pages[2];
        expect(p2.items.find(i => i.kind === 'schedule')!.locked).toBe(true);
        // 音乐 / 相框本来就能随便挪 —— 不锁
        expect(p2.items.find(i => i.kind === 'music')!.locked).toBeFalsy();
        expect(p2.items.find(i => i.kind === 'image')!.locked).toBeFalsy();
        expect(p2.items.find(i => i.kind === 'image')!.config?.src).toBe('data:image/png;base64,AAA');

        // 所有有效 app 都被放上去了，且不重复
        const placedApps = collectPlacedAppIds(pages);
        expect(placedApps.has('chat')).toBe(true);
        expect(placedApps.has('music')).toBe(true);
        expect(placedApps.has('settings')).toBe(true);
        expect(placedApps.has('bogus')).toBe(false);

        // 自定义页的 calendar 小组件迁过来了
        const allKinds = pages.flatMap(p => p.items.map(i => i.kind));
        expect(allKinds).toContain('calendar');
    });

    it('每页条目都在网格内且互不重叠', () => {
        const theme: Partial<OSTheme> = {
            launcherAppOrder: Array.from({ length: 40 }, (_, i) => `a${i}`),
        };
        const bigValid = new Set(theme.launcherAppOrder);
        const pages = migrateLegacyLauncher(theme as OSTheme, bigValid);
        for (const p of pages) {
            for (let i = 0; i < p.items.length; i++) {
                expect(withinGrid(p.items[i], GRID_COLS, GRID_ROWS)).toBe(true);
                for (let j = i + 1; j < p.items.length; j++) {
                    expect(rectsOverlap(p.items[i], p.items[j])).toBe(false);
                }
            }
        }
        // 40 个 app 一个不丢
        expect(collectPlacedAppIds(pages).size).toBe(40);
    });

    it('主屏（Screen 1）只有 HOME_PAGE_ROWS 行，不会塞满 GRID_ROWS', () => {
        const theme: Partial<OSTheme> = {
            launcherAppOrder: Array.from({ length: 20 }, (_, i) => `a${i}`),
        };
        const validAll = new Set(theme.launcherAppOrder);
        const pages = migrateLegacyLauncher(theme as OSTheme, validAll);
        for (const it of pages[1].items) {
            expect(it.y + it.h).toBeLessThanOrEqual(HOME_PAGE_ROWS);
        }
        expect(rowsForScreen(1)).toBe(HOME_PAGE_ROWS);
        expect(rowsForScreen(0)).toBe(GRID_ROWS);
        expect(rowsForScreen(2)).toBe(GRID_ROWS);
        expect(rowsForScreen(3)).toBe(7);
    });

    it('风车页（Screen 2）与 Screen 3+ 7行网格排布正确', () => {
        const theme: Partial<OSTheme> = {
            launcherAppOrder: Array.from({ length: 30 }, (_, i) => `app_${i}`),
        };
        const validApps = new Set(theme.launcherAppOrder);
        const pages = migrateLegacyLauncher(theme as OSTheme, validApps);

        // Screen 2 是风车页：日程 + 音乐 + 四宫格A + 四宫格B + 相框
        const p2 = pages[2];
        expect(p2.layout).toBe('windmill');
        expect(p2.items).toHaveLength(5);
        expect(p2.items.find(i => i.kind === 'schedule')).toMatchObject({ x: 0, y: 0, w: 4, h: 2, locked: true });
        expect(p2.items.find(i => i.kind === 'music')).toMatchObject({ x: 0, y: 2, w: 2, h: 2 });
        const quadA = p2.items.find(i => i.kind === 'quad_apps' && i.x === 2 && i.y === 2);
        expect(quadA).toBeDefined();
        expect(quadA?.config?.apps).toEqual(['app_8', 'app_9', 'app_10', 'app_11']);
        const quadB = p2.items.find(i => i.kind === 'quad_apps' && i.x === 0 && i.y === 4);
        expect(quadB).toBeDefined();
        expect(quadB?.config?.apps).toEqual(['app_12', 'app_13', 'app_14', 'app_15']);
        expect(p2.items.find(i => i.kind === 'image')).toMatchObject({ x: 2, y: 4, w: 2, h: 2 });

        // Screen 3+ 为 7 行网格
        expect(rowsForScreen(3)).toBe(7);
        expect(rowsForScreen(4)).toBe(7);

        // 指定 layout 时优先尊重 layout（除 Screen 1 主屏外）
        expect(rowsForScreen(5, { id: 'p5', items: [], layout: 'windmill' })).toBe(6);
        expect(rowsForScreen(2, { id: 'p2', items: [], layout: 'standard' })).toBe(7);
        expect(rowsForScreen(1, { id: 'p1', items: [], layout: 'windmill' })).toBe(HOME_PAGE_ROWS);

        // addPage 支持 layout
        const withWindmill = addPage([], 'windmill');
        expect(withWindmill[0].layout).toBe('windmill');
        const withStandard = addPage([], 'standard');
        expect(withStandard[0].layout).toBe('standard');

        // 30 个 app 全部被统计到（无遗漏，包括四宫格内的）
        const placed = collectPlacedAppIds(pages);
        expect(placed.size).toBe(30);

        // 四宫格如果移除某个 app 变成 null，不会被 collectPlacedAppIds 收集
        const pageWithQuadNull: DesktopPage = {
            id: 'p_null',
            items: [
                { id: 'q1', kind: 'quad_apps', x: 0, y: 0, w: 2, h: 2, config: { apps: ['app_1', null, 'app_2', undefined] } },
            ],
        };
        const placedWithNull = collectPlacedAppIds([pageWithQuadNull]);
        expect(placedWithNull).toEqual(new Set(['app_1', 'app_2']));
    });
});

describe('desktopGrid · enforceHomeRowCap', () => {
    it('主屏行数变矮后，越界条目搬到后面的页而不是被裁掉', () => {
        const home: DesktopPage = {
            id: 'home', items: [
                mk({ id: 'ok', x: 0, y: 0, w: 1, h: 1 }),
                mk({ id: 'over', x: 0, y: HOME_PAGE_ROWS, w: 1, h: 1 }), // 越界：y 已经在矮行数之外
            ],
        };
        const pages: DesktopPage[] = [emptyPage('m1'), home, emptyPage('p2')];
        const out = enforceHomeRowCap(pages);
        expect(out[1].items.map(i => i.id)).toEqual(['ok']);
        // 搬走的条目会重新分配 id（落点变了），按 kind 数量核对没有丢
        expect(out[2].items.filter(i => i.kind === 'app')).toHaveLength(1);
    });

    it('没有越界条目时原样返回', () => {
        const home: DesktopPage = { id: 'home', items: [mk({ id: 'ok', x: 0, y: 0, w: 1, h: 1 })] };
        const pages: DesktopPage[] = [emptyPage('m1'), home];
        expect(enforceHomeRowCap(pages)).toBe(pages);
    });
});

describe('desktopGrid · repairOverlaps', () => {
    it('没有重叠 / 越界时原样返回（引用不变）', () => {
        const pages: DesktopPage[] = [
            emptyPage('m1'),
            page([mk({ id: 'a', x: 0, y: 0, w: 1, h: 1 })]),
        ];
        expect(repairOverlaps(pages)).toBe(pages);
    });

    it('修复同页内两个条目重叠：后面的条目被挪到空位', () => {
        const dirty: DesktopPage[] = [
            emptyPage('m1'),
            page([
                mk({ id: 'a', x: 0, y: 0, w: 2, h: 2 }),
                mk({ id: 'b', x: 1, y: 1, w: 2, h: 2 }), // 与 a 重叠
            ]),
        ];
        const out = repairOverlaps(dirty);
        const [a, b] = [out[1].items.find(i => i.id === 'a')!, out[1].items.find(i => i.id === 'b')!];
        expect(a).toMatchObject({ x: 0, y: 0 }); // 先来的不动
        expect(rectsOverlap(a, b)).toBe(false); // 后来的挪开了
        expect(withinGrid(b, GRID_COLS, rowsForScreen(1))).toBe(true);
    });

    it('修复越界条目：搬回网格内且不与其他条目重叠', () => {
        const dirty: DesktopPage[] = [
            page([
                mk({ id: 'a', x: 0, y: 0, w: 1, h: 1 }),
                mk({ id: 'over', x: 2, y: GRID_ROWS - 1, w: 2, h: 2 }), // 底部越界
            ]),
            emptyPage('m2'),
        ];
        const out = repairOverlaps(dirty);
        const fixed = out[0].items.find(i => i.id === 'over')!;
        expect(withinGrid(fixed, GRID_COLS, GRID_ROWS)).toBe(true);
        expect(rectsOverlap(fixed, out[0].items.find(i => i.id === 'a')!)).toBe(false);
    });

    it('本页放不下时溢出到后续页（沿用 flowItems 逻辑）', () => {
        // 把一整页塞满，再加一个和已有条目重叠、又放不进本页剩余空间的条目
        const fullItems = Array.from({ length: GRID_COLS * GRID_ROWS / 1 }, (_, i) =>
            mk({ id: `f${i}`, x: i % GRID_COLS, y: Math.floor(i / GRID_COLS), w: 1, h: 1 }));
        const overflow = mk({ id: 'overflow', x: 0, y: 0, w: 1, h: 1, kind: 'app', refId: 'extra' });
        // 让 overflow 与已有条目重叠，逼它去找新位置；页面已满，只能流到下一页
        const dirty: DesktopPage[] = [
            page([...fullItems, overflow]), // 非主屏（数组下标 0），用满 GRID_ROWS 行
            emptyPage('m2'),
        ];
        const out = repairOverlaps(dirty);
        // overflow 条目被挪去了别的页（本页放不下），且没有丢失、没有和任何条目重叠
        const placedOverflow = out.find(p => p.items.some(i => i.refId === 'extra'));
        expect(placedOverflow).toBeDefined();
        const ov = placedOverflow!.items.find(i => i.refId === 'extra')!;
        expect(placedOverflow!.items.every(i => i === ov || !rectsOverlap(i, ov))).toBe(true);
        // 满页那一页仍然只有原来的条目，overflow 没有原地重叠摆放
        expect(out[0].items.filter(i => i.refId === 'extra')).toHaveLength(0);
    });
});

describe('desktopGrid · migrateLegacyLauncher 空 launcherAppOrder 兜底', () => {
    it('launcherAppOrder 缺失（全新安装 / 一键还原外观清空 theme 后）不会铺出空桌面', () => {
        const valid = new Set(['chat', 'music', 'settings']);
        const pages = migrateLegacyLauncher({} as OSTheme, valid);
        const placed = collectPlacedAppIds(pages);
        expect(placed.has('chat')).toBe(true);
        expect(placed.has('music')).toBe(true);
        expect(placed.has('settings')).toBe(true);
    });
});
