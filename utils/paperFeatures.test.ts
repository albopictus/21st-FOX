import { describe, it, expect } from 'vitest';
import { formatBionicWord, applyBionicReading } from './bionicReading';
import { getPaperPdfUrl } from './paperDownload';
import { getTodayDateString } from './dailyPaper';
import { getFontFamilyStyle, getFontSizeClasses } from './paperTypography';

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
        it('generates official Europe PMC PDF URL for PMC ID', () => {
            const url = getPaperPdfUrl('PMC10515152');
            expect(url).toBe('https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC10515152&blobtype=pdf');
        });

        it('prefers raw PDF URL if valid http link is provided', () => {
            const raw = 'https://example.com/paper.pdf';
            const url = getPaperPdfUrl('PMC12345', raw);
            expect(url).toBe(raw);
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
});
