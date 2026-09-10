import { describe, it, expect } from 'vitest';
import type { DesktopPage, OSTheme, PlacedItem } from '../types';
import {
    GRID_COLS, GRID_ROWS,
    rectsOverlap, withinGrid, canPlace, findFreeRect,
    emptyPage, addItem, removeItem, moveItem, resizeItem, toggleLock,
    flowItems, addPage, removePage,
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
        expect(withinGrid({ x: 0, y: 5, w: 1, h: 2 })).toBe(false); // 底部越界
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
        const start = page([mk({ id: 'lock', kind: 'clock', x: 0, y: 0, w: 4, h: 2, locked: true })]);
        const specs = Array.from({ length: 20 }, (_, i) => ({ kind: 'app' as const, refId: `app${i}` }));
        const pages = flowItems([start], specs);
        // 第一页锁定块占了 rows 0-1，只剩 4 行 = 16 格
        expect(pages[0].items.filter(i => i.kind === 'app')).toHaveLength(16);
        expect(pages.length).toBe(2);
        expect(pages[1].items.filter(i => i.kind === 'app')).toHaveLength(4);
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

    it('已有 launcherPages 时原样返回', () => {
        const existing: DesktopPage[] = [{ id: 'p0', items: [] }];
        expect(migrateLegacyLauncher({ launcherPages: existing }, valid)).toBe(existing);
    });

    it('从旧字段迁移：页序、锁定块、app 去重与过滤', () => {
        const theme: Partial<OSTheme> = {
            launcherMinusOneApps: ['gallery', 'gallery', 'nonexistent', 'call'],
            launcherAppOrder: ['chat', 'music', 'chat', 'settings', 'bogus'],
            launcherCustomPages: [{ id: 'c1', widgets: [{ id: 'w1', kind: 'calendar', size: '4x2' }] }],
            launcherWidgets: { dsq: 'data:image/png;base64,AAA' },
        };
        const pages = migrateLegacyLauncher(theme as OSTheme, valid);

        // 页 0 = 负一屏：只有有效且去重后的 app
        expect(pages[0].items.map(i => i.refId)).toEqual(['gallery', 'call']);

        // 页 1 = 主屏：锁定的 clock + charCard
        const p1kinds = pages[1].items.map(i => i.kind);
        expect(p1kinds).toContain('clock');
        expect(p1kinds).toContain('charCard');
        expect(pages[1].items.find(i => i.kind === 'clock')!.locked).toBe(true);
        expect(pages[1].items.find(i => i.kind === 'charCard')!.locked).toBe(true);

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
});
