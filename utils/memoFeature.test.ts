import { describe, it, expect, beforeEach } from 'vitest';
import {
    BUILTIN_CATEGORIES,
    MEMO_FORMAT_TEMPLATES,
    getCustomCategories,
    saveCustomCategories,
    addCustomCategory,
    deleteCustomCategory,
    getAllMemoCategories,
    getDefaultTemplateForCategory,
    CUSTOM_CATEGORIES_STORAGE_KEY,
} from './memoTemplates';
import { stripBusinessTagsForBubble } from './sanitize';

describe('Memo Templates & Categories (备忘录分类与模板系统)', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('内置分类仅包含 默认、待办、约定', () => {
        expect(BUILTIN_CATEGORIES).toEqual(['默认', '待办', '约定']);
    });

    it('格式模板包含 待办清单、日期与时间、表格、正文随笔与空白', () => {
        const ids = MEMO_FORMAT_TEMPLATES.map(t => t.id);
        expect(ids).toContain('todo');
        expect(ids).toContain('datetime');
        expect(ids).toContain('table');
        expect(ids).toContain('article');
        expect(ids).toContain('blank');

        const tableTpl = MEMO_FORMAT_TEMPLATES.find(t => t.id === 'table')!;
        expect(tableTpl.getTemplate()).toContain('| 事项 / 项目 |');

        const todoTpl = MEMO_FORMAT_TEMPLATES.find(t => t.id === 'todo')!;
        expect(todoTpl.getTemplate()).toContain('- [ ]');

        const dtTpl = MEMO_FORMAT_TEMPLATES.find(t => t.id === 'datetime')!;
        expect(dtTpl.getTemplate('2026-09-10')).toContain('📅 日期：2026-09-10');
        expect(dtTpl.getTemplate('2026-09-10')).toContain('⏰ 时间：');
    });

    it('自定义标签支持新增、去重、持久化与删除', () => {
        expect(getCustomCategories()).toEqual([]);

        // 添加自定义标签
        addCustomCategory('灵感随笔');
        expect(getCustomCategories()).toContain('灵感随笔');

        // 重复添加不应重复
        addCustomCategory('灵感随笔');
        expect(getCustomCategories().filter(c => c === '灵感随笔').length).toBe(1);

        // 不能把内置分类添加为自定义标签
        addCustomCategory('待办');
        expect(getCustomCategories()).not.toContain('待办');

        // 添加另一个
        addCustomCategory('旅行计划');
        expect(getAllMemoCategories()).toEqual(['默认', '待办', '约定', '灵感随笔', '旅行计划']);

        // 删除自定义标签
        deleteCustomCategory('灵感随笔');
        expect(getCustomCategories()).not.toContain('灵感随笔');
        expect(getCustomCategories()).toContain('旅行计划');
    });

    it('分类推荐默认模板正确映射', () => {
        expect(getDefaultTemplateForCategory('待办')).toContain('- [ ]');
        expect(getDefaultTemplateForCategory('约定', '2026-09-10')).toContain('📅 日期：2026-09-10');
        expect(getDefaultTemplateForCategory('默认')).toBe('');
        expect(getDefaultTemplateForCategory('自定义标签')).toBe('');
    });
});

describe('READ_MEMO 业务标签清洗', () => {
    it('stripBusinessTagsForBubble 能够彻底清洗 [[READ_MEMO: ...]] 标签', () => {
        const raw = '稍等，我看一下便签内容 [[READ_MEMO: 购物清单]] 好的，我看到了！';
        const cleaned = stripBusinessTagsForBubble(raw);
        expect(cleaned).not.toContain('READ_MEMO');
        expect(cleaned).toContain('稍等，我看一下便签内容');
        expect(cleaned).toContain('好的，我看到了！');
    });

    it('stripBusinessTagsForBubble 容错带换行和空格的 READ_MEMO 标签', () => {
        const raw = '[[READ_MEMO:\n  秘密计划  ]]\n这是正文';
        const cleaned = stripBusinessTagsForBubble(raw);
        expect(cleaned.trim()).toBe('这是正文');
    });
});
