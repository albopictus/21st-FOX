import { describe, it, expect, beforeEach } from 'vitest';
import {
    parseAuthorNameToCreator,
    parseAuthorStringList,
    generateRisContent,
    generateBibtexContent,
    generateApaCitation,
    getZoteroConfig,
    saveZoteroConfig
} from './zotero';
import type { StudyPaper } from '../types';

describe('Zotero & Citation Export Suite', () => {
    const mockPaper: StudyPaper = {
        id: 'PMC13257042',
        pmcid: 'PMC13257042',
        doi: '10.3390/ijms27114876',
        title: 'Plant Synthetic Biology and CRISPR Gene Editing in Crops',
        journalTitle: 'International Journal of Molecular Sciences',
        pubDate: '2024-05-18',
        authorString: 'Zhang, Wei; Smith, John; Ning, Yan et al.',
        abstract: 'CRISPR gene editing technologies provide breakthrough capabilities for precision crop improvement.',
        keywords: ['CRISPR', 'Synthetic Biology', 'Crop Breeding'],
        blocks: [],
        fetchedAt: Date.now()
    };

    describe('Author parsing', () => {
        it('parses "LastName, FirstName"', () => {
            const author = parseAuthorNameToCreator('Zhang, Wei');
            expect(author.lastName).toBe('Zhang');
            expect(author.firstName).toBe('Wei');
        });

        it('parses "FirstName LastName"', () => {
            const author = parseAuthorNameToCreator('John Smith');
            expect(author.lastName).toBe('Smith');
            expect(author.firstName).toBe('John');
        });

        it('parses author string with multiple contributors and strips et al.', () => {
            const list = parseAuthorStringList('Zhang, Wei; Smith, John; Ning, Yan et al.');
            expect(list.length).toBe(3);
            expect(list[0].lastName).toBe('Zhang');
            expect(list[1].lastName).toBe('Smith');
            expect(list[2].lastName).toBe('Ning');
        });
    });

    describe('RIS format generator', () => {
        it('generates standard RIS entry with all academic metadata', () => {
            const ris = generateRisContent(mockPaper);
            expect(ris).toContain('TY  - JOUR');
            expect(ris).toContain('TI  - Plant Synthetic Biology and CRISPR Gene Editing in Crops');
            expect(ris).toContain('AU  - Zhang, Wei');
            expect(ris).toContain('AU  - Smith, John');
            expect(ris).toContain('JO  - International Journal of Molecular Sciences');
            expect(ris).toContain('PY  - 2024');
            expect(ris).toContain('DO  - 10.3390/ijms27114876');
            expect(ris).toContain('KW  - CRISPR');
            expect(ris).toContain('KW  - Synthetic Biology');
            expect(ris).toContain('ER  - ');
        });
    });

    describe('BibTeX generator', () => {
        it('generates valid BibTeX @article entry', () => {
            const bib = generateBibtexContent(mockPaper);
            expect(bib).toContain('@article{zhang2024plant,');
            expect(bib).toContain('title = {Plant Synthetic Biology and CRISPR Gene Editing in Crops}');
            expect(bib).toContain('author = {Zhang, Wei and Smith, John and Ning, Yan}');
            expect(bib).toContain('journal = {International Journal of Molecular Sciences}');
            expect(bib).toContain('year = {2024}');
            expect(bib).toContain('doi = {10.3390/ijms27114876}');
        });
    });

    describe('APA 7th citation', () => {
        it('formats citation string with authors, year, title, and DOI', () => {
            const citation = generateApaCitation(mockPaper);
            expect(citation).toContain('Zhang, W. et al.');
            expect(citation).toContain('(2024)');
            expect(citation).toContain('Plant Synthetic Biology and CRISPR Gene Editing in Crops');
            expect(citation).toContain('https://doi.org/10.3390/ijms27114876');
        });
    });

    describe('Config persistence', () => {
        it('saves and retrieves Zotero config', () => {
            saveZoteroConfig({
                userId: '1234567',
                apiKey: 'test-api-key-xyz'
            });
            const config = getZoteroConfig();
            expect(config.userId).toBe('1234567');
            expect(config.apiKey).toBe('test-api-key-xyz');
        });
    });
});
