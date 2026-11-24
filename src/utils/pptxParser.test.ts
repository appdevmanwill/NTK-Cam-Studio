import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { parsePptxArchive } from './pptxParser';
import { decodeXmlEntities, parseXml, resolveColorContainer } from './pptxXml';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function buildThemedPptxBuffer(): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
    <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <p:sldIdLst>
        <p:sldId id="256" r:id="rId2"/>
        <p:sldId id="257" r:id="rId1"/>
      </p:sldIdLst>
      <p:sldSz cx="12192000" cy="6858000"/>
    </p:presentation>`
  );

  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
    </Relationships>`
  );

  // Theme with brand navy dk1, white lt1, vivid coral accent1, and gradient bgFillStyleLst
  zip.file(
    'ppt/theme/theme1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
    <a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <a:themeElements>
        <a:clrScheme name="StudioBrand">
          <a:dk1><a:srgbClr val="0F172A"/></a:dk1>
          <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
          <a:dk2><a:srgbClr val="1E293B"/></a:dk2>
          <a:lt2><a:srgbClr val="F1F5F9"/></a:lt2>
          <a:accent1><a:srgbClr val="E11D48"/></a:accent1>
          <a:accent2><a:srgbClr val="0EA5E9"/></a:accent2>
        </a:clrScheme>
        <a:fmtScheme name="BrandFmt">
          <a:fillStyleLst>
            <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
          </a:fillStyleLst>
          <a:bgFillStyleLst>
            <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
          </a:bgFillStyleLst>
        </a:fmtScheme>
      </a:themeElements>
    </a:theme>`
  );

  // Dark Slide Master mapping bg1 -> dk1 (#0F172A) and tx1 -> lt1 (#FFFFFF)!
  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
    <p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld>
        <p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>
        <p:spTree>
          <p:sp>
            <p:nvSpPr><p:cNvPr id="99" name="Master Accent Bar"/><p:nvPr/></p:nvSpPr>
            <p:spPr>
              <a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="200000"/></a:xfrm>
              <a:prstGeom prst="rect"/>
              <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
            </p:spPr>
          </p:sp>
        </p:spTree>
      </p:cSld>
      <p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2"/>
    </p:sldMaster>`
  );

  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
    </Relationships>`
  );

  // Slide Layout providing title placeholder transform
  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
    <p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
            <p:spPr>
              <a:xfrm><a:off x="609600" y="685800"/><a:ext cx="10972800" cy="1371600"/></a:xfrm>
            </p:spPr>
          </p:sp>
        </p:spTree>
      </p:cSld>
    </p:sldLayout>`
  );

  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
    </Relationships>`
  );

  // Slide 2 (ordered first in presentation.xml): inherits dark master bg, has noFill+border shape, grouped shape, and cropped image
  zip.file(
    'ppt/slides/slide2.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
           xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
            <p:spPr>
              <a:noFill/>
              <a:ln w="19050"><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></a:ln>
            </p:spPr>
            <p:txBody>
              <a:p><a:r><a:rPr sz="4400" b="1"/><a:t>Executive Summary &amp; Vision</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
          <p:grpSp>
            <p:grpSpPr>
              <a:xfrm>
                <a:off x="6096000" y="2000000"/><a:ext cx="5000000" cy="3000000"/>
                <a:chOff x="0" y="0"/><a:chExt cx="5000000" cy="3000000"/>
              </a:xfrm>
            </p:grpSpPr>
            <p:sp>
              <p:nvSpPr><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="500000" y="500000"/><a:ext cx="2000000" cy="1000000"/></a:xfrm>
                <a:prstGeom prst="roundRect"/>
              </p:spPr>
              <p:style>
                <a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>
              </p:style>
              <p:txBody><a:p><a:r><a:t>Grouped Card</a:t></a:r></a:p></p:txBody>
            </p:sp>
          </p:grpSp>
          <p:pic>
            <p:blipFill>
              <a:blip r:embed="rIdImg1"/>
              <a:srcRect l="10000" t="20000" r="10000" b="0"/>
            </p:blipFill>
            <p:spPr>
              <a:xfrm><a:off x="914400" y="2200000"/><a:ext cx="4500000" cy="3000000"/></a:xfrm>
              <a:prstGeom prst="ellipse"/>
            </p:spPr>
          </p:pic>
        </p:spTree>
      </p:cSld>
    </p:sld>`
  );

  zip.file(
    'ppt/slides/_rels/slide2.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
      <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/chart.png"/>
      <Relationship Id="rIdNotes1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
    </Relationships>`
  );

  zip.file('ppt/media/chart.png', ONE_PIXEL_PNG_BASE64, { base64: true });

  zip.file(
    'ppt/notesSlides/notesSlide1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
    <p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld><p:spTree>
        <p:sp>
          <p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
          <p:txBody>
            <a:p><a:r><a:t>Remember to highlight the Q4 growth chart on this slide.</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>
      </p:spTree></p:cSld>
    </p:notes>`
  );

  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
           xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
            <p:spPr>
              <a:xfrm><a:off x="914400" y="685800"/><a:ext cx="10000000" cy="1200000"/></a:xfrm>
            </p:spPr>
            <p:txBody>
              <a:p><a:r><a:t>Second Slide Closing</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
        </p:spTree>
      </p:cSld>
    </p:sld>`
  );

  return zip.generateAsync({ type: 'uint8array' });
}

test('OOXML color modifiers (tint, shade, alpha, clrMap) compute accurate colors', () => {
  const xml = parseXml(
    `<a:solidFill><a:schemeClr val="accent1"><a:tint val="50000"/><a:alpha val="50000"/></a:schemeClr></a:solidFill>`
  );
  const solidFill = xml.children[0];
  const css = resolveColorContainer(
    solidFill,
    { accent1: '#0000FF' },
    { accent1: 'accent1' }
  );
  // 50% tint of pure blue (0, 0, 255) -> (128, 128, 255) at alpha 0.5
  assert.equal(css, 'rgba(128, 128, 255, 0.5)');
});

test('parsePptxArchive resolves dark master clrMap, layout placeholders, noFill+ln isolation, groups, and crops', async () => {
  const bytes = await buildThemedPptxBuffer();
  const deck = await parsePptxArchive(bytes, 'QuarterlyDeck');

  assert.equal(deck.slides.length, 2);

  const first = deck.slides[0];
  assert.equal(first.title, 'Executive Summary & Vision');
  // Inherited dark background from slideMaster1 bgRef + clrMap bg1="dk1" (#0F172A)
  assert.equal(first.backgroundColor.toLowerCase(), '#0f172a');
  assert.equal(first.notes, 'Remember to highlight the Q4 growth chart on this slide.');

  // Master decorative accent bar is layer 0
  const masterBar = first.elements[0];
  assert.equal(masterBar.kind, 'shape');
  assert.deepEqual(masterBar.fill, { kind: 'solid', color: '#e11d48' });

  // Title shape inherited transform from slideLayout1, kept noFill transparent, and preserved accent2 border!
  const titleShape = first.elements[1];
  assert.equal(titleShape.kind, 'shape');
  assert.equal(titleShape.fill, undefined);
  assert.equal(titleShape.strokeColor?.toLowerCase(), '#0ea5e9');
  assert.ok(Math.abs(titleShape.transform.x - 0.05) < 0.01);
  // Inherited white text color from clrMap tx1="lt1"
  assert.equal(titleShape.paragraphs[0].runs[0].color.toLowerCase(), '#ffffff');

  // Grouped card resolved style.fillRef (#e11d48) and transformed group offset (6096000 + 500000) / 12192000
  const groupedCard = first.elements[2];
  assert.equal(groupedCard.kind, 'shape');
  assert.deepEqual(groupedCard.fill, { kind: 'solid', color: '#e11d48' });
  assert.ok(groupedCard.transform.x > 0.53 && groupedCard.transform.x < 0.55);

  // Image preserved Z-order after grouped shape, elliptical clip, and srcRect crop
  const imageEl = first.elements[3];
  assert.equal(imageEl.kind, 'image');
  assert.equal(imageEl.geom, 'ellipse');
  assert.deepEqual(imageEl.crop, { l: 0.1, t: 0.2, r: 0.1, b: 0 });
});

test('parsePptxArchive anchors filled card headings at top by default (preventing center overlap) while honoring explicit anchor=ctr', async () => {
  const zip = new JSZip();
  zip.file(
    'ppt/presentation.xml',
    `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                     xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
      <p:sldSz cx="12192000" cy="6858000"/>
    </p:presentation>`
  );
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
    </Relationships>`
  );
  // Two-column card reproducing the "AI learners" card (filled tall rect with omitted bodyPr anchor)
  // plus a small pill badge and an explicitly centered shape
  zip.file(
    'ppt/slides/slide1.xml',
    `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld><p:spTree>
        <p:sp>
          <p:nvSpPr><p:cNvPr id="2" name="Right Card"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
          <p:spPr>
            <a:xfrm><a:off x="6200000" y="2100000"/><a:ext cx="5000000" cy="2400000"/></a:xfrm>
            <a:prstGeom prst="rect"/>
            <a:solidFill><a:srgbClr val="F0F4F8"/></a:solidFill>
          </p:spPr>
          <p:txBody>
            <a:bodyPr lIns="182880" tIns="127000"><a:normAutofit fontScale="90000"/></a:bodyPr>
            <a:p><a:r><a:rPr sz="2000" b="1"/><a:t>AI learners</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>
        <p:sp>
          <p:nvSpPr><p:cNvPr id="3" name="Centered Box"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
          <p:spPr>
            <a:xfrm><a:off x="1000000" y="5000000"/><a:ext cx="3000000" cy="1200000"/></a:xfrm>
            <a:prstGeom prst="rect"/>
            <a:solidFill><a:srgbClr val="1E293B"/></a:solidFill>
          </p:spPr>
          <p:txBody>
            <a:bodyPr anchor="ctr"/>
            <a:p><a:r><a:t>Explicit Center</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>
      </p:spTree></p:cSld>
    </p:sld>`
  );

  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const deck = await parsePptxArchive(bytes, 'CardTest');
  const card = deck.slides[0].elements[0];
  const centered = deck.slides[0].elements[1];

  assert.equal(card.kind, 'shape');
  assert.equal(card.verticalAnchor, 'top');
  assert.equal(Math.round(card.insetsPt.l * 10) / 10, 14.4);
  assert.equal(card.insetsPt.t, 10);
  // normAutofit fontScale=90000 scales 20pt -> 18pt
  assert.equal(card.paragraphs[0].runs[0].fontSizePt, 18);

  assert.equal(centered.kind, 'shape');
  assert.equal(centered.verticalAnchor, 'middle');
});

test('decodeXmlEntities avoids double-decoding and handles astral Unicode code points', () => {
  assert.equal(decodeXmlEntities('&amp;lt;tag&amp;gt;'), '&lt;tag&gt;');
  assert.equal(decodeXmlEntities('&#128640; &#x1F680;'), '🚀 🚀');
  assert.equal(decodeXmlEntities('A &amp; B &quot;test&quot; &apos;ok&apos;'), 'A & B "test" \'ok\'');
});

