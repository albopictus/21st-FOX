import { describe, it, expect } from 'vitest';
import { formatBionicWord, applyBionicReading } from './bionicReading';
import { getPaperPdfUrl } from './paperDownload';
import { getTodayDateString } from './dailyPaper';
import { getFontFamilyStyle, getFontSizeClasses } from './paperTypography';
import { parseJatsXml } from './jatsParser';

describe('Paper New Features Suite', () => {
    describe('Bionic Reading for ADHD', () => {
        it('bolds first few letters of English words', () => {
            expect(formatBionicWord('attention')).toBe('<b>atten</b>tion');
            expect(formatBionicWord('is')).toBe('<b>i</b>s');
            expect(formatBionicWord('the')).toBe('<b>th</b>e');
            expect(formatBionicWord('model')).toBe('<b>mod</b>el');
        });

        it('handles punctuation correctly around words', () => {
            expect(formatBionicWord('CRISPR,')).toBe('<b>CRI</b>SPR,');
            expect(formatBionicWord('(neuroscience)')).toBe('(<b>neuros</b>cience)');
        });

        it('applies bionic reading while preserving LaTeX math and non-English text', () => {
            const input = 'We observe $O(N^2)$ complexity in the transformer model. 深度学习网络';
            const output = applyBionicReading(input);
            expect(output).toContain('$O(N^2)$');
            expect(output).toContain('<b>W</b>e');
            expect(output).toContain('<b>obs</b>erve');
            expect(output).toContain('<b>trans</b>former');
            expect(output).toContain('深度学习网络');
        });
    });

    describe('PDF Downloader', () => {
        it('generates modern official Europe PMC PDF URL for PMC ID to prevent 520 crash', () => {
            const url = getPaperPdfUrl('PMC10515152');
            expect(url).toBe('https://europepmc.org/articles/PMC10515152?pdf=render');
        });

        it('prefers raw PDF URL if valid http link is provided and ignores deprecated ptpmcrender', () => {
            const raw = 'https://example.com/paper.pdf';
            const url = getPaperPdfUrl('PMC12345', raw);
            expect(url).toBe(raw);

            const broken = 'https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC12345&blobtype=pdf';
            const fixed = getPaperPdfUrl('PMC12345', broken);
            expect(fixed).toBe('https://europepmc.org/articles/PMC12345?pdf=render');
        });

        it('falls back to DOI URL when no PMC or PDF is present', () => {
            const doiUrl = getPaperPdfUrl(undefined, undefined, '10.1038/s41586-024-0001');
            expect(doiUrl).toBe('https://doi.org/10.1038/s41586-024-0001');
        });
    });

    describe('Daily Paper Discovery', () => {
        it('formats today date string properly as YYYY-MM-DD', () => {
            const today = getTodayDateString();
            expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
    });

    describe('Typography settings', () => {
        it('returns correct CSS font family for dyslexic and sans', () => {
            const dyslexicStyle = getFontFamilyStyle('dyslexic');
            expect(dyslexicStyle).toContain('OpenDyslexic');

            const serifStyle = getFontFamilyStyle('serif');
            expect(serifStyle).toContain('Georgia');
        });

        it('returns appropriate size and leading classes', () => {
            const sm = getFontSizeClasses('sm');
            expect(sm.text).toContain('text-[13px]');
            const xl = getFontSizeClasses('xl');
            expect(xl.text).toContain('text-lg');
        });
    });

    describe('JATS XML Parser & Keywords', () => {
        it('extracts author keywords from JATS XML kwd-group', () => {
            const sampleXml = `
                <article>
                    <front>
                        <article-meta>
                            <title-group>
                                <article-title>CRISPR-Cas9 Base Editing in Plants</article-title>
                            </title-group>
                            <kwd-group>
                                <kwd>Genome Editing</kwd>
                                <kwd>CRISPR-Cas9</kwd>
                                <kwd>Synthetic Biology</kwd>
                            </kwd-group>
                        </article-meta>
                    </front>
                    <body>
                        <sec>
                            <title>Introduction</title>
                            <p>Here is introductory text.</p>
                        </sec>
                    </body>
                </article>
            `;
            const result = parseJatsXml(sampleXml, 'PMC999999');
            expect(result.keywords).toEqual(['Genome Editing', 'CRISPR-Cas9', 'Synthetic Biology']);
            expect(result.title).toBe('CRISPR-Cas9 Base Editing in Plants');
        });
    });
});
