ALTER TABLE "Party"
ADD COLUMN "billMaturityDays" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Party"
ADD CONSTRAINT "Party_billMaturityDays_check"
CHECK ("billMaturityDays" >= 0 AND "billMaturityDays" <= 3650);
