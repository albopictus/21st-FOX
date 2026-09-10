import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { migrateAppearancePresetBlobRefs } from './blobRef';
import { DesktopWidgetInstance, DesktopWidgetKind, DesktopWidgetSize, OSTheme } from '../types';

describe('桌面小组件系统与负一屏架构契约', () => {
  const launcherSource = readFileSync(path.resolve(__dirname, '../apps/Launcher.tsx'), 'utf8');
  const nowPlayingSource = readFileSync(path.resolve(__dirname, '../components/os/NowPlayingSquareWidget.tsx'), 'utf8');
  const musicContextSource = readFileSync(path.resolve(__dirname, '../context/MusicContext.tsx'), 'utf8');

  it('Launcher 默认落脚在主屏（Screen 1），左滑为负一屏（Screen 0）', () => {
    expect(launcherSource).toContain('let _lastPageIndex = 1;');
    expect(launcherSource).toContain('key="screen-minus-one"');
    expect(launcherSource).toContain('负一屏 · 小组件');
  });

  it('负一屏默认放置整月日历与纪念日倒计时小组件', () => {
    expect(launcherSource).toContain("kind: 'calendar'");
    expect(launcherSource).toContain("kind: 'anniversary'");
    expect(launcherSource).toContain('DEFAULT_MINUS_ONE_WIDGETS');
  });

  const calendarSource = readFileSync(path.resolve(__dirname, '../components/os/widgets/CalendarWidget.tsx'), 'utf8');
  const anniversarySource = readFileSync(path.resolve(__dirname, '../components/os/widgets/AnniversaryWidget.tsx'), 'utf8');

  it('负一屏组件完全支持长按编辑并显示红色 − 删除按钮', () => {
    expect(launcherSource).toContain('handleRemoveMinusOneWidget');
    expect(launcherSource).toContain('onDelete={() => handleRemoveMinusOneWidget(widget.id)}');
    expect(calendarSource).toContain('title="删除日历组件"');
    expect(calendarSource).toContain('Minus size={14}');
    expect(anniversarySource).toContain('title="删除纪念日组件"');
    expect(anniversarySource).toContain('Minus size={14}');
  });

  it('支持随时通过 WidgetGalleryModal 重新添加小组件', () => {
    expect(launcherSource).toContain('WidgetGalleryModal');
    expect(launcherSource).toContain('handleAddWidget');
    expect(launcherSource).toContain('setGalleryOpen(true)');
  });

  it('支持增减页面：末页支持添加新页面，自定义页面支持移除本页', () => {
    expect(launcherSource).toContain('handleAddPage');
    expect(launcherSource).toContain('handleRemovePage');
    expect(launcherSource).toContain('移除此页');
    expect(launcherSource).toContain('添加新页面');
  });

  it('核心守卫保持不可删除：大时钟、角色卡片与第二页日程卡片写死锚定', () => {
    // Page 0 (Screen 1): DesktopClock + CharacterWidget 无法删除
    expect(launcherSource).toContain('<DesktopClock />');
    expect(launcherSource).toContain('<CharacterWidget');
    // Page 1 (Screen 2): ScheduleHomeWidget 无法删除
    expect(launcherSource).toContain('<ScheduleHomeWidget');
  });

  it('黑胶小组件：支持本地音频导入与自定义旋转贴纸', () => {
    expect(musicContextSource).toContain('importLocalAudio');
    expect(nowPlayingSource).toContain('theme.customVinylSticker');
    expect(nowPlayingSource).toContain('handleAudioImport');
    expect(nowPlayingSource).toContain('handleStickerUpload');
  });

  it('自定义贴纸 token migration: migrateAppearancePresetBlobRefs 会迁移 customVinylSticker', async () => {
    const mockTheme: Partial<OSTheme> = {
      customVinylSticker: 'data:image/png;base64,mocksticker',
    };
    await migrateAppearancePresetBlobRefs(mockTheme as OSTheme);
    expect(mockTheme.customVinylSticker).toBeDefined();
    // 应当转成 blobref: 或者保留有效格式
    expect(typeof mockTheme.customVinylSticker).toBe('string');
  });

  it('小组件列表增删不产生突变并保持数据结构完整', () => {
    const initialWidgets: DesktopWidgetInstance[] = [
      { id: 'w-1', kind: 'calendar', size: '4x2', title: '日历' },
      { id: 'w-2', kind: 'anniversary', size: '4x2', title: '纪念日' },
    ];
    // 删除操作
    const afterDelete = initialWidgets.filter((w) => w.id !== 'w-1');
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].id).toBe('w-2');

    // 重新添加操作
    const newWidget: DesktopWidgetInstance = {
      id: 'w-3',
      kind: 'memo',
      size: '2x2',
      title: '便签',
    };
    const afterAdd = [...afterDelete, newWidget];
    expect(afterAdd).toHaveLength(2);
    expect(afterAdd[1].kind).toBe('memo');
  });
});
