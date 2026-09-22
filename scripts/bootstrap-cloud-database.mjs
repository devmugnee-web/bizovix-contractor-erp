/** Fresh PostgreSQL 18 bootstrap. Refuses every existing database, including empty ones. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, baselineRoot, schemaPath, prismaPath, verifyManifest, readServer, client, newDatabaseName, catalog, migrationFiles, verifyPrismaShape } from './lib/cloud-bootstrap.mjs';

export function bootstrapCloudDatabase({ databaseName = newDatabaseName(), log = console.log } = {}) {
  const manifest = verifyManifest();
  const installedPrisma = JSON.parse(fs.readFileSync(path.join(root, 'packages/database/node_modules/prisma/package.json'), 'utf8')).version;
  if (installedPrisma !== manifest.prismaVersion) throw new Error('Use the baseline-pinned Prisma version before bootstrapping');
  const connection = client(readServer(), databaseName);
  connection.create();
  log(`Created new cloud database: ${databaseName}`);
  const schema = fs.readFileSync(path.join(baselineRoot, 'schema.sql'), 'utf8');
  const referenceData = fs.readFileSync(path.join(baselineRoot, 'reference-data.sql'), 'utf8');
  connection.checkedSql(`${schema}\nSET search_path = public;\n${referenceData}`, { transaction: true });
  const expected = JSON.parse(fs.readFileSync(path.join(baselineRoot, 'catalog.json'), 'utf8'));
  if (JSON.stringify(catalog(connection)) !== JSON.stringify(expected)) throw new Error(`Catalog verification failed; new database retained: ${databaseName}`);
  verifyPrismaShape(connection);
  // Verify all business tables are empty, without exposing or copying rows.
  const counts = connection.checkedSql(`DO $$ DECLARE r record; n bigint; BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('permissions','plans') LOOP
      EXECUTE format('SELECT count(*) FROM public.%I', r.tablename) INTO n;
      IF n <> 0 THEN RAISE EXCEPTION 'Bootstrap unexpectedly contains business records'; END IF;
    END LOOP;
    IF (SELECT count(*) FROM permissions) <> ${manifest.counts.permissions} OR (SELECT count(*) FROM plans) <> ${manifest.counts.plans} THEN RAISE EXCEPTION 'Reference catalog count mismatch'; END IF;
  END $$;`);
  void counts;
  log(`Verified ${manifest.counts.tables} tables, ${manifest.counts.checks} CHECK constraints, ${manifest.counts.specialIndexes} partial/expression indexes, and ${manifest.counts.foreignKeys} foreign keys; business tables are empty.`);
  // Supported Prisma baselining. Preserve every original file and checksum; never execute
  // old demo inserts or malformed warning headers against the new application database.
  for (let index = 0; index < manifest.migrations.length; index++) {
    const migration = manifest.migrations[index];
    const result = connection.run(process.execPath, [prismaPath, 'migrate', 'resolve', '--schema', schemaPath, '--applied', migration.name]);
    if (result.status !== 0) throw new Error(`Could not record baseline migration ${migration.name}; new database retained: ${databaseName}`);
    if ((index + 1) % 10 === 0 || index === manifest.migrations.length - 1) log(`Recorded ${index + 1}/${manifest.migrations.length} original migration checksums.`);
  }
  const recorded = JSON.parse(connection.checkedSql(`SELECT json_agg(json_build_object('name',migration_name,'sha256',checksum) ORDER BY migration_name) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;`));
  // Supported resolve calls can take minutes. Fail closed if concurrent workspace
  // edits changed the schema/history/artifacts during that interval.
  verifyManifest();
  if (JSON.stringify(recorded) !== JSON.stringify(migrationFiles({ raw: true }))) throw new Error(`Baseline migration checksum verification failed: ${databaseName}`);
  log(`PASS: fresh cloud baseline ready. Database retained: ${databaseName}`);
  return { connection, manifest };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length === 1 && arguments_[0] === '--verify-artifacts') {
    console.log(`PASS: baseline artifact/source checksums verified: ${JSON.stringify(verifyManifest().counts)}`);
  } else {
    if (arguments_.length && (arguments_.length !== 2 || arguments_[0] !== '--create-name')) throw new Error('Usage: node scripts/bootstrap-cloud-database.mjs [--create-name NEW_DATABASE_NAME | --verify-artifacts]');
    bootstrapCloudDatabase({ databaseName: arguments_[1] });
  }
}
