/** Support utility: inspect a backup, or recover into a NEW directory. No active-data replacement. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { restoreProfileBackup, verifyProfileBackup } from "../apps/desktop/local-service/src/backups.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [action, ...argumentsList] = process.argv.slice(2);
if (!action || action === "--help") {
  process.stdout.write("Usage:\n  node scripts/recover-desktop-backup.mjs inspect <absolute-backup-directory>\n  node scripts/recover-desktop-backup.mjs restore <absolute-backup-directory> <new-absolute-destination> [public-desktop-config.json]\n\nRestore requires the password used when the backup was created and the matching vendor public configuration. The password is prompted without echo; never pass it as an argument. The destination must not already exist. This tool never switches or replaces the application's active data directory.\n");
} else {
  try {
    if (!["inspect", "restore"].includes(action) || !argumentsList[0] || (action === "inspect" && argumentsList.length !== 1) || (action === "restore" && (argumentsList.length < 2 || argumentsList.length > 3))) throw new Error("Invalid arguments. Use --help.");
    const backupDirectory = argumentsList[0];
    if (action === "inspect") {
      const { manifest, storage } = await verifyProfileBackup(backupDirectory);
      process.stdout.write(`${JSON.stringify({ verified: true, scope: manifest.scope, createdAt: manifest.createdAt, ...storage }, null, 2)}\n`);
    } else {
      const config = JSON.parse(fs.readFileSync(argumentsList[2] ?? path.join(root, "apps/desktop/electron/desktop-config.json"), "utf8"));
      if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error("Restore requires an interactive terminal for a hidden password prompt.");
      process.stdout.write("Password used at backup time: ");
      const password = await new Promise((resolve, reject) => {
        let value = "";
        const finish = (error) => {
          process.stdin.off("data", input); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n");
          if (error) reject(error); else resolve(value);
          value = "";
        };
        const input = (chunk) => {
          for (const character of chunk) {
            if (character === "\u0003") { finish(new Error("Recovery cancelled; no destination was written.")); return; }
            if (character === "\r" || character === "\n") { finish(); return; }
            if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
            else if (character >= " " && value.length < 1024) value += character;
          }
        };
        process.stdin.setEncoding("utf8"); process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on("data", input);
      });
      const result = await restoreProfileBackup({ backupDirectory, targetRoot: argumentsList[1], password, config });
      process.stdout.write(`${JSON.stringify({ recovered: true, activeDatabaseReplaced: false, ...result }, null, 2)}\n`);
    }
  } catch (error) {
    // Errors contain no credentials or tokens. Do not print a stack or input configuration.
    process.stderr.write(`${error.code ?? "RECOVERY_FAILED"}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
