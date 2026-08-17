-- AlterEnum
-- New enum values must be committed in their own migration before they can be
-- referenced (e.g. as a column DEFAULT) by a later migration/transaction.
ALTER TYPE "TenderStatus" ADD VALUE 'DRAFT';
ALTER TYPE "TenderStatus" ADD VALUE 'PUBLISHED';
ALTER TYPE "TenderStatus" ADD VALUE 'DOCUMENT_PURCHASED';
ALTER TYPE "TenderStatus" ADD VALUE 'PREPARING';
ALTER TYPE "TenderStatus" ADD VALUE 'OPENED';
ALTER TYPE "TenderStatus" ADD VALUE 'CANCELLED';
