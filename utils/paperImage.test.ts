import { describe, it, expect } from 'vitest';
import { buildPaperImageMirrors } from './paperImage';

describe('paperImage - buildPaperImageMirrors', () => {
    it('为 NCBI 官方图床构建包含 Worker 代理的高可用链', () => {
        const direct = 'https://cdn.ncbi.nlm.nih.gov/pmc/articles/PMC12345/bin/Fig1.jpg';
        const chain = buildPaperImageMirrors(direct);

        expect(chain.length).toBe(2);
        expect(chain[0]).toBe(direct);
        expect(chain[1]).toContain('/europepmc?target=');
        expect(chain[1]).toContain(encodeURIComponent(direct));
    });

    it('为 Europe PMC 图床构建 Worker 代理', () => {
        const direct = 'https://europepmc.org/articles/PMC12345/bin/Fig2.jpg';
        const chain = buildPaperImageMirrors(direct);

        expect(chain.length).toBe(2);
        expect(chain[0]).toBe(direct);
        expect(chain[1]).toContain('/europepmc?target=');
    });

    it('空 URL 或常规非学术图床只保留直连', () => {
        expect(buildPaperImageMirrors('')).toEqual([]);
        expect(buildPaperImageMirrors('https://example.com/pic.png')).toEqual(['https://example.com/pic.png']);
    });

    it('禁用代理兜底时仅返回直连 URL', () => {
        const direct = 'https://cdn.ncbi.nlm.nih.gov/pmc/articles/PMC12345/bin/Fig1.jpg';
        const chain = buildPaperImageMirrors(direct, false);
        expect(chain).toEqual([direct]);
    });
});
