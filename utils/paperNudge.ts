import type { Message, StudyPaper, APIConfig } from '../types';
import { DB } from './db';
import { searchEuropePmcArticles, fetchAndParseStudyPaper } from './europePmc';
import { translateStudyPaper } from './paperTranslator';

/**
 * 触发晨读文献向指定角色的聊天流推送「文献简报卡片」
 */
export async function pushMorningPaperToChat(
    charId: string,
    keyword: string = 'CRISPR',
    apiConfig?: APIConfig
): Promise<Message> {
    // 1. 检索该学科关键词的前沿文献
    const searchResults = await searchEuropePmcArticles(keyword, 5);
    if (!searchResults.length) {
        throw new Error(`未检索到与 "${keyword}" 相关的开放获取文献`);
    }

    // 2. 检查是否有尚未抓取过的文献
    const existingPapers = await DB.getAllPapers();
    const existingIds = new Set(existingPapers.map(p => p.pmcid));

    let chosenSummary = searchResults.find(s => s.pmcid && !existingIds.has(s.pmcid));
    if (!chosenSummary) {
        // 如果都抓过，默认取最新的一篇
        chosenSummary = searchResults[0];
    }

    let paper: StudyPaper | null = null;
    if (chosenSummary.pmcid && existingIds.has(chosenSummary.pmcid)) {
        paper = await DB.getPaperById(chosenSummary.pmcid);
    }

    if (!paper && chosenSummary.pmcid) {
        paper = await fetchAndParseStudyPaper(chosenSummary.pmcid, [keyword]);
        // 如果有 API，可自动翻译提炼百字总结
        if (apiConfig && apiConfig.apiKey) {
            try {
                paper = await translateStudyPaper(paper, apiConfig);
            } catch (e) {
                console.warn('晨推前双语翻译失败，使用原文:', e);
            }
        }
        await DB.savePaper(paper);
    }

    if (!paper) {
        throw new Error('文献数据解析失败');
    }

    // 3. 构建晨读卡片消息
    const figureBlock = paper.blocks.find(b => b.type === 'figure') as any;
    const morningGreetings = [
        '早安！今日份的学术文献晨读已为你准备好了，请查收：',
        '清晨好！为你挑选了一篇刚刚发布的前沿研究，一起晨读吧：',
        '今天的文献速递来啦！趁着清晨思路清晰，来看看这篇最新成果：',
        '早安，为你抓取了今天的 Europe PMC 学术晨读专栏：'
    ];
    const greeting = morningGreetings[Math.floor(Math.random() * morningGreetings.length)];

    const cardMessage: Message = {
        id: Date.now(),
        charId,
        role: 'assistant',
        type: 'paper_card',
        content: `${greeting}\n《${paper.titleZh || paper.title}》`,
        timestamp: Date.now(),
        metadata: {
            paperId: paper.id,
            pmcid: paper.pmcid,
            title: paper.title,
            titleZh: paper.titleZh,
            journal: paper.journalTitle || 'Europe PMC',
            summary100: paper.summary100,
            imageUrl: figureBlock?.imageUrl
        }
    };

    await DB.saveMessage(cardMessage);
    return cardMessage;
}
