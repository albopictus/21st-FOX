/**
 * 学术文献 PDF 下载工具
 */

export function getPaperPdfUrl(pmcid?: string, rawPdfUrl?: string): string | null {
    if (rawPdfUrl && rawPdfUrl.startsWith('http')) {
        return rawPdfUrl;
    }
    if (pmcid) {
        const cleanId = pmcid.toUpperCase().startsWith('PMC') ? pmcid.toUpperCase() : `PMC${pmcid}`;
        return `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${cleanId}&blobtype=pdf`;
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
    const url = getPaperPdfUrl(options.pmcid, options.pdfUrl);
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
        a.download = filename;
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
