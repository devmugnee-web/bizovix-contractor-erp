// Read a specified notice locally; does not upload or persist it.
import { readFile } from "node:fs/promises";
import { extractText, extractTextItems, getDocumentProxy } from "unpdf";
const pdf = await getDocumentProxy(new Uint8Array(await readFile(process.argv[2])));
try {
  if (process.argv.includes("--positions")) {
    const result = await extractTextItems(pdf);
    console.log(JSON.stringify(result.items.map((items) => items.filter((item) => item.str?.trim()).map((item) => ({ text: item.str, x: item.x, y: item.y, width: item.width, fontSize: item.fontSize }))), null, 2));
  } else {
    console.log((await extractText(pdf, { mergePages: true })).text);
  }
} finally {
  await pdf.destroy();
}
