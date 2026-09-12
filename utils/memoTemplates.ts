/**
 * utils/memoTemplates.ts
 * 备忘录分类与格式模板体系
 *
 * 1. 分类体系：内置仅保持「默认」「待办」「约定」，支持用户自定义增减标签
 * 2. 格式模板体系：独立可选（表格 / 待办清单 / 日期与时间 / 正文随笔 / 空白），支持在编辑时随时插入或套用
 */

export const BUILTIN_CATEGORIES = ['默认', '待办', '约定'] as const;

export const CUSTOM_CATEGORIES_STORAGE_KEY = 'memo_custom_categories_v1';

export interface MemoFormatTemplate {
    id: string;
    label: string;
    icon: string;
    description: string;
    getTemplate: (todayStr?: string) => string;
}

/**
 * 格式模板定义列表
 */
export const MEMO_FORMAT_TEMPLATES: MemoFormatTemplate[] = [
    {
        id: 'todo',
        label: '待办清单',
        icon: '☑️',
        description: '任务与勾选清单',
        getTemplate: () => `- [ ] 事项一\n- [ ] 事项二\n- [ ] 事项三\n`,
    },
    {
        id: 'datetime',
        label: '日期与时间',
        icon: '📅',
        description: '日程与时间安排',
        getTemplate: (todayStr?: string) => {
            const date = todayStr || new Date().toISOString().split('T')[0];
            return `📅 日期：${date}\n⏰ 时间：15:00 - 17:00\n📍 地点：\n👥 约定对象：\n✨ 事项详情：\n`;
        },
    },
    {
        id: 'table',
        label: '表格',
        icon: '📊',
        description: '结构化对照表格',
        getTemplate: () => 
`| 事项 / 项目 | 详细说明 | 状态 / 备注 |
| :--- | :--- | :--- |
| 示例项目 1 | 详细说明内容 | 进行中 |
| 示例项目 2 | 详细说明内容 | 待开始 |
`,
    },
    {
        id: 'article',
        label: '正文随笔',
        icon: '📝',
        description: '带标题与备忘的正文格式',
        getTemplate: () => `# 主题标题\n\n正文内容记录...\n\n---\n💭 想法与备忘：\n`,
    },
    {
        id: 'blank',
        label: '空白自由',
        icon: '📄',
        description: '空白自由输入',
        getTemplate: () => '',
    },
];

/**
 * 获取本地存储中的自定义标签列表
 */
export function getCustomCategories(): string[] {
    try {
        const raw = localStorage.getItem(CUSTOM_CATEGORIES_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.filter(item => typeof item === 'string' && item.trim() && !BUILTIN_CATEGORIES.includes(item as any));
        }
    } catch (e) {
        console.warn('[memoTemplates] Failed to read custom categories:', e);
    }
    return [];
}

/**
 * 保存自定义标签列表
 */
export function saveCustomCategories(categories: string[]): void {
    try {
        const cleaned = Array.from(new Set(
            categories
                .map(c => c.trim())
                .filter(c => c && !BUILTIN_CATEGORIES.includes(c as any))
        ));
        localStorage.setItem(CUSTOM_CATEGORIES_STORAGE_KEY, JSON.stringify(cleaned));
    } catch (e) {
        console.warn('[memoTemplates] Failed to save custom categories:', e);
    }
}

/**
 * 添加自定义标签
 */
export function addCustomCategory(cat: string): string[] {
    const trimmed = cat.trim();
    if (!trimmed || BUILTIN_CATEGORIES.includes(trimmed as any)) {
        return getCustomCategories();
    }
    const current = getCustomCategories();
    if (!current.includes(trimmed)) {
        current.push(trimmed);
        saveCustomCategories(current);
    }
    return current;
}

/**
 * 删除自定义标签
 */
export function deleteCustomCategory(cat: string): string[] {
    const current = getCustomCategories();
    const next = current.filter(c => c !== cat.trim());
    saveCustomCategories(next);
    return next;
}

/**
 * 获取完整的标签列表（含内置与用户自定义）
 */
export function getAllMemoCategories(): string[] {
    const custom = getCustomCategories();
    return [...BUILTIN_CATEGORIES, ...custom];
}

/**
 * 根据分类获取默认推荐的格式模板
 */
export function getDefaultTemplateForCategory(category: string, todayStr?: string): string {
    if (category === '待办') {
        return MEMO_FORMAT_TEMPLATES.find(t => t.id === 'todo')?.getTemplate(todayStr) || '';
    }
    if (category === '约定') {
        return MEMO_FORMAT_TEMPLATES.find(t => t.id === 'datetime')?.getTemplate(todayStr) || '';
    }
    return '';
}
