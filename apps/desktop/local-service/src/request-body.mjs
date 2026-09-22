import { openAsBlob } from "node:fs";
import { mkdtemp, open, unlink, rmdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalError } from "./security.mjs";

const maximumJsonBody = 16 * 1024 * 1024;
// tender-costings/extract-pdfs accepts 20 files of 10 MiB. This also covers
// work IOU (100 MiB), expenses (50 MiB), support (25 MiB), documents (20 MiB),
// tender/VAT PDFs (10 MiB), and company assets (2 MiB). Cloud interceptors still
// enforce file counts/types/sizes; reserve another 16 MiB for fields and framing.
const maximumMultipartBody = 200 * 1024 * 1024 + maximumJsonBody;

export async function readRequestBody(request, beforeMultipart) {
  const contentType = request.headers["content-type"] ?? "";
  const multipart = /^multipart\/form-data(?:;|$)/i.test(contentType);
  const limit = multipart ? maximumMultipartBody : maximumJsonBody;
  const declaredLength = request.headers["content-length"];
  if (declaredLength && Number(declaredLength) > limit) throw new LocalError(413, "This request is too large.");
  let directory, file;
  const cleanup = async () => {
    await file?.close(); file = undefined;
    // Remove only our uniquely reserved payload and its now-empty directory.
    if (directory) {
      await unlink(path.join(directory, "body")).catch((error) => { if (error.code !== "ENOENT") throw error; });
      await rmdir(directory); directory = undefined;
    }
  };
  try {
    if (multipart) {
      beforeMultipart();
      directory = await mkdtemp(path.join(os.tmpdir(), "bizovix-upload-"));
      file = await open(path.join(directory, "body"), "wx", 0o600);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > limit) throw new LocalError(413, "This request is too large.");
      if (file) await file.writeFile(chunk);
      else chunks.push(chunk);
    }
    if (file) {
      await file.close(); file = undefined;
      // A file-backed Blob is replayable after an explicit JWT guard denial and
      // remains immutable until the request finishes; it is never JSON-encoded.
      return { body: await openAsBlob(path.join(directory, "body"), { type: contentType }), contentType, cleanup };
    }
    const bytes = Buffer.concat(chunks, size);
    let body;
    if (bytes.length) {
      if (/^application\/json(?:;|$)/i.test(contentType)) {
        try { body = JSON.parse(bytes.toString("utf8")); } catch { throw new LocalError(400, "Invalid JSON."); }
      } else body = bytes;
    }
    return { body, contentType, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
