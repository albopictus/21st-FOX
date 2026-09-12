import React from 'react';
import type { CharacterProfile, DailySchedule, Anniversary, GridItemKind, PlacedItem } from '../../types';
import { INSTALLED_APPS } from '../../constants';
import AppIcon from './AppIcon';
import NowPlayingSquareWidget from './NowPlayingSquareWidget';
import { ScheduleHomeWidget } from '../schedule/ScheduleHomeWidget';
import { CalendarWidget } from './widgets/CalendarWidget';
import { AnniversaryWidget } from './widgets/AnniversaryWidget';
import { MemoHomeWidget } from './widgets/MemoHomeWidget';
import { DesktopClockWidget } from './widgets/DesktopClockWidget';
import { CharacterCardWidget } from './widgets/CharacterCardWidget';
import { DesktopImageWidget } from './widgets/DesktopImageWidget';
import { QuadAppsWidget } from './widgets/QuadAppsWidget';
import { DEFAULT_ITEM_SIZE } from '../../utils/desktopGrid';

/**
 * 桌面自由网格 · 组件注册表。
 *
 * 把「原本写死的三块（时钟 / 角色卡 / 日程）+ 组件库那几个 + App 图标」统一成
 * 一张表：kind → { 尺寸约束、组件库文案、renderContent }。
 *
 * renderContent 只画**内容本身**，不含网格单元格外壳 / 拖拽把手 / 锁徽标 —— 那些由
 * Launcher 的 <GridCell> 负责（step 4）。
 */

export interface WidgetRenderContext {
    contentColor: string;
    acnh: boolean;
    paper: boolean;
    /** 编辑态（长按整理）中。锁定项在编辑态也不响应内容点击。 */
    editing: boolean;
    openApp: (id: string) => void;

    // 数据（Launcher 从 OSContext / DB 取好后传进来）
    anniversaries: Anniversary[];
    characters: CharacterProfile[];
    /** charCard 用：当前展示的角色 + 未读 + 最近一条消息 */
    widgetChar: CharacterProfile | null;
    unreadCount: number;
    lastMessage: string;
    onOpenCharCard: () => void;
    /** schedule 用 */
    scheduleData: DailySchedule | null;
    scheduleChar: CharacterProfile | null;
    onOpenSchedule: () => void;
    /** image 用：点一下换图 */
    onEditImage: (item: PlacedItem) => void;
    /** quad_apps 用：打开四宫格应用管理抽屉 */
    onOpenQuadManager?: (item: PlacedItem, slotIndex?: number) => void;
    /** quad_apps 用：单独移除某个槽位的应用 */
    onRemoveQuadApp?: (item: PlacedItem, slotIndex: number) => void;
    /** quad_apps 用：单独为某个槽位添加应用 */
    onAddQuadApp?: (item: PlacedItem, slotIndex: number) => void;
    /** 小组件背景透明度字典 (0~100) */
    widgetOpacity?: Record<string, number | undefined>;
}

interface WidgetMeta {
    /** 默认尺寸（格）。取自 desktopGrid.DEFAULT_ITEM_SIZE，这里只补 min/max。 */
    minW: number; minH: number;
    maxW: number; maxH: number;
    /** 组件库标题 / 说明。app 不进组件库（走「添加应用」页），label 仅兜底。 */
    label: string;
    desc: string;
    /** 全桌面只允许一个（时钟 / 角色卡 / 日程）。 */
    singleton?: boolean;
    /** 迁移 / 新建时默认锁定。 */
    defaultLocked?: boolean;
    /** 不在组件库里列出（app）。 */
    galleryHidden?: boolean;
}

export const WIDGET_META: Record<GridItemKind, WidgetMeta> = {
    app:        { minW: 1, minH: 1, maxW: 1, maxH: 1, label: 'App',    desc: '', galleryHidden: true },
    // 时钟 / 角色卡是主屏表头，Launcher 单独渲染，不做网格条目也不进组件库
    clock:      { minW: 4, minH: 2, maxW: 4, maxH: 4, label: '时钟',   desc: '', singleton: true, galleryHidden: true },
    charCard:   { minW: 3, minH: 1, maxW: 4, maxH: 2, label: '角色卡', desc: '', singleton: true, galleryHidden: true },
    schedule:   { minW: 3, minH: 2, maxW: 4, maxH: 4, label: '日程',   desc: '角色此刻在做什么 · 拉大看接下来几段', singleton: true, defaultLocked: true },
    music:      { minW: 2, minH: 2, maxW: 4, maxH: 4, label: '黑胶音乐播放器', desc: '正在播放的歌 + 旋转黑胶，可定制贴纸' },
    image:      { minW: 1, minH: 1, maxW: 4, maxH: 4, label: '相框',   desc: '在桌面上摆一张喜欢的图，点一下换（宽度也能设成 1 格的窄条幅）' },
    calendar:   { minW: 4, minH: 2, maxW: 4, maxH: 4, label: '整月日历', desc: '整月日期与日程标记，轻触直达日程' },
    anniversary:{ minW: 4, minH: 2, maxW: 4, maxH: 3, label: '纪念日与倒计时', desc: '与角色的特殊日子，支持翻页与倒数' },
    memo:       { minW: 2, minH: 2, maxW: 4, maxH: 3, label: '便签',   desc: '置顶与最新想法的小纸条' },
    quad_apps:  { minW: 2, minH: 2, maxW: 2, maxH: 2, label: '四宫格风车组件', desc: '经典四合一应用方块，收纳 4 个 App，支持直接拖入与点开管理' },
};

