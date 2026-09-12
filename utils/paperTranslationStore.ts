import { useSyncExternalStore } from 'react';
import type { StudyPaper, APIConfig } from '../types';
import { DB } from './db';
import { translateStudyPaper, getPaperApiConfig } from './paperTranslator';

// 全局「学术文献」精翻状态。
// 放在模块作用域而非 PaperReader 内部，这样：
//   1. 翻译中即便切走页面（甚至离开自习室、切到 Chat / 小小窝），后台翻译任务依旧持续执行；
//   2. PhoneShell 里的全局指示条随处可见翻译进度，点一下深链回到文献阅读器；
//   3. 翻译完成自动写回 IndexedDB，永不丢数据。

export type PaperTransState =
    | { status: 'idle' }
    | { status: 'loading'; paperId: string; paperTitle: string; percent: number; statusText: string }
    | { status: 'ready'; paperId: string; paperTitle: string; paper: StudyPaper }
    | { status: 'error'; paperId: string; paperTitle: string; error: string };

export type GlobalPaperTransState = PaperTransState & {
    deepLink?: boolean; // 用户点击全局指示条，请求自习室直接进入该文献
};

let state: GlobalPaperTransState = { status: 'idle' };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const paperTranslationStore = {
    get: (): GlobalPaperTransState => state,
    set: (s: GlobalPaperTransState) => { state = s; emit(); },
    reset: () => { state = { status: 'idle' }; emit(); },
    requestOpen: () => { state = { ...state, deepLink: true }; emit(); },
    clearDeepLink: () => { if (state.deepLink) { state = { ...state, deepLink: false }; emit(); } },
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },

    /**
     * 发起全文学术精翻后台任务
     */
    startTranslation: async (
        paper: StudyPaper,
        apiConfig: APIConfig,
        customPrompt?: string
    ): Promise<StudyPaper> => {
        const effectiveConfig = getPaperApiConfig(apiConfig);
        if (!effectiveConfig.apiKey) {
            throw new Error('请先在自习室设置中配置 API Key（或文献翻译专用 API）');
        }

        const paperId = paper.id;
        const paperTitle = paper.title;

        paperTranslationStore.set({
            status: 'loading',
            paperId,
            paperTitle,
            percent: 5,
            statusText: '准备发送学术文献积木块...'
        });

        try {
            const updated = await translateStudyPaper(
                paper,
                apiConfig,
                (pct, statusText) => {
                    // 仅当还是当前论文任务时更新进度
                    const cur = paperTranslationStore.get();
                    if (cur.status === 'loading' && cur.paperId === paperId) {
                        paperTranslationStore.set({
                            status: 'loading',
                            paperId,
                            paperTitle,
                            percent: pct,
                            statusText
                        });
                    }
                },
                customPrompt
            );

            // 翻译成功直接落库持久化，即使切了页面也绝对不丢结果
            await DB.savePaper(updated);

            paperTranslationStore.set({
                status: 'ready',
                paperId,
                paperTitle,
                paper: updated
            });

            return updated;
        } catch (err: any) {
            const errorMsg = err.message || '网络异常';
            paperTranslationStore.set({
                status: 'error',
                paperId,
                paperTitle,
                error: errorMsg
            });
            throw err;
        }
    }
};

export function usePaperTranslation(): GlobalPaperTransState {
    return useSyncExternalStore(paperTranslationStore.subscribe, paperTranslationStore.get, paperTranslationStore.get);
}
