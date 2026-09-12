import type { StudyPaper, PaperBlock, APIConfig } from '../types';
import { safeResponseJson, extractJson } from './safeApi';

export const DEFAULT_PAPER_TRANSLATION_PROMPT = `你是一位享誉学术界的顶级期刊翻译家兼资深学科主编（精通生物医学、人工智能、物理化学等跨学科前沿）。
你的任务是将输入的学术文献（已拆解为积木块 Block）翻译为地道、典雅且极其精准的中文学术译文。

【翻译准则与硬性约束】：
1. 绝对消除生硬机翻感，符合顶级中文核心学术期刊（如《中国科学》、《科学通报》）的严谨文风。
2. 严格保护并原样保留所有 LaTeX 数学公式（包括行内 $...$ 与独立块 $$...$$），禁止篡改其中的反斜杠与格式。
3. 严格保护专业缩写、基因/蛋白命名（如 CRISPR, Cas12a, MAPK9, mRNA, siRNA, IgG 等）以及度量衡单位（如 μg/mL, nm, kDa, mg/kg, h, min）。
4. 严格规范希腊字母（α, β, γ, δ 等）与化学式。
5. 保持句式流畅连贯、逻辑缜密，将复杂的英语长难句重构成严谨通顺的学术汉语。`;

/**
 * 获取文献翻译实际生效的 API 配置（优先读取文献专用 API，留空则使用兜底 API）
 */
export function getPaperApiConfig(fallbackConfig: APIConfig): APIConfig {
    try {
        const saved = localStorage.getItem('study_paper_api_config');
        if (saved) {
            const parsed = JSON.parse(saved);
            const baseUrl = (parsed.baseUrl || '').trim() || fallbackConfig.baseUrl;
            const apiKey = (parsed.apiKey || '').trim() || fallbackConfig.apiKey;
            const model = (parsed.model || '').trim() || fallbackConfig.model;
            return { baseUrl, apiKey, model };
        }
    } catch {}
    return fallbackConfig;
}

/**
 * 获取文献翻译提示词（优先读取用户自定义提示词，未设置则使用默认学术期刊提示词）
 */
export function getPaperTranslationPrompt(): string {
    try {
        const saved = localStorage.getItem('study_paper_translation_prompt');
        if (saved && saved.trim()) return saved.trim();
    } catch {}
    return DEFAULT_PAPER_TRANSLATION_PROMPT;
}

/**
 * 翻译单个块（用户点击未翻译段落时按需即时翻译）
 */
export async function translateSingleBlock(
    text: string,
    apiConfig: APIConfig,
    customPrompt?: string
): Promise<string> {
    if (!text.trim()) return '';

    const effectiveConfig = getPaperApiConfig(apiConfig);
    const systemPrompt = customPrompt || getPaperTranslationPrompt();

    const prompt = `请将以下英文学术段落翻译为专业、精准的中文学术译文。
严格保留 LaTeX 公式（$...$）、专业缩写与单位。直接输出中文译文，不要多余说明。

英文原文：
${text}`;

    const response = await fetch(`${effectiveConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${effectiveConfig.apiKey}`
        },
        body: JSON.stringify({
            model: effectiveConfig.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 1500
        })
    });

    if (!response.ok) throw new Error(`翻译请求失败: HTTP ${response.status}`);
    const data = await safeResponseJson(response);
    return (data.choices?.[0]?.message?.content || '').trim();
}

/**
 * 针对整篇文献进行学术级双语翻译与百字晨读提炼
 */
