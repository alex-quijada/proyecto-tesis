import { readFileSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const buffer = readFileSync('C:/Users/Dick-/Downloads/BATCH_OUT_84650.pdf');
const pdf = await getDocument({ data: buffer.buffer }).promise;
for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const items = (await page.getTextContent()).items;
    console.log(`=== PAGE ${i} ===`);
    console.log(items.map(i => i.str).join(' '));
    console.log();
}
