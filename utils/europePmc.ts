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
    doi?: string;
    isOpenAccess?: string;
    hasFT?: string;
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

    return list.map(item => ({
        id: item.id,
        pmcid: item.pmcid || (item.source === 'PMC' ? `PMC${item.id}` : undefined),
        title: (item.title || '').replace(/\.$/, ''),
        authorString: item.authorString,
        journalTitle: item.journalTitle,
        pubYear: item.pubYear,
        doi: item.doi,
        isOpenAccess: item.isOpenAccess,
        hasFT: item.hasFT
    })).filter(item => Boolean(item.pmcid));
}

/**
 * 获取指定 PMC 的 JATS XML 全文
 */
export async function fetchEuropePmcFullTextXml(pmcid: string): Promise<string> {
    const cleanId = pmcid.toUpperCase().startsWith('PMC') ? pmcid.toUpperCase() : `PMC${pmcid}`;
    const url = `${BASE_URL}/${cleanId}/fullTextXML`;

    const res = await fetch(url, {
        headers: {
            'Accept': 'application/xml, text/xml'
        }
    });

    if (!res.ok) {
        throw new Error(`获取文献 JATS XML 失败 (${cleanId}): HTTP ${res.status}`);
    }

    const xml = await res.text();
    if (!xml || xml.length < 50) {
        throw new Error(`文献 ${cleanId} 返回的全文 XML 为空`);
    }

    return xml;
}

/**
 * 高级封装：一键抓取、清洗并解析为积木协议 StudyPaper
 */
export async function fetchAndParseStudyPaper(pmcid: string, keywords: string[] = []): Promise<StudyPaper> {
    const cleanId = pmcid.toUpperCase().startsWith('PMC') ? pmcid.toUpperCase() : `PMC${pmcid}`;
    const xml = await fetchEuropePmcFullTextXml(cleanId);
    const parsed = parseJatsXml(xml, cleanId);

    const paper: StudyPaper = {
        id: cleanId,
        pmcid: cleanId,
        doi: parsed.doi,
        title: parsed.title,
        journalTitle: parsed.journalTitle,
        pubDate: parsed.pubDate,
        authorString: parsed.authors.slice(0, 5).join(', ') + (parsed.authors.length > 5 ? ' et al.' : ''),
        keywords,
        blocks: parsed.blocks,
        fetchedAt: Date.now(),
        readProgress: 0,
        isFavorite: false
    };

    return paper;
}
