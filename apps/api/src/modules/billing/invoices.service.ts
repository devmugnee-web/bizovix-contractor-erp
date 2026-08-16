import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { generateInvoicePdf } from "./invoice-pdf";
import type { QueryInvoiceDto, RecordPaymentDto, VerifyPaymentDto } from "./dto/invoice.dto";

const includeRelations = {
  items: true,
  payments: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.InvoiceInclude;
type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof includeRelations }>;

function toDto(row: InvoiceRow) {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    planNameSnapshot: row.planNameSnapshot,
    billingCycle: row.billingCycle,
    billingPeriodStart: row.billingPeriodStart,
    billingPeriodEnd: row.billingPeriodEnd,
    subtotal: row.subtotal.toFixed(2),
    discount: row.discount.toFixed(2),
    tax: row.tax.toFixed(2),
    total: row.total.toFixed(2),
    currency: row.currency,
    status: row.status,
    issuedAt: row.issuedAt,
    dueAt: row.dueAt,
    paidAt: row.paidAt,
    items: row.items.map((i) => ({ id: i.id, description: i.description, amount: i.amount.toFixed(2) })),
    payments: row.payments.map((p) => ({
      id: p.id,
      amount: p.amount.toFixed(2),
      method: p.method,
      reference: p.reference,
      status: p.status,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    })),
  };
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async list(org: string, query: QueryInvoiceDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.InvoiceWhereInput = { organizationId: org, ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: includeRelations,
        orderBy: { issuedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  private async loadRow(org: string, id: string): Promise<InvoiceRow> {
    const row = await this.prisma.invoice.findFirst({ where: { id, organizationId: org }, include: includeRelations });
    if (!row) throw new NotFoundException("Invoice not found");
    return row;
  }

  async one(org: string, id: string) {
    return toDto(await this.loadRow(org, id));
  }

  async recordPayment(org: string, userId: string, invoiceId: string, dto: RecordPaymentDto) {
    const invoice = await this.loadRow(org, invoiceId);
    if (invoice.status === "PAID") throw new BadRequestException("This invoice has already been paid");
    const payment = await this.prisma.paymentRecord.create({
      data: { invoiceId: invoice.id, amount: dto.amount, method: dto.method, reference: dto.reference, status: "PENDING" },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "payment_recorded",
      module: "Plan & Billing",
      entityType: "PaymentRecord",
      entityId: payment.id,
      referenceNo: invoice.invoiceNumber,
      description: `Payment recorded for ${invoice.invoiceNumber} via ${dto.method}`,
    });
    return this.one(org, invoiceId);
  }

  async verifyPayment(org: string, userId: string, invoiceId: string, paymentId: string, dto: VerifyPaymentDto) {
    const invoice = await this.loadRow(org, invoiceId);
    const payment = invoice.payments.find((p) => p.id === paymentId);
    if (!payment) throw new NotFoundException("Payment record not found");
    const now = new Date();
    await this.prisma.paymentRecord.update({
      where: { id: paymentId },
      data: { status: dto.status, paidAt: dto.status === "VERIFIED" ? now : null, verifiedById: userId },
    });
    if (dto.status === "VERIFIED") {
      await this.prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", paidAt: now } });
    }
    await this.audit.record({
      organizationId: org,
      userId,
      action: "payment_verified",
      module: "Plan & Billing",
      entityType: "PaymentRecord",
      entityId: paymentId,
      referenceNo: invoice.invoiceNumber,
      description: `Payment ${dto.status.toLowerCase()} for ${invoice.invoiceNumber}`,
    });
    return this.one(org, invoiceId);
  }

  async generatePdfBuffer(org: string, id: string) {
    const invoice = await this.loadRow(org, id);
    const [billingProfile, organization] = await Promise.all([
      this.prisma.billingProfile.findUnique({ where: { organizationId: org } }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: org } }),
    ]);
    const verifiedPayment = invoice.payments.find((p) => p.status === "VERIFIED");
    return generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt,
      billingPeriodStart: invoice.billingPeriodStart,
      billingPeriodEnd: invoice.billingPeriodEnd,
      planName: invoice.planNameSnapshot,
      billingCycle: invoice.billingCycle,
      currency: invoice.currency,
      subtotal: invoice.subtotal.toFixed(2),
      discount: invoice.discount.toFixed(2),
      tax: invoice.tax.toFixed(2),
      total: invoice.total.toFixed(2),
      status: invoice.status,
      paidAt: invoice.paidAt,
      paymentMethod: verifiedPayment?.method ?? billingProfile?.paymentMethodType ?? null,
      items: invoice.items.map((i) => ({ description: i.description, amount: i.amount.toFixed(2) })),
      billTo: {
        name: billingProfile?.billingName ?? organization.name,
        address: billingProfile?.billingAddress,
        email: billingProfile?.billingEmail,
        phone: billingProfile?.phone,
        tin: billingProfile?.tinNumber,
        bin: billingProfile?.binNumber,
      },
    });
  }
}
