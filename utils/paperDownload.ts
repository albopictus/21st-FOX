/**
 * 学术文献 PDF 下载工具
 */

export function getPaperPdfUrl(pmcid?: string, rawPdfUrl?: string, doi?: string): string | null {
    if (rawPdfUrl && rawPdfUrl.startsWith('http') && !rawPdfUrl.includes('ptpmcrender.fcgi')) {
        return rawPdfUrl;
    }
    if (pmcid) {
        const cleanId = pmcid.toUpperCase().startsWith('PMC') ? pmcid.toUpperCase() : `PMC${pmcid}`;
        // 采用官方现代化 Web PDF 视图，彻底摒弃已报废的 ptpmcrender.fcgi CGI 脚本
        return `https://europepmc.org/articles/${cleanId}?pdf=render`;
    }
    if (doi) {
        return `https://doi.org/${doi}`;
    }
    return null;
}

export function downloadPaperPdf(options: {
    pmcid?: string;
    pdfUrl?: string;
    title?: string;
    pubYear?: string;
    doi?: string;
}): boolean {
    const url = getPaperPdfUrl(options.pmcid, options.pdfUrl, options.doi);
    if (!url) {
        alert('该文献未收录开放获取的官方原版 PDF 直链');
        return false;
    }

    const year = options.pubYear ? `[${options.pubYear}] ` : '';
    const cleanTitle = (options.title || options.pmcid || 'academic_paper')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 70);
    const filename = `${year}${cleanTitle}.pdf`;

    try {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return true;
    } catch (e) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return true;
    }
}
