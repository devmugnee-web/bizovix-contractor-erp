CREATE TYPE "CompletionCertificateSource" AS ENUM (
  'UNSPECIFIED',
  'EGP',
  'MANUAL'
);

CREATE TYPE "CompletionCertificateEgpStatus" AS ENUM (
  'UNSPECIFIED',
  'NOT_APPLICABLE',
  'NOT_APPLIED',
  'PENDING',
  'UNDER_PROCESS',
  'OBTAINED'
);

ALTER TABLE "completion_certificates"
  ADD COLUMN "source" "CompletionCertificateSource" NOT NULL DEFAULT 'UNSPECIFIED',
  ADD COLUMN "egpStatus" "CompletionCertificateEgpStatus" NOT NULL DEFAULT 'UNSPECIFIED',
  ADD COLUMN "egpAppliedOn" TIMESTAMP(3),
  ADD COLUMN "egpObtainedOn" TIMESTAMP(3);

CREATE INDEX "completion_certificates_organizationId_source_egpStatus_idx"
  ON "completion_certificates"("organizationId", "source", "egpStatus");

ALTER TABLE "completion_certificates"
  ADD CONSTRAINT "completion_certificates_source_tracking_check"
  CHECK (
    ("source" = 'UNSPECIFIED' AND "egpStatus" = 'UNSPECIFIED' AND "egpAppliedOn" IS NULL AND "egpObtainedOn" IS NULL)
    OR
    ("source" = 'EGP' AND "egpStatus" = 'NOT_APPLICABLE' AND "egpAppliedOn" IS NULL AND "egpObtainedOn" IS NULL)
    OR
    ("source" = 'MANUAL' AND "egpStatus" IN ('NOT_APPLIED', 'PENDING', 'UNDER_PROCESS', 'OBTAINED'))
  ),
  ADD CONSTRAINT "completion_certificates_egp_dates_check"
  CHECK (
    ("egpStatus" IN ('UNSPECIFIED', 'NOT_APPLICABLE', 'NOT_APPLIED') AND "egpAppliedOn" IS NULL AND "egpObtainedOn" IS NULL)
    OR
    ("egpStatus" IN ('PENDING', 'UNDER_PROCESS') AND "egpAppliedOn" IS NOT NULL AND "egpObtainedOn" IS NULL)
    OR
    ("egpStatus" = 'OBTAINED' AND "egpAppliedOn" IS NOT NULL AND "egpObtainedOn" IS NOT NULL AND "egpObtainedOn" >= "egpAppliedOn")
  );
