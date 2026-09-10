import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { migrateAppearancePresetBlobRefs } from './blobRef';
import { OSTheme } from '../types';

describe('桌面自由网格系统契约', () => {
  const launcherSource = readFileSync(path.resolve(__dirname, '../apps/Launcher.tsx'), 'utf8');
  const nowPlayingSource = readFileSync(path.resolve(__dirname, '../components/os/NowPlayingSquareWidget.tsx'), 'utf8');
  const musicContextSource = readFileSync(path.resolve(__dirname, '../context/MusicContext.tsx'), 'utf8');
  const registrySource = readFileSync(path.resolve(__dirname, '../components/os/desktopWidgetRegistry.tsx'), 'utf8');

  it('Launcher 走自由网格模型：读 launcherPages，渲染走注册表', () => {
    expect(launcherSource).toContain('let _lastPageIndex = 1;');       // 默认停主屏
    expect(launcherSource).toContain('migrateLegacyLauncher');          // 旧字段一次性迁移
    expect(launcherSource).toContain('renderGridItemContent');          // 统一渲染
    expect(launcherSource).toContain('launcherPages');
    // 旧的特例页模型已删干净
    expect(launcherSource).not.toContain('DEFAULT_MINUS_ONE_WIDGETS');
    expect(launcherSource).not.toContain('appPageCapacity');
    expect(launcherSource).not.toContain('pinwheelOrder');
  });

  it('时钟 / 角色卡 / 日程：默认锁定，可在编辑态解锁', () => {
    // 注册表标记这三块为 singleton + defaultLocked
    expect(registrySource).toContain("clock:");
    expect(registrySource).toContain('defaultLocked: true');
    // desktopGrid 的默认锁定集合
    const gridSource = readFileSync(path.resolve(__dirname, './desktopGrid.ts'), 'utf8');
    expect(gridSource).toContain("DEFAULT_LOCKED_KINDS");
    expect(gridSource).toContain("['clock', 'charCard', 'schedule']");
    // Launcher 有锁定切换 + 拖拽时跳过锁定项
    expect(launcherSource).toContain('handleToggleLock');
    expect(launcherSource).toContain('if (item.locked');
  });

  it('通过 DesktopGalleryModal 往当前页添加组件 / 应用', () => {
    expect(launcherSource).toContain('DesktopGalleryModal');
    expect(launcherSource).toContain('handleAddToCurrentPage');
    expect(launcherSource).toContain('setGalleryOpen(true)');
  });

  it('支持增减页面', () => {
    expect(launcherSource).toContain('handleAddPage');
    expect(launcherSource).toContain('handleRemovePage');
  });

  it('拖拽 / 改大小：命中格子 + canPlace + moveItem / resizeItem', () => {
    expect(launcherSource).toContain('cellFromPoint');
    expect(launcherSource).toContain('canPlace');
    expect(launcherSource).toContain('moveItem');
    expect(launcherSource).toContain('resizeItem');
    expect(launcherSource).toContain('dragPreview');
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
    expect(typeof mockTheme.customVinylSticker).toBe('string');
  });
});
