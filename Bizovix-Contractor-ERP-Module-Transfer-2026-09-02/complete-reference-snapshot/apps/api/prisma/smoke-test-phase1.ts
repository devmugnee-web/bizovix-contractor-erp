import { AuditService } from "../src/audit/audit.service.js";
import { PostingEngineService } from "../src/accounting/posting-engine.service.js";
import { PrismaClient, VoucherEntryStatus, VoucherEntryType } from "../src/generated/prisma/index.js";
import type { PrismaService } from "../src/prisma/prisma.service.js";
import { InventoryService } from "../src/inventory/inventory.service.js";

const prisma = new PrismaClient();
const prismaService = prisma as unknown as PrismaService;
const auditService = new AuditService(prismaService);
const inventoryService = new InventoryService(prismaService, auditService);
const engine = new PostingEngineService(prismaService, auditService, inventoryService);

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FAILED: ${message}`);
  }
  console.log(`OK: ${message}`);
}

async function main() {
  const company = await prisma.company.findFirst({ include: { workspaces: true } });
  if (!company || !company.workspaces[0]) {
    throw new Error("No seeded company/workspace found — run the seed script first");
  }

  const workspace = company.workspaces[0];
  const user = await prisma.user.findFirst();
  if (!user) {
    throw new Error("No user found");
  }

  const currentUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    initials: user.initials,
    tenantId: company.tenantId,
    organizationId: company.organizationId,
    companyId: company.id,
    workspaceId: workspace.id,
    sessionId: "smoke-test",
  };

  // 1. Balanced voucher assertion accepts equal debit/credit.
  engine.assertBalanced([
    { debit: 5000, credit: 0 },
    { debit: 0, credit: 5000 },
  ]);
  console.log("OK: balanced lines pass assertBalanced");

  // 2. Unbalanced voucher assertion throws.
  let threw = false;
  try {
    engine.assertBalanced([
      { debit: 5000, credit: 0 },
      { debit: 0, credit: 4000 },
    ]);
  } catch {
    threw = true;
  }
  assert(threw, "unbalanced lines are rejected by assertBalanced");

  // 3. Create a real DRAFT voucher end to end (idempotency key set).
  const idempotencyKey = `smoke-${Date.now()}`;
  const draft = await prisma.voucherEntry.create({
    data: {
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId: workspace.id,
      createdByUserId: user.id,
      voucherType: VoucherEntryType.JOURNAL,
      voucherNumber: `SMOKE-${Date.now()}`,
      voucherDate: new Date(),
      partyName: "Smoke Test Party",
      status: VoucherEntryStatus.DRAFT,
      totalAmount: 1000,
      debit: 1000,
      credit: 1000,
      idempotencyKey,
      lines: {
        create: [
          { ledger: "Cash in Hand", debit: 1000, credit: 0 },
          { ledger: "Sales Account", debit: 0, credit: 1000 },
        ],
      },
    },
  });
  assert(draft.status === VoucherEntryStatus.DRAFT, "voucher created in DRAFT status");

  // 4. Idempotency: looking up by the same key returns the same voucher.
  const found = await engine.findByIdempotencyKey(workspace.id, idempotencyKey);
  assert(found?.id === draft.id, "findByIdempotencyKey returns the same voucher for a repeated key");

  // 5. Direct status escalation is blocked.
  let blockedDirectPost = false;
  try {
    engine.assertDirectlySettable(VoucherEntryStatus.POSTED);
  } catch {
    blockedDirectPost = true;
  }
  assert(blockedDirectPost, "cannot set status directly to POSTED");

  // 6. Full lifecycle: DRAFT -> PENDING -> POSTED via the guarded engine.
  const pending = await engine.transitionStatus(currentUser, draft.id, VoucherEntryStatus.PENDING);
  assert(pending.status === VoucherEntryStatus.PENDING, "DRAFT -> PENDING transition succeeds");

  const posted = await engine.transitionStatus(currentUser, draft.id, VoucherEntryStatus.POSTED);
  assert(posted.status === VoucherEntryStatus.POSTED, "PENDING -> POSTED transition succeeds and sets postedAt");
  assert(posted.postedAt !== null, "postedAt is set on posting");
  assert(posted.approvedByUserId === user.id, "approvedByUserId is recorded on posting");

  // 7. An already-posted voucher cannot be edited (assertEditable throws).
  let blockedEdit = false;
  try {
    engine.assertEditable(posted.status);
  } catch {
    blockedEdit = true;
  }
  assert(blockedEdit, "a POSTED voucher is rejected by assertEditable");

  // 8. Reversal: original becomes REVERSED, a new mirrored POSTED voucher is created.
  const reversal = await engine.reverseVoucher(currentUser, draft.id, "smoke test reversal");
  assert(reversal.debit.toString() === "1000", "reversal voucher mirrors the original credit into its debit");
  assert(reversal.credit.toString() === "1000", "reversal voucher mirrors the original debit into its credit");

  const originalAfterReversal = await prisma.voucherEntry.findUniqueOrThrow({ where: { id: draft.id } });
  assert(originalAfterReversal.status === VoucherEntryStatus.REVERSED, "original voucher is marked REVERSED, not deleted");

  const auditRows = await prisma.auditLog.findMany({ where: { entityId: draft.id }, orderBy: { createdAt: "asc" } });
  assert(auditRows.some((row) => row.action === "VOUCHER_PENDING"), "audit log recorded the PENDING transition");
  assert(auditRows.some((row) => row.action === "VOUCHER_POSTED"), "audit log recorded the POSTED transition");
  assert(auditRows.some((row) => row.action === "VOUCHER_REVERSED"), "audit log recorded the reversal");

  // Cleanup: remove the smoke-test rows so this script leaves no residue in real data.
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [draft.id, reversal.id] } } });
  await prisma.voucherEntryLine.deleteMany({ where: { voucherId: { in: [draft.id, reversal.id] } } });
  await prisma.voucherEntry.deleteMany({ where: { id: { in: [draft.id, reversal.id] } } });
  console.log("OK: smoke test rows cleaned up");

  console.log("\nAll Phase 1 smoke tests passed.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
