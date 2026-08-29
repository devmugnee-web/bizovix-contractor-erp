import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ContractStatus,
  Prisma,
  VatTaxCertificateStatus,
  VatTaxCertificateType,
} from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  QueryRecentVatTaxCertificateDto,
  QueryVatTaxCertificateDto,
  QueryVatTaxCertificateStatsDto,
  type VatTaxCertificateStatusFilter,
} from "./dto/query-vat-tax-certificate.dto";
import {
  SaveVatTaxCertificateDto,
  UpdateVatTaxCertificateDto,
} from "./dto/save-vat-tax-certificate.dto";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);
const CSV_EXPORT_LIMIT = 10_000;

function nullableDateEquals(left: Date | null, right: Date | null) {
  if (left === null || right === null) return left === right;
  return left.getTime() === right.getTime();
}

function nullableDecimalEquals(
  left: Prisma.Decimal | number | string | null,
  right: Prisma.Decimal | number | string | null,
) {
  if (left === null || right === null) return left === right;
  return D(left).equals(D(right));
}

const includeRelations = {
  cmsWork: {
    select: {
      id: true,
      tenderId: true,
      workName: true,
      workCategory: true,
      contractValue: true,
      organizationMaster: { select: { id: true, shortName: true, fullName: true } },
      tender: { select: { id: true, egpTenderId: true, workName: true } },
    },
  },
  contract: {
    select: {
      id: true,
      contractNo: true,
      currentContractValue: true,
      currency: true,
      scopeOfWork: true,
    },
  },
  documents: {
    where: { status: { not: "ARCHIVED" } },
    select: {
      id: true,
      name: true,
      documentType: true,
      fileName: true,
      fileType: true,
      fileSize: true,
      currentVersion: true,
    },
  },
} satisfies Prisma.VatTaxCertificateInclude;

type VatTaxCertificateRecord = Prisma.VatTaxCertificateGetPayload<{
  include: typeof includeRelations;
}>;

type FilterInput = {
  search?: string;
  cmsWorkId?: string;
  tenderId?: string;
  certificateType?: VatTaxCertificateType;
  status?: VatTaxCertificateStatusFilter;
  dateFrom?: string;
  dateTo?: string;
};

function cleanOptional(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}

