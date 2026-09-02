import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function listTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [path] : [];
  });
}

function withoutComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("date format UI contract", () => {
  it("keeps native locale-dependent date controls behind the shared formatted inputs", () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const allowedPickerFiles = new Set([
      resolve(sourceRoot, "components/shared/app-date-input.tsx"),
      resolve(sourceRoot, "components/shared/app-date-time-input.tsx"),
    ]);
    const nativeDateControl = /<(?:input|Input)\b[^>]*\btype\s*=\s*["'](?:date|datetime-local)["'][^>]*>/s;
    const offenders = listTsxFiles(sourceRoot)
      .filter((file) => !allowedPickerFiles.has(file))
      .filter((file) => nativeDateControl.test(withoutComments(readFileSync(file, "utf8"))))
      .map((file) => relative(sourceRoot, file).replaceAll("\\", "/"));

    expect(offenders).toEqual([]);
  });

  it("uses the shared DD/MM/YYYY fields for both Main Cash and Petty Cash filters", () => {
    const cashScreen = readFileSync(
      resolve(process.cwd(), "src/features/screens/cash-in-hand-screen.tsx"),
      "utf8",
    );

    expect(cashScreen).toContain('aria-label="Cash transactions from date"');
    expect(cashScreen).toContain('aria-label="Cash transactions to date"');
  });
});