export const defaultSizeFor = (kind: GridItemKind): { w: number; h: number } =>
    DEFAULT_ITEM_SIZE[kind] || { w: 1, h: 1 };

/** 组件库里可添加的类型（app 除外，singleton 由调用方按「桌面已有」再过滤）。 */
export const GALLERY_KINDS: GridItemKind[] =
    (Object.keys(WIDGET_META) as GridItemKind[]).filter(k => !WIDGET_META[k].galleryHidden);

/**
 * 渲染一个网格条目的**内容**。返回 null = 该条目当前无内容（如日程但没有角色），
 * 调用方可据此跳过或显示占位。
 */
export const renderGridItemContent = (
    item: PlacedItem,
    ctx: WidgetRenderContext,
): React.ReactNode => {
    switch (item.kind) {
        case 'app': {
            const app = INSTALLED_APPS.find(a => a.id === item.refId);
            if (!app) return null;
            return (
                <AppIcon
                    app={app}
                    onClick={() => { if (!ctx.editing) ctx.openApp(app.id); }}
                    disabled={ctx.editing}
                    size="md"
                />
            );
        }
        case 'quad_apps':
            return (
                <QuadAppsWidget
                    apps={item.config?.apps}
                    openApp={ctx.openApp}
                    editing={ctx.editing}
                    contentColor={ctx.contentColor}
                    acnh={ctx.acnh}
                    paper={ctx.paper}
                    onOpenManager={(slotIndex) => ctx.onOpenQuadManager?.(item, slotIndex)}
                    opacity={item.config?.opacity ?? ctx.widgetOpacity?.quad_apps ?? 100}
                />
            );
        case 'clock':
            return <DesktopClockWidget />;
        case 'charCard':
            return (
                <CharacterCardWidget
                    char={ctx.widgetChar}
                    unreadCount={ctx.unreadCount}
                    lastMessage={ctx.lastMessage}
                    onClick={ctx.onOpenCharCard}
                    contentColor={ctx.contentColor}
                    paper={ctx.paper}
                />
            );
        case 'schedule':
            if (!ctx.scheduleChar) return null;
            return (
                <ScheduleHomeWidget
                    schedule={ctx.scheduleData}
                    character={ctx.scheduleChar}
                    contentColor={ctx.contentColor}
                    onOpen={ctx.onOpenSchedule}
                    acnh={ctx.acnh}
                    paper={ctx.paper}
                    editing={ctx.editing}
                    detailed={item.h >= 3}
                    opacity={item.config?.opacity ?? ctx.widgetOpacity?.schedule ?? 100}
                />
            );
        case 'music':
            return (
                <NowPlayingSquareWidget
                    contentColor={ctx.contentColor}
                    openApp={ctx.openApp}
                    editing={ctx.editing}
                />
            );
        case 'image':
            return (
                <DesktopImageWidget
                    image={item.config?.src}
                    contentColor={ctx.contentColor}
                    onClick={() => { if (!ctx.editing) ctx.onEditImage(item); }}
                    acnh={ctx.acnh}
                />
            );
        case 'calendar':
            return (
                <CalendarWidget
                    contentColor={ctx.contentColor}
                    openApp={ctx.openApp}
                    anniversaries={ctx.anniversaries}
                    acnh={ctx.acnh}
                    paper={ctx.paper}
                    editing={ctx.editing}
                    opacity={item.config?.opacity ?? ctx.widgetOpacity?.calendar ?? 100}
                />
            );
        case 'anniversary':
            return (
                <AnniversaryWidget
                    contentColor={ctx.contentColor}
                    openApp={ctx.openApp}
                    anniversaries={ctx.anniversaries}
                    characters={ctx.characters}
                    acnh={ctx.acnh}
                    paper={ctx.paper}
                    editing={ctx.editing}
                />
            );
        case 'memo':
            return (
                <MemoHomeWidget
                    contentColor={ctx.contentColor}
                    openApp={ctx.openApp}
                    acnh={ctx.acnh}
                    paper={ctx.paper}
                    editing={ctx.editing}
                    size={item.w >= 4 ? '4x2' : '2x2'}
                    opacity={item.config?.opacity ?? ctx.widgetOpacity?.memo ?? 100}
                />
            );
        default:
            return null;
    }
};