function inclusiveDateTo(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T23:59:59.999Z`)
    : new Date(value);
}

function csvCell(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function toDto(record: VatTaxCertificateRecord) {
  const { cmsWork, ...certificate } = record;
  return {
    ...certificate,
    amount: record.amount?.toFixed(2) ?? null,
    cmsWork: {
      id: cmsWork.id,
      workName: cmsWork.workName,
      workCategory: cmsWork.workCategory,
      contractValue: cmsWork.contractValue.toFixed(2),
      organizationMaster: cmsWork.organizationMaster,
    },
    tenderId: cmsWork.tenderId,
    tender: cmsWork.tender,
    contract: record.contract
      ? {
          ...record.contract,
          currentContractValue: record.contract.currentContractValue.toFixed(2),
        }
      : null,
  };
}

@Injectable()
export class VatTaxCertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private statuses(status?: VatTaxCertificateStatusFilter): VatTaxCertificateStatus[] | undefined {
    if (!status) return undefined;
    if (status === "PENDING_NOT_ISSUED") return ["PENDING", "NOT_ISSUED"];
    if (status === "REJECTED_RETURNED") return ["REJECTED", "RETURNED"];
    return [status];
  }

  private where(organizationId: string, query: FilterInput): Prisma.VatTaxCertificateWhereInput {
    if (query.dateFrom && query.dateTo && new Date(query.dateFrom) > new Date(query.dateTo)) {
      throw new BadRequestException("Date From cannot be after Date To");
    }
    const search = query.search?.trim();
    const statuses = this.statuses(query.status);
    const and: Prisma.VatTaxCertificateWhereInput[] = [];
    if (query.dateFrom || query.dateTo) {
      const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
      const dateTo = query.dateTo ? inclusiveDateTo(query.dateTo) : undefined;
      const datedRecord: Prisma.VatTaxCertificateWhereInput = {
        issueDate: {
          not: null,
          ...(dateTo ? { lte: dateTo } : {}),
        },
        ...(dateFrom
          ? {
              OR: [
                { validTill: { gte: dateFrom } },
                { validTill: null, issueDate: { gte: dateFrom } },
              ],
            }
          : {}),
      };
      and.push({
        OR: [
          datedRecord,
          {
            issueDate: null,
            applicationDate: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          },
        ],
      });
    }
    if (search) {
      and.push({
        OR: [
          { certificateNo: { contains: search, mode: "insensitive" } },
          { issuingAuthority: { contains: search, mode: "insensitive" } },
          { cmsWork: { workName: { contains: search, mode: "insensitive" } } },
          { cmsWork: { tender: { egpTenderId: { contains: search, mode: "insensitive" } } } },
          { contract: { contractNo: { contains: search, mode: "insensitive" } } },
        ],
      });
    }
    return {
      organizationId,
      ...(query.cmsWorkId ? { cmsWorkId: query.cmsWorkId } : {}),
      ...(query.tenderId ? { cmsWork: { tenderId: query.tenderId } } : {}),
      ...(query.certificateType ? { certificateType: query.certificateType } : {}),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(and.length ? { AND: and } : {}),
    };
  }

  async findAll(
    organizationId: string,
    query: QueryVatTaxCertificateDto,
  ): Promise<{ items: ReturnType<typeof toDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const where = this.where(organizationId, query);
    const [items, total] = await Promise.all([
      this.prisma.vatTaxCertificate.findMany({
        where,
        include: includeRelations,
        orderBy: [{ applicationDate: "desc" }, { updatedAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vatTaxCertificate.count({ where }),
    ]);
    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async stats(organizationId: string, query: QueryVatTaxCertificateStatsDto) {
    const where = this.where(organizationId, query);
    const [typeGroups, statusGroups, totals] = await Promise.all([
      this.prisma.vatTaxCertificate.groupBy({
        by: ["certificateType"],
        where,
        _count: { _all: true },
      }),
      this.prisma.vatTaxCertificate.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.vatTaxCertificate.aggregate({ where, _sum: { amount: true } }),
    ]);

    const types = new Map(typeGroups.map((row) => [row.certificateType, row._count._all]));
    const statuses = new Map(statusGroups.map((row) => [row.status, row]));
    const statusCount = (...values: VatTaxCertificateStatus[]) =>
      values.reduce((sum, status) => sum + (statuses.get(status)?._count._all ?? 0), 0);
    const statusAmount = (...values: VatTaxCertificateStatus[]) =>
      values.reduce((sum, status) => sum.add(statuses.get(status)?._sum.amount ?? D(0)), D(0));

    return {
      total: typeGroups.reduce((sum, row) => sum + row._count._all, 0),
      vat: types.get("VAT") ?? 0,
      tax: types.get("TAX") ?? 0,
      issued: statusCount("ISSUED"),
      underProcessing: statusCount("UNDER_PROCESSING"),
      pendingNotIssued: statusCount("PENDING", "NOT_ISSUED"),
      rejectedReturned: statusCount("REJECTED", "RETURNED"),
      totalAmount: (totals._sum.amount ?? D(0)).toFixed(2),
      issuedAmount: statusAmount("ISSUED").toFixed(2),
      underProcessingAmount: statusAmount("UNDER_PROCESSING").toFixed(2),
      pendingNotIssuedAmount: statusAmount("PENDING", "NOT_ISSUED").toFixed(2),
      rejectedReturnedAmount: statusAmount("REJECTED", "RETURNED").toFixed(2),
    };
  }

  async recent(organizationId: string, query: QueryRecentVatTaxCertificateDto) {
    const rows = await this.prisma.vatTaxCertificate.findMany({
      where: {
        organizationId,
        ...(query.cmsWorkId ? { cmsWorkId: query.cmsWorkId } : {}),
        ...(query.certificateType ? { certificateType: query.certificateType } : {}),
      },
      include: includeRelations,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: Math.min(query.limit ?? 5, 20),
    });
    return rows.map(toDto);
  }

  async exportCsv(
    organizationId: string,
    userId: string,
    query: QueryVatTaxCertificateDto,
  ) {
    const where = this.where(organizationId, query);
    const rows = await this.prisma.vatTaxCertificate.findMany({
      where,
      include: includeRelations,
      orderBy: [{ applicationDate: "desc" }, { updatedAt: "desc" }],
      take: CSV_EXPORT_LIMIT + 1,
    });
    if (rows.length > CSV_EXPORT_LIMIT) {
      throw new BadRequestException(
        `Export is limited to ${CSV_EXPORT_LIMIT.toLocaleString("en-US")} records; narrow the filters and try again`,
      );
    }
    const lines = [
      [
        "SL",
        "TID",
        "Project",
        "Certificate Type",
        "Certificate No",
        "Application Date",
        "Issue Date",
        "Valid Till",
        "Amount (BDT)",
        "Status",
      ]
        .map(csvCell)
        .join(","),
      ...rows.map((row, index) =>
        [
          index + 1,
          row.cmsWork.tender?.egpTenderId ?? "",
          row.cmsWork.workName,
          row.certificateType,
          row.certificateNo ?? "",
          row.applicationDate.toISOString().slice(0, 10),
          row.issueDate?.toISOString().slice(0, 10) ?? "",
          row.validTill?.toISOString().slice(0, 10) ?? "",
          row.amount?.toFixed(2) ?? "",
          row.status,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "VAT_TAX_CERTIFICATES_EXPORTED",
      entityType: "VatTaxCertificate",
      description: `Exported ${rows.length} VAT-Tax certificate records`,
      newValue: { rowCount: rows.length },
    });
    return {
      filename: `vat-tax-certificates-${new Date().toISOString().slice(0, 10)}.csv`,
      content: `\uFEFF${lines.join("\r\n")}`,
    };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.vatTaxCertificate.findFirst({
      where: { id, organizationId },
      include: includeRelations,
    });
    if (!record) throw new NotFoundException("VAT-Tax Certificate not found");
    return toDto(record);
  }

  private async assertRelations(
    tx: Prisma.TransactionClient,
    organizationId: string,
    cmsWorkId: string,
    contractId: string | null,
  ) {
    const work = await tx.cmsWork.findFirst({
      where: { id: cmsWorkId, organizationId },
      select: { id: true, status: true },
    });
    if (!work) throw new NotFoundException("Selected project was not found in this organization");
    if (work.status === "CANCELLED") {
      throw new BadRequestException("VAT-Tax Certificates cannot be changed for a cancelled project");
    }
    if (!contractId) return;
    const contract = await tx.projectContract.findFirst({
      where: { id: contractId, organizationId, cmsWorkId },
      select: { id: true, status: true },
    });
    if (!contract) {
      throw new NotFoundException("Selected contract was not found on the selected project");
    }
    if (contract.status === ContractStatus.CANCELLED) {
      throw new BadRequestException(
        "VAT-Tax Certificates cannot be changed for a cancelled contract",
      );
    }
  }

  private validateBusinessFields(input: {
    status: VatTaxCertificateStatus;
    certificateNo: string | null;
    issueDate: Date | null;
    validTill: Date | null;
    amount: Prisma.Decimal | number | null;
  }) {
    if (input.validTill && !input.issueDate) {
      throw new BadRequestException("Issue Date is required when Valid Till is provided");
    }
    if (input.issueDate && input.validTill && input.validTill < input.issueDate) {
      throw new BadRequestException("Valid Till cannot be before Issue Date");
    }
    if (
      input.status === "ISSUED" &&
      (!input.certificateNo ||
        !input.issueDate ||
        !input.validTill ||
        input.amount === null ||
        D(input.amount).lte(0))
    ) {
      throw new BadRequestException(
        "Issued certificates require Certificate No, Issue Date, Valid Till and a positive Amount",
      );
    }
  }

  private async assertNoDuplicate(
    tx: Prisma.TransactionClient,
    organizationId: string,
    certificateType: VatTaxCertificateType,
    certificateNo: string | null,
    excludeId?: string,
  ) {
    if (!certificateNo) return;
    const duplicate = await tx.vatTaxCertificate.findFirst({
      where: {
        organizationId,
        certificateType,
        certificateNo: { equals: certificateNo, mode: "insensitive" },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException("A certificate with this type and number already exists");
    }
  }

  private rethrowDuplicate(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException("A certificate with this type and number already exists");
    }
    throw error;
  }

  async create(organizationId: string, userId: string, dto: SaveVatTaxCertificateDto) {
    const cmsWorkId = dto.cmsWorkId.trim();
    const contractId = cleanOptional(dto.contractId) ?? null;
    const certificateNo = cleanOptional(dto.certificateNo) ?? null;
    const issueDate = dto.issueDate ? new Date(dto.issueDate) : null;
    const validTill = dto.validTill ? new Date(dto.validTill) : null;
    const amount = dto.amount ?? null;
    const status = dto.status ?? VatTaxCertificateStatus.PENDING;
    this.validateBusinessFields({ status, certificateNo, issueDate, validTill, amount });

    const record = await this.prisma
      .$transaction(async (tx) => {
        await this.assertRelations(tx, organizationId, cmsWorkId, contractId);
        await this.assertNoDuplicate(
          tx,
          organizationId,
          dto.certificateType,
          certificateNo,
        );
        return tx.vatTaxCertificate.create({
          data: {
            organizationId,
            cmsWorkId,
            contractId,
            certificateType: dto.certificateType,
            ...(dto.applicationDate
              ? { applicationDate: new Date(dto.applicationDate) }
              : {}),
            certificateNo,
            issueDate,
            validTill,
            amount,
            status,
            issuingAuthority: cleanOptional(dto.issuingAuthority) ?? null,
            remarks: cleanOptional(dto.remarks) ?? null,
            createdById: userId,
            updatedById: userId,
          },
          include: includeRelations,
        });
      })
      .catch((error: unknown) => this.rethrowDuplicate(error));

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "VAT_TAX_CERTIFICATE_CREATED",
      entityType: "VatTaxCertificate",
      entityId: record.id,
      referenceNo: record.certificateNo,
      newValue: toDto(record),
    });
    return toDto(record);
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateVatTaxCertificateDto,
  ) {
    const mutation = await this.prisma
      .$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "vat_tax_certificates"
          WHERE "id" = ${id} AND "organizationId" = ${organizationId}
          FOR UPDATE
        `;
        if (!locked[0]) throw new NotFoundException("VAT-Tax Certificate not found");
        const existing = await tx.vatTaxCertificate.findFirst({
          where: { id, organizationId },
          include: includeRelations,
        });
        if (!existing) throw new NotFoundException("VAT-Tax Certificate not found");

        const cmsWorkId = dto.cmsWorkId?.trim() || existing.cmsWorkId;
        const contractId =
          dto.contractId === undefined
            ? existing.contractId
            : (cleanOptional(dto.contractId) ?? null);
        const certificateType = dto.certificateType ?? existing.certificateType;
        const applicationDate = dto.applicationDate
          ? new Date(dto.applicationDate)
          : existing.applicationDate;
        const certificateNo =
          dto.certificateNo === undefined
            ? existing.certificateNo
            : (cleanOptional(dto.certificateNo) ?? null);
        const issueDate =
          dto.issueDate === undefined
            ? existing.issueDate
            : dto.issueDate
              ? new Date(dto.issueDate)
              : null;
        const validTill =
          dto.validTill === undefined
            ? existing.validTill
            : dto.validTill
              ? new Date(dto.validTill)
              : null;
        const amount = dto.amount === undefined ? existing.amount : dto.amount;
        const status = dto.status ?? existing.status;
        const issuingAuthority =
          dto.issuingAuthority === undefined
            ? existing.issuingAuthority
            : (cleanOptional(dto.issuingAuthority) ?? null);

        this.validateBusinessFields({ status, certificateNo, issueDate, validTill, amount });
        await this.assertRelations(tx, organizationId, cmsWorkId, contractId);
        await this.assertNoDuplicate(
          tx,
          organizationId,
          certificateType,
          certificateNo,
          id,
        );

        if (
          (cmsWorkId !== existing.cmsWorkId ||
            contractId !== existing.contractId ||
            certificateType !== existing.certificateType) &&
          existing.documents.length
        ) {
          throw new BadRequestException(
            "Archive linked documents before changing the selected project, contract, or certificate type",
          );
        }

        const documentMetadataChanged =
          certificateNo !== existing.certificateNo ||
          issuingAuthority !== existing.issuingAuthority ||
          !nullableDecimalEquals(amount, existing.amount) ||
          !nullableDateEquals(issueDate, existing.issueDate) ||
          !nullableDateEquals(validTill, existing.validTill);

        if (documentMetadataChanged && existing.documents.length) {
          const canonicalDocumentType = `${certificateType}_CERTIFICATE`;
          await tx.document.updateMany({
            where: {
              organizationId,
              vatTaxCertificateId: id,
              status: { not: "ARCHIVED" },
            },
            data: {
              certificateNumber: certificateNo,
              issuingAuthority,
              amount,
              issueDate,
              expiryDate: validTill,
              relatedEntityId: id,
              relatedEntityName: certificateNo ?? existing.cmsWork.workName,
              relatedModule: "VAT_TAX_CERTIFICATE",
              ...(existing.documents.length === 1
                ? { documentType: canonicalDocumentType }
                : {}),
            },
          });
        }

        const record = await tx.vatTaxCertificate.update({
          where: { id, organizationId },
          data: {
            cmsWorkId,
            contractId,
            certificateType,
            applicationDate,
            certificateNo,
            issueDate,
            validTill,
            amount,
            status,
            issuingAuthority,
            remarks:
              dto.remarks === undefined
                ? existing.remarks
                : (cleanOptional(dto.remarks) ?? null),
            updatedById: userId,
          },
          include: includeRelations,
        });
        return { previous: existing, record };
      })
      .catch((error: unknown) => this.rethrowDuplicate(error));

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "VAT_TAX_CERTIFICATE_UPDATED",
      entityType: "VatTaxCertificate",
      entityId: id,
      referenceNo: mutation.record.certificateNo,
      oldValue: toDto(mutation.previous),
      newValue: toDto(mutation.record),
    });
    return toDto(mutation.record);
  }
}
