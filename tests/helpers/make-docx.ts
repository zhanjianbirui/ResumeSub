import JSZip from 'jszip';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const escape = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c);

/** 每个段落是若干文本片段，片段之间插入 <w:tab/>。 */
const paragraph = (parts: readonly string[]) =>
  `<w:p><w:r>${parts.map((p) => `<w:t xml:space="preserve">${escape(p)}</w:t>`).join('<w:tab/>')}</w:r></w:p>`;

/** 生成只含 document.xml 的最小合法 .docx（用于测试 mammoth 的真实提取）。 */
export async function makeDocx(paragraphs: readonly (readonly string[])[]): Promise<Uint8Array<ArrayBuffer>> {
  const body = paragraphs.map(paragraph).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', RELS);
  zip.file('word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return new Uint8Array(await zip.generateAsync({ type: 'arraybuffer' }));
}
