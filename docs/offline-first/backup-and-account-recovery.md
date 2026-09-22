# Local backups and account recovery

Implemented for the desktop master-data scope: Categories, Units of Measurement, Payment Terms and Organizations/Clients. These backups contain their local projections, immutable pending/rejected/accepted command history, query metadata, and encrypted credential vault. They do not contain cloud-only ERP records or uploaded documents.

## Automatic backup and customer controls

While a profile is signed in, the local service checks once a minute and creates a verified backup if no verified backup from the last 24 hours exists. The desktop status bar shows the last verified backup, failures, and **Back up now**. A failed backup preserves the working database and waits five minutes before another automatic attempt. Existing backups are retained; automatic deletion is not implemented.

Files are in `<Electron userData>/local-data/<profile hash>/backups/backup-<time>-<UUID>/`. Every completed directory contains `desktop.sqlite`, `credentials.vault`, and `manifest.json`. Incomplete directories remain available for inspection and are never accepted as completed backups. Each profile is bound to its cloud environment, organization, user, and device.

The implementation uses SQLite's online backup operation, then verifies SQLite integrity, foreign keys, schema checksums, profile binding, byte counts, and SHA-256 hashes. The manifest is written last. New bundles declare `scope: master-data` and their SQLite schema version. Legacy `master-categories` bundles containing schema 1 remain verifiable and restorable; opening a recovered v1 store creates a verified pre-upgrade snapshot before applying schema 2. Login only lets a verified backup of the current schema defer the next automatic backup, so a category-only backup cannot suppress the first master-data backup. A declared schema mismatch or nonempty WAL/journal sidecar invalidates the bundle. See [SQLite's backup documentation](https://www.sqlite.org/backup.html).

Database records remain ordinary local SQLite files. Only the credential vault is encrypted. A backup on the same disk helps recover from file/application problems. A signed-in desktop user can select **Export backup** and choose a parent directory through the native Windows folder picker. The app first creates and verifies a fresh backup, then publishes a new, exclusively reserved child folder containing exactly `desktop.sqlite`, `credentials.vault`, and `manifest.json`. It verifies the exported bytes and restored pending/rejected work before publishing the completion manifest. It refuses the active application-data tree, links, existing destinations, insufficient free space, stale sessions and renderer/direct-HTTP requests without both private capabilities. It never moves or overwrites the active profile.

Keep the three exported files together. The export is manual; automatic cloud backup is not implemented. Cloud-only ERP records and uploaded attachments remain outside this bundle.

## Password changes

After a cloud password change, the desktop first verifies the new password online. If this PC's vault still requires the previous password, the login screen asks for **Previous password on this PC**. Both passwords are required for this recovery: the old one unlocks existing local credentials, and the current one authenticates with the cloud. The previous password is handled only by the local service; it is not forwarded to the cloud login endpoint.

Before rekeying, the application creates a verified backup with the old encrypted vault. It then atomically saves a vault encrypted under the new password. Existing database/profile IDs and pending operation IDs remain unchanged. Wrong passwords, an unavailable cloud, identity/company changes, or a failed required backup stop recovery while preserving the original vault and local commands. Forgetting the previous password still requires a separately designed account-recovery procedure; no bypass is provided.

Online sessions renew their signed offline grant during sync when the remaining lifetime is at most one quarter of its issued lifetime (capped at six hours). A renewal must match the existing account/company/device and extend expiry. Network failure leaves the unexpired grant usable; explicit authorization denial blocks further use until online sign-in. An already-expired grant requires sign-in. Permission changes never relabel queued commands as another user.

## Support recovery into a separate directory

The recovery library and support CLI create a new destination only. They deliberately cannot roll back or overwrite a running application's directory. Review any newer work in the original profile and reconcile cloud receipts before a support-led switch; a full customer restore/switch UI is still pending.

Use a runtime with Node 24.13 or newer for this developer/support utility. Normal customer installation uses the bundled runtime and does not require a Node or SQLite download.

```powershell
node scripts/recover-desktop-backup.mjs inspect "D:\Backups\backup-<time>-<UUID>"
node scripts/recover-desktop-backup.mjs restore "D:\Backups\backup-<time>-<UUID>" "D:\Recovery\new-profile" "D:\Vendor\desktop-config.json"
```

The restore command prompts for the backup-time password without echo. The matching vendor configuration contains only the public key, cloud URL and issuer. It never requires the signing private key or PostgreSQL credentials. Recovery verifies the grant signature and profile even if its grant has since expired; normal offline sign-in still enforces expiry and any authorization block saved in that backup. An older backup cannot know about revocation learned after it was created, so a support-led switch must revalidate online first. A recovered old cloud refresh token may already have been rotated.

Recovery preserves command IDs. The existing cloud receipt mechanism deduplicates a restored pending operation that the cloud already accepted. Recovery does not merge newer commands from another directory, undo cloud postings, restore attachments, or override tenant permissions.

## Verification

Isolated tests cover renewal/revocation, offline restart beyond the original grant expiry, password rekey with immutable IDs, wrong-password/offline/identity-change refusal, pending and rejected backup recovery, preservation of newer active work, corrupt backup refusal, nonempty WAL refusal, and logout during backup. Simulated disk failure leaves saved commands intact. These checks do not establish hardware power-loss behavior or a full legacy customer-data migration.
