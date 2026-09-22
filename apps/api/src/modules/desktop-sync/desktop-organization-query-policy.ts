import { ServiceUnavailableException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";

export interface DesktopOrganizationQueryIndex {
  formatVersion: 1;
  orderedIds: string[];
  caseMappings: Array<[string, string]>;
}

interface DatabaseLocale {
  database: string;
  databaseOid: string;
  serverAddress: string | null;
  serverPort: number | null;
  serverVersion: string;
  encoding: string;
  provider: string;
  collate: string;
  ctype: string;
  recordedVersion: string | null;
  actualVersion: string | null;
  defaultColumns: boolean;
}

/**
 * PostgreSQL 18 libc UTF-8 lower() is context-free towlower_l per wide character;
 * ILIKE lowers both operands before matching UTF-8 characters. Node/OS defaults
 * need not match it. Export its complete bounded scalar map and actual row order.
 * Sources: postgres/REL_18_STABLE utils/adt/pg_locale_libc.c and like.c.
 * One instance belongs to one DesktopMasterSyncService, never a global DB cache.
 */
export class DesktopOrganizationQueryPolicy {
  private cached: { identity: string; mappings: Promise<Array<[string, string]>> } | undefined;

  async index(tx: Prisma.TransactionClient, organizationId: string): Promise<DesktopOrganizationQueryIndex> {
    const locales = await tx.$queryRaw<DatabaseLocale[]>`
      SELECT d.datname AS database, d.oid::text AS "databaseOid",
        inet_server_addr()::text AS "serverAddress", inet_server_port() AS "serverPort",
        current_setting('server_version_num') AS "serverVersion",
        pg_encoding_to_char(d.encoding) AS encoding, d.datlocprovider::text AS provider,
        d.datcollate AS collate, d.datctype AS ctype, d.datcollversion AS "recordedVersion",
        pg_database_collation_actual_version(d.oid) AS "actualVersion",
        (SELECT count(*)=2 AND bool_and(a.attcollation='pg_catalog."default"'::regcollation)
         FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid
         JOIN pg_namespace n ON n.oid=t.relnamespace
         WHERE n.nspname='public' AND t.relname='organization_masters'
           AND a.attname IN ('shortName','fullName') AND NOT a.attisdropped) AS "defaultColumns"
      FROM pg_database d WHERE d.datname=current_database()
    `;
    const locale = locales[0];
    if (locales.length !== 1 || !locale || locale.provider !== "c" || locale.encoding !== "UTF8" ||
        !locale.defaultColumns || !/^18\d{4}$/.test(locale.serverVersion)) {
      throw new ServiceUnavailableException("Offline organization search requires reviewed PostgreSQL 18 libc UTF-8 default column collations");
    }
    const identity = JSON.stringify(locale);
    if (this.cached?.identity !== identity) {
      const mappings = this.loadMappings(tx);
      const entry = { identity, mappings };
      this.cached = entry;
      // A transient failed transaction must not permanently poison future pulls.
      void mappings.catch(() => { if (this.cached === entry) this.cached = undefined; });
    }
    const caseMappings = await this.cached!.mappings;
    const ordered = await tx.organizationMaster.findMany({ where: { organizationId }, orderBy: { shortName: "asc" }, select: { id: true } });
    return { formatVersion: 1, orderedIds: ordered.map(row => row.id), caseMappings };
  }

  private async loadMappings(tx: Prisma.TransactionClient): Promise<Array<[string, string]>> {
    // Exactly the Unicode scalar range, excluding NUL and UTF-16 surrogate code
    // points. No heuristic based on the API host's Unicode version is involved.
    const rows = await tx.$queryRaw<Array<{ source: string; target: string }>>`
      SELECT chr(codepoint) AS source, lower(chr(codepoint)) AS target
      FROM (SELECT generate_series(1, 55295) AS codepoint
            UNION ALL SELECT generate_series(57344, 1114111)) AS scalars
      WHERE chr(codepoint) <> lower(chr(codepoint))
      ORDER BY codepoint
    `;
    const scalar = (value: unknown): value is string => typeof value === "string" && [...value].length === 1 &&
      value.codePointAt(0)! > 0 && !(value.codePointAt(0)! >= 0xd800 && value.codePointAt(0)! <= 0xdfff);
    if (rows.length > 10_000 || rows.some(row => !scalar(row.source) || !scalar(row.target)) || new Set(rows.map(row => row.source)).size !== rows.length) {
      throw new ServiceUnavailableException("Cloud organization case mappings do not match the reviewed scalar search contract");
    }
    return rows.map(row => [row.source, row.target]);
  }
}