export async function translateStudyPaper(
    paper: StudyPaper,
    apiConfig: APIConfig,
    onProgress?: (percent: number, statusText: string) => void,
    customPrompt?: string
): Promise<StudyPaper> {
    const effectiveConfig = getPaperApiConfig(apiConfig);
    const systemPrompt = customPrompt || getPaperTranslationPrompt();
    const updatedPaper: StudyPaper = JSON.parse(JSON.stringify(paper));

    // 1. 第一阶段：翻译标题并提炼【百字晨读机理与创新点总结】
    onProgress?.(10, '正在提炼百字晨读机理与翻译论文标题...');

    // 提取用于提炼前沿总结的开头部分段落（通常包含摘要与引言）
    const introBlocks = updatedPaper.blocks.slice(0, 8);
    const introContext = introBlocks.map(b => {
        if (b.type === 'heading') return `### ${b.text}`;
        if (b.type === 'paragraph') return b.text;
        return '';
    }).filter(Boolean).join('\n\n');

    const summaryPrompt = `针对以下学术文献的标题与摘要内容：
标题: ${updatedPaper.title}
期刊: ${updatedPaper.journalTitle || 'Academic Journal'}
全文摘录:
${introContext.slice(0, 3500)}

请完成两项任务并严格输出为 JSON 格式：
1. "titleZh": 翻译为精准得体的学术中文标题。
2. "summary100": 撰写一段严格在 80~120 字以内的【晨读核心机理与创新点总结】。要求：开门见山点出本研究针对什么关键问题、构建了什么核心机制/模型/平台、实现了何种突破或性能提升、有何潜在应用价值。文笔极其洗练高雅，适合科研学者清晨速读。

输出格式（纯 JSON）：
{
  "titleZh": "...",
  "summary100": "..."
}`;

    try {
        const sumResp = await fetch(`${effectiveConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${effectiveConfig.apiKey}`
            },
            body: JSON.stringify({
                model: effectiveConfig.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: summaryPrompt }
                ],
                temperature: 0.3,
                max_tokens: 1000
            })
        });

        if (sumResp.ok) {
            const sumData = await safeResponseJson(sumResp);
            const sumContent = sumData.choices?.[0]?.message?.content || '';
            const parsedJson = extractJson(sumContent);
            if (parsedJson) {
                if (parsedJson.titleZh) updatedPaper.titleZh = parsedJson.titleZh;
                if (parsedJson.summary100) updatedPaper.summary100 = parsedJson.summary100;
            }
        }
    } catch (err) {
        console.warn('提取百字晨读机理失败，继续正文翻译:', err);
    }

    // 2. 第二阶段：分批翻译积木块（heading, paragraph, figure caption）
    // 为保证质量与速度，优先翻译前 30 个核心块（通常覆盖摘要、引言与关键结果）
    const translatableBlocks = updatedPaper.blocks.filter(b => {
        if (b.type === 'heading' && !b.textZh) return true;
        if (b.type === 'paragraph' && !b.textZh) return true;
        if (b.type === 'figure' && b.caption && !b.captionZh) return true;
        return false;
    });

    const totalToTranslate = Math.min(translatableBlocks.length, 30);
    const BATCH_SIZE = 6;
    let translatedCount = 0;

    for (let i = 0; i < totalToTranslate; i += BATCH_SIZE) {
        const batch = translatableBlocks.slice(i, i + BATCH_SIZE);
        const progressPct = Math.round(20 + ((i / totalToTranslate) * 75));
        onProgress?.(progressPct, `正在精翻文献积木块 (${i + 1}/${totalToTranslate})...`);

        const payload = batch.map(b => ({
            id: b.id,
            type: b.type,
            text: b.type === 'figure' ? (b.caption || '') : b.text
        }));

        const batchPrompt = `请将下列文献积木块逐一翻译为中文学术译文：
${JSON.stringify(payload, null, 2)}

严格遵循要求：
1. 输出 JSON 格式，包含 "translations" 数组，每个元素形式为：{"id": "块id", "zh": "中文学术译文"}。
2. 保持 LaTeX 公式 $...$、专业缩写（如 CRISPR, LNP 等）原样不变。
3. 语言精准凝练。

格式示例：
{
  "translations": [
    { "id": "block-1", "zh": "..." }
  ]
}`;

        try {
            const bResp = await fetch(`${effectiveConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${effectiveConfig.apiKey}`
                },
                body: JSON.stringify({
                    model: effectiveConfig.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: batchPrompt }
                    ],
                    temperature: 0.3,
                    max_tokens: 3000
                })
            });

            if (bResp.ok) {
                const bData = await safeResponseJson(bResp);
                const bContent = bData.choices?.[0]?.message?.content || '';
                const bJson = extractJson(bContent);
                const transList: Array<{ id: string; zh: string }> = bJson?.translations || [];

                for (const t of transList) {
                    const targetBlock = updatedPaper.blocks.find(blk => blk.id === t.id);
                    if (targetBlock) {
                        if (targetBlock.type === 'figure') {
                            targetBlock.captionZh = t.zh;
                        } else {
                            targetBlock.textZh = t.zh;
                        }
                    }
                }
                translatedCount += batch.length;
            }
        } catch (batchErr) {
            console.warn(`第 ${i} 批积木块翻译失败:`, batchErr);
        }
    }

    updatedPaper.translatedAt = Date.now();
    onProgress?.(100, '学术双语对照文献生成完毕！');

    return updatedPaper;
}
