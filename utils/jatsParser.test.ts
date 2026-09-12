// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseJatsXml } from './jatsParser';

const SAMPLE_JATS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD with MathML3 v1.4 20241031//EN" "JATS-archivearticle1-4-mathml3.dtd">
<article article-type="research-article" xml:lang="en">
  <front>
    <journal-meta>
      <journal-id journal-id-type="nlm-ta">Biomed Microdevices</journal-id>
      <journal-title-group>
        <journal-title>Biomedical Microdevices</journal-title>
      </journal-title-group>
    </journal-meta>
    <article-meta>
      <article-id pub-id-type="doi">10.1007/s10544-026-00843-9</article-id>
      <article-title>CRISPR-Cas12a platform for precision neuroreprogramming</article-title>
      <contrib-group>
        <contrib contrib-type="author">
          <name>
            <surname>Doe</surname>
            <given-names>Jane</given-names>
          </name>
        </contrib>
        <contrib contrib-type="author">
          <name>
            <surname>Smith</surname>
            <given-names>John</given-names>
          </name>
        </contrib>
      </contrib-group>
      <pub-date>
        <year>2026</year>
        <month>09</month>
        <day>12</day>
      </pub-date>
      <abstract>
        <p>This study demonstrates a nanoscale CRISPR platform with <bold>high efficiency</bold> in microglia.</p>
      </abstract>
    </article-meta>
  </front>
  <body>
    <sec sec-type="intro">
      <title>Introduction</title>
      <p>Traumatic brain injury causes acute neuroinflammation mediated by $E = mc^2$ and microglia.</p>
    </sec>
    <sec sec-type="results">
      <title>Results and Discussion</title>
      <p>We engineered lipid nanoparticles encapsulating Cas12a.</p>
      <fig id="Fig1">
        <label>Fig. 1</label>
        <caption>
          <p>Schematic of the CRISPR delivery system and therapeutic mechanism.</p>
        </caption>
        <graphic xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="Fig1.webp">
          <?image-cloudpmc-urn urn:cdn:blobs/4f77/13522008/ef45731aaa14/Fig1.webp?>
          <?thumb-cloudpmc-urn urn:cdn:blobs/4f77/13522008/492c7afd87db/Fig1_thumb.gif?>
        </graphic>
      </fig>
    </sec>
  </body>
  <back>
    <ref-list>
      <ref id="CR1">
        <mixed-citation publication-type="journal">Noise reference that must be stripped.</mixed-citation>
      </ref>
    </ref-list>
  </back>
</article>`;

describe('JATS XML Parser', () => {
    it('correctly extracts metadata and blocks from JATS XML', () => {
        const parsed = parseJatsXml(SAMPLE_JATS_XML, 'PMC13522008');

        expect(parsed.title).toBe('CRISPR-Cas12a platform for precision neuroreprogramming');
        expect(parsed.authors).toEqual(['Jane Doe', 'John Smith']);
        expect(parsed.journalTitle).toBe('Biomedical Microdevices');
        expect(parsed.doi).toBe('10.1007/s10544-026-00843-9');
        expect(parsed.pubDate).toBe('2026-09-12');
        expect(parsed.abstractText).toContain('This study demonstrates');

        // Blocks validation
        expect(parsed.blocks.length).toBeGreaterThanOrEqual(4);

        // Abstract heading and paragraph
        expect(parsed.blocks[0]).toMatchObject({
            type: 'heading',
            text: 'Abstract',
            level: 2
        });
        expect(parsed.blocks[1].type).toBe('paragraph');
        expect((parsed.blocks[1] as any).text).toContain('**high efficiency**');

        // Introduction section
        const introHeading = parsed.blocks.find(b => b.type === 'heading' && b.text === 'Introduction');
        expect(introHeading).toBeDefined();

        // Math inline check
        const mathPara = parsed.blocks.find(b => b.type === 'paragraph' && (b as any).text.includes('$E = mc^2$'));
        expect(mathPara).toBeDefined();

        // Figure check with high-res Cloud PMC CDN resolution
        const figure = parsed.blocks.find(b => b.type === 'figure') as any;
        expect(figure).toBeDefined();
        expect(figure.label).toBe('Fig. 1');
        expect(figure.caption).toBe('Schematic of the CRISPR delivery system and therapeutic mechanism.');
        expect(figure.imageUrl).toBe('https://cdn.ncbi.nlm.nih.gov/pmc/blobs/4f77/13522008/ef45731aaa14/Fig1.webp');
        expect(figure.thumbUrl).toBe('https://cdn.ncbi.nlm.nih.gov/pmc/blobs/4f77/13522008/492c7afd87db/Fig1_thumb.gif');

        // Noise stripping check: <back> / <ref-list> must not be in blocks
        const noiseCheck = parsed.blocks.some(b => (b as any).text?.includes('Noise reference'));
        expect(noiseCheck).toBe(false);
    });
});
