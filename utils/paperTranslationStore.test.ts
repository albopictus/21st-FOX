import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paperTranslationStore } from './paperTranslationStore';
import { DB } from './db';
import * as paperTranslator from './paperTranslator';
import type { StudyPaper } from '../types';

const MOCK_PAPER: StudyPaper = {
    id: 'paper-123',
    title: 'A Study on AI',
    pubDate: '2026',
    blocks: [
        { id: 'b1', type: 'paragraph', text: 'Hello world' }
    ],
    tags: ['ai'],
    savedAt: Date.now()
};

describe('paperTranslationStore', () => {
    beforeEach(() => {
        paperTranslationStore.reset();
        vi.restoreAllMocks();
    });

    it('初始状态为 idle', () => {
        expect(paperTranslationStore.get()).toEqual({ status: 'idle' });
    });

    it('deepLink 触发与清除', () => {
        paperTranslationStore.set({
            status: 'ready',
            paperId: 'paper-123',
            paperTitle: 'A Study on AI',
            paper: MOCK_PAPER
        });

        paperTranslationStore.requestOpen();
        expect(paperTranslationStore.get().deepLink).toBe(true);

        paperTranslationStore.clearDeepLink();
        expect(paperTranslationStore.get().deepLink).toBe(false);
    });

    it('没有 API Key 时抛错，不发起翻译', async () => {
        await expect(
            paperTranslationStore.startTranslation(MOCK_PAPER, { baseUrl: '', apiKey: '', model: '' })
        ).rejects.toThrow('请先在自习室设置中配置 API Key');

        expect(paperTranslationStore.get().status).toBe('idle');
    });

    it('成功执行翻译：流转 loading -> ready，并自动落库 DB.savePaper', async () => {
        const saveSpy = vi.spyOn(DB, 'savePaper').mockResolvedValue(undefined);
        const translatedMockPaper: StudyPaper = {
            ...MOCK_PAPER,
            translatedAt: 123456789,
            blocks: [{ id: 'b1', type: 'paragraph', text: 'Hello world', textZh: '你好，世界' }]
        };

        vi.spyOn(paperTranslator, 'translateStudyPaper').mockImplementation(async (_p, _cfg, onProgress) => {
            onProgress?.(50, '翻译中...');
            return translatedMockPaper;
        });

        const promise = paperTranslationStore.startTranslation(
            MOCK_PAPER,
            { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4o' }
        );

        const result = await promise;

        expect(result.translatedAt).toBe(123456789);
        expect(saveSpy).toHaveBeenCalledWith(translatedMockPaper);

        const cur = paperTranslationStore.get();
        expect(cur.status).toBe('ready');
        if (cur.status === 'ready') {
            expect(cur.paperId).toBe('paper-123');
            expect(cur.paper.blocks[0].textZh).toBe('你好，世界');
        }
    });

    it('翻译失败时进入 error 状态', async () => {
        vi.spyOn(paperTranslator, 'translateStudyPaper').mockRejectedValue(new Error('Network Timeout'));

        await expect(
            paperTranslationStore.startTranslation(
                MOCK_PAPER,
                { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4o' }
            )
        ).rejects.toThrow('Network Timeout');

        const cur = paperTranslationStore.get();
        expect(cur.status).toBe('error');
        if (cur.status === 'error') {
            expect(cur.paperId).toBe('paper-123');
            expect(cur.error).toBe('Network Timeout');
        }
    });
});
