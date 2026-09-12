import type { StudyPaper } from '../types';
import { parseJatsXml } from './jatsParser';

const BASE_URL = 'https://www.ebi.ac.uk/europepmc/webservices/rest';

export interface EuropePmcArticleSummary {
    id: string;
    pmcid?: string;
    title: string;
    authorString?: string;
    journalTitle?: string;
    pubYear?: string;
    firstPublicationDate?: string;
    pubDate?: string;
    doi?: string;
    abstractText?: string;
    isOpenAccess?: string;
    hasFT?: string;
    pubType?: string;
    isAbstractOnly?: boolean;
}

/**
 * 检索欧洲生物信息研究所（Europe PMC）的开放获取全文文献
 * @param query 学科或研究关键词（如 "CRISPR", "optogenetics", "microglia"）
 * @param limit 返回条数，默认 10
 */
export async function searchEuropePmcArticles(query: string, limit: number = 8): Promise<EuropePmcArticleSummary[]> {
    const trimmed = query.trim() || 'bioengineering';
    // 强制限制仅搜索具备开放获取（Open Access）与具备全文 XML 的文献
    const queryString = `OPEN_ACCESS:Y AND HAS_FT:Y AND (${trimmed})`;
    const url = `${BASE_URL}/search?query=${encodeURIComponent(queryString)}&format=json&pageSize=${limit}&resultType=core`;

    const res = await fetch(url, {
        headers: {
            'Accept': 'application/json'
        }
    });

    if (!res.ok) {
        throw new Error(`Europe PMC 检索失败: HTTP ${res.status}`);
    }

    const data = await res.json();
    const list: any[] = data?.resultList?.result || [];

    return list.map(item => {
        const rawAbstract = item.abstractText || '';
        const cleanAbstract = rawAbstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const journalTitle = item.journalTitle || item.journalInfo?.journal?.title || item.journalInfo?.journal?.medlineAbbreviation || 'Academic';
        const pubDate = item.firstPublicationDate
            || item.electronicPublicationDate
            || item.journalInfo?.printPublicationDate
            || item.journalInfo?.dateOfPublication
            || item.pubYear;

        const pubTypes: string = (
            typeof item.pubTypeList?.pubType === 'string'
                ? item.pubTypeList.pubType
                : Array.isArray(item.pubTypeList?.pubType)
                ? item.pubTypeList.pubType.join(' ')
                : ''
        );
        const isAbstractOnly = /meeting|conference|abstract/i.test(pubTypes);

        return {
            id: item.id,
            pmcid: item.pmcid || (item.source === 'PMC' ? `PMC${item.id}` : undefined),
            title: (item.title || '').replace(/\.$/, ''),
            authorString: item.authorString,
            journalTitle,
            pubYear: item.pubYear,
            firstPublicationDate: item.firstPublicationDate,
            pubDate,
            doi: item.doi,
            abstractText: cleanAbstract || undefined,
            isOpenAccess: item.isOpenAccess,
            hasFT: item.hasFT,
            pubType: pubTypes || undefined,
            isAbstractOnly
        };
    }).filter(item => Boolean(item.pmcid));
}

/**
 * 获取指定 PMC 的 JATS XML 全文（优先请求 Europe PMC REST API，遭遇 503 等异常时自动兜底切换至 NCBI PMC efetch）
 */
export async function fetchEuropePmcFullTextXml(pmcid: string): Promise<string> {
    const cleanId = pmcid.toUpperCase().startsWith('PMC') ? pmcid.toUpperCase() : `PMC${pmcid}`;
    const numericId = cleanId.replace(/^PMC/i, '');

    // 1. 优先尝试 Europe PMC REST 端点
    try {
        const url = `${BASE_URL}/${cleanId}/fullTextXML`;
        const res = await fetch(url, {
            headers: {
                'Accept': 'application/xml, text/xml'
            }
        });

        if (res.ok) {
            const xml = await res.text();
            if (xml && xml.length >= 50 && !xml.includes('503 Service Temporarily Unavailable')) {
                return xml;
            }
        }
    } catch (e) {
        console.warn(`Europe PMC fetch 异常，尝试切换至 NCBI 兜底:`, e);
    }

    // 2. 备选方案：NCBI Entrez efetch
    try {
        const ncbiUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${numericId}&retmode=xml`;
        const ncbiRes = await fetch(ncbiUrl);
        if (ncbiRes.ok) {
            const ncbiXml = await ncbiRes.text();
            if (ncbiXml && ncbiXml.length >= 50) {
                return ncbiXml;
            }
        }
    } catch (e) {
        console.warn(`NCBI fallback 也未能获取:`, e);
    }

    throw new Error(`获取文献 JATS XML 失败 (${cleanId}): Europe PMC 与 NCBI 均未能返回有效全文`);
}

/**
 * 高级封装：一键抓取、清洗并解析为积木协议 StudyPaper
 */
export async function fetchAndParseStudyPaper(
    pmcid: string,
    keywords: string[] = [],
    summaryFallback?: Partial<EuropePmcArticleSummary>
): Promise<StudyPaper> {
    const cleanId = pmcid.toUpperCase().startsWith('PMC') ? pmcid.toUpperCase() : `PMC${pmcid}`;
    const xml = await fetchEuropePmcFullTextXml(cleanId);
    const parsed = parseJatsXml(xml, cleanId);

    const paper: StudyPaper = {
        id: cleanId,
        pmcid: cleanId,
        doi: parsed.doi || summaryFallback?.doi,
        title: parsed.title,
        journalTitle: parsed.journalTitle || summaryFallback?.journalTitle,
        pubDate: parsed.pubDate || summaryFallback?.pubDate,
        pubType: summaryFallback?.pubType,
        authorString: parsed.authors.slice(0, 5).join(', ') + (parsed.authors.length > 5 ? ' et al.' : '') || summaryFallback?.authorString,
        keywords,
        abstract: parsed.abstractText || summaryFallback?.abstractText,
        blocks: parsed.blocks,
        fetchedAt: Date.now(),
        readProgress: 0,
        isFavorite: false
    };

    return paper;
}
