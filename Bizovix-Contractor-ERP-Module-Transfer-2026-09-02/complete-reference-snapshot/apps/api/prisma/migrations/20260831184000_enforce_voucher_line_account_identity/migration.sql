-- Party.ledgerAccountId and VoucherEntryLine.accountId are accounting
-- identities, not merely optional lookup hints. Keep Party sub-ledgers inside
-- the same company and prevent a protected/control backbone row from being
-- captured as a mutable Party ledger.
CREATE FUNCTION "validatePartyLedgerAccountIdentity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ledger_company_id TEXT;
  ledger_level "AccountLevel";
  ledger_is_system BOOLEAN;
BEGIN
  IF NEW."ledgerAccountId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT account."companyId", account."level", account."isSystem"
  INTO ledger_company_id, ledger_level, ledger_is_system
  FROM "Account" AS account
  WHERE account."id" = NEW."ledgerAccountId";

  IF ledger_company_id IS NULL THEN
    RAISE EXCEPTION 'Party references a missing Account ledger';
  END IF;
  IF ledger_company_id IS DISTINCT FROM NEW."companyId" THEN
    RAISE EXCEPTION 'Party ledger Account belongs to a different company';
  END IF;
  IF ledger_level IS DISTINCT FROM 'LEDGER'::"AccountLevel" OR ledger_is_system IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'Party must reference one custom LEDGER Account';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Party_ledger_account_identity_guard"
BEFORE INSERT OR UPDATE OF "companyId", "ledgerAccountId"
ON "Party"
FOR EACH ROW
EXECUTE FUNCTION "validatePartyLedgerAccountIdentity"();

-- VoucherEntryLine.accountId is the accounting identity, not merely an
-- optional lookup hint. Enforce the invariants that a cross-table foreign key
-- cannot express: the Account must be a LEDGER and must belong to the same
-- company as the owning VoucherEntry. Existing legacy rows remain readable;
-- every new or identity/value-changing write is protected immediately.
CREATE FUNCTION "validateVoucherLineAccountIdentity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  voucher_company_id TEXT;
  account_company_id TEXT;
  account_level "AccountLevel";
BEGIN
  SELECT voucher."companyId"
  INTO voucher_company_id
  FROM "VoucherEntry" AS voucher
  WHERE voucher."id" = NEW."voucherId";

  IF voucher_company_id IS NULL THEN
    RAISE EXCEPTION 'Voucher line references a missing VoucherEntry';
  END IF;

  IF NEW."accountId" IS NULL THEN
    IF COALESCE(NEW."debit", 0) <> 0 OR COALESCE(NEW."credit", 0) <> 0 THEN
      RAISE EXCEPTION 'Every non-zero voucher line requires an Account id';
    END IF;
    RETURN NEW;
  END IF;

  SELECT account."companyId", account."level"
  INTO account_company_id, account_level
  FROM "Account" AS account
  WHERE account."id" = NEW."accountId";

  IF account_company_id IS NULL THEN
    RAISE EXCEPTION 'Voucher line references a missing Account';
  END IF;
  IF account_company_id IS DISTINCT FROM voucher_company_id THEN
    RAISE EXCEPTION 'Voucher line Account belongs to a different company';
  END IF;
  IF account_level IS DISTINCT FROM 'LEDGER'::"AccountLevel" THEN
    RAISE EXCEPTION 'Voucher lines may post only to LEDGER accounts';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "VoucherEntryLine_account_identity_guard"
BEFORE INSERT OR UPDATE OF "voucherId", "accountId", "debit", "credit"
ON "VoucherEntryLine"
FOR EACH ROW
EXECUTE FUNCTION "validateVoucherLineAccountIdentity"();

DO $$
DECLARE
  legacy_invalid_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO legacy_invalid_count
  FROM "VoucherEntryLine" AS line
  JOIN "VoucherEntry" AS voucher ON voucher."id" = line."voucherId"
  LEFT JOIN "Account" AS account ON account."id" = line."accountId"
  WHERE (COALESCE(line."debit", 0) <> 0 OR COALESCE(line."credit", 0) <> 0)
    AND (
      account."id" IS NULL
      OR account."companyId" IS DISTINCT FROM voucher."companyId"
      OR account."level" IS DISTINCT FROM 'LEDGER'::"AccountLevel"
    );

  RAISE NOTICE '% historical non-zero voucher line(s) remain outside the new Account identity invariant and require explicit review', legacy_invalid_count;
END;
$$;
