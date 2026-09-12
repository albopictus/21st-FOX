import { searchEuropePmcArticles, EuropePmcArticleSummary } from './europePmc';

export interface DailyPaperDiscovery {
    date: string; // YYYY-MM-DD
    tag: string;
    paper: EuropePmcArticleSummary;
    updatedAt: number;
}

const STORAGE_PREFIX = 'sully_daily_paper_';

export function getTodayDateString(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 获取今日学术偶遇文献（每日随机抽取关注领域高分文献，并每日缓存）
 */
export async function getDailyDiscoveryPaper(
    userTags: string[],
    forceRefresh: boolean = false
): Promise<DailyPaperDiscovery | null> {
    const today = getTodayDateString();
    const cacheKey = `${STORAGE_PREFIX}${today}`;

    // 1. 若非强制刷新，优先检查今日本地缓存
    if (!forceRefresh) {
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed: DailyPaperDiscovery = JSON.parse(cached);
                if (parsed && parsed.paper && parsed.date === today) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('读取今日学术偶遇缓存失败:', e);
        }
    }

    // 2. 随机选取用户标签
    const effectiveTags = userTags.length > 0
        ? userTags
        : ['Neuroscience', 'CRISPR', 'Optogenetics', 'Microglia', 'Synthetic Biology'];
    const randomTag = effectiveTags[Math.floor(Math.random() * effectiveTags.length)];

    try {
        // 抓取该学科前 15 条高分文献
        const list = await searchEuropePmcArticles(randomTag, 15);
        if (!list || list.length === 0) {
            return null;
        }

        // 随机挑选一篇（优先选择有摘要、且有 PMC 全文的）
        const candidates = list.filter(item => Boolean(item.abstractText));
        const pool = candidates.length > 0 ? candidates : list;
        const picked = pool[Math.floor(Math.random() * pool.length)];

        const discovery: DailyPaperDiscovery = {
            date: today,
            tag: randomTag,
            paper: picked,
            updatedAt: Date.now()
        };

        // 写入缓存
        try {
            localStorage.setItem(cacheKey, JSON.stringify(discovery));
        } catch {}

        return discovery;
    } catch (e) {
        console.error('获取今日学术偶遇失败:', e);
        return null;
    }
}
