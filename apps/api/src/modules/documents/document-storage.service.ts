import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { Injectable, NotFoundException } from "@nestjs/common";

/**
 * Local filesystem storage adapter behind a small abstraction. Swap this implementation
 * for an S3-compatible client later without touching DocumentsService — callers only
 * depend on save()/read()/delete() and the opaque storageKey they return.
 */
@Injectable()
export class DocumentStorageService {
  private readonly baseDir = path.resolve(process.cwd(), "storage", "documents");

  private resolve(storageKey: string): string {
    const resolved = path.resolve(this.baseDir, storageKey);
    if (resolved !== this.baseDir && !resolved.startsWith(this.baseDir + path.sep)) {
      throw new NotFoundException("Invalid file reference");
    }
    return resolved;
  }

  async save(organizationId: string, buffer: Buffer, originalName: string): Promise<string> {
    const ext = path.extname(originalName);
    const storageKey = path.posix.join(organizationId, `${randomUUID()}${ext}`);
    const fullPath = this.resolve(storageKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return storageKey;
  }

  async read(storageKey: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolve(storageKey));
    } catch {
      throw new NotFoundException("Stored file not found");
    }
  }

  async delete(storageKey: string): Promise<void> {
    await fs.rm(this.resolve(storageKey), { force: true });
  }
}
