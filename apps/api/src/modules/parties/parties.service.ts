import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PartyRole, Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { CreatePartyDto } from "./dto/create-party.dto";
import { UpdatePartyDto } from "./dto/update-party.dto";
import { QueryPartyDto } from "./dto/query-party.dto";
import { ChangePartyStatusDto } from "./dto/change-party-status.dto";
import { SavePartyContactDto } from "./dto/save-party-contact.dto";

const includeRelations = {
  paymentTerm: { select: { id: true, name: true, days: true } },
  category: { select: { id: true, name: true, type: true } },
  subcontractorProfile: { include: { tradeCategory: { select: { id: true, name: true } } } },
  contacts: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.PartyInclude;

type PartyRecord = Prisma.PartyGetPayload<{ include: typeof includeRelations }>;

function toDto(record: PartyRecord) {
  return {
    ...record,
    creditLimit: record.creditLimit?.toFixed(2) ?? null,
    subcontractorProfile: record.subcontractorProfile
      ? {
          ...record.subcontractorProfile,
          defaultRetentionPct: record.subcontractorProfile.defaultRetentionPct?.toFixed(2) ?? null,
          performanceRating: record.subcontractorProfile.performanceRating?.toFixed(2) ?? null,
        }
      : null,
  };
}

/** A pure-subcontractor party (no vendor/supplier/service-provider side) gets SUBCONTRACTOR-
 * prefixed numbering/audit events; anything else (including dual-role parties) is treated as
 * a vendor for numbering/audit purposes. */
function isPureSubcontractor(roles: PartyRole[]): boolean {
  const payeeRoles: PartyRole[] = ["VENDOR", "SUPPLIER", "SERVICE_PROVIDER"];
  return roles.includes("SUBCONTRACTOR") && !roles.some((role) => payeeRoles.includes(role));
}

@Injectable()
export class PartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly numbering: NumberingService,
  ) {}

  private where(organizationId: string, query: QueryPartyDto): Prisma.PartyWhereInput {
    const roles = query.roles
      ?.split(",")
      .map((role) => role.trim())
      .filter((role): role is PartyRole => (Object.values(PartyRole) as string[]).includes(role));

    return {
      organizationId,
      ...(roles?.length ? { roles: { hasSome: roles } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.district ? { district: { equals: query.district, mode: "insensitive" } } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
              { tinNo: { contains: query.search, mode: "insensitive" } },
              { binVat: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  }

  async findAll(organizationId: string, query: QueryPartyDto): Promise<{ items: ReturnType<typeof toDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = this.where(organizationId, query);

    const [items, total] = await Promise.all([
      this.prisma.party.findMany({ where, include: includeRelations, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.party.count({ where }),
    ]);

    const outstandingByParty = await this.outstandingPayableByParty(organizationId, items.map((item) => item.id));

    return {
      items: items.map((item) => ({ ...toDto(item), outstandingPayable: outstandingByParty.get(item.id)?.toFixed(2) ?? "0.00" })),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  private async outstandingPayableByParty(organizationId: string, partyIds: string[]): Promise<Map<string, Prisma.Decimal>> {
    if (!partyIds.length) return new Map();
    const rows = await this.prisma.payable.groupBy({
      by: ["partyId"],
      where: { organizationId, partyId: { in: partyIds } },
      _sum: { amount: true, paidAmount: true },
    });
    const map = new Map<string, Prisma.Decimal>();
    for (const row of rows) {
      if (!row.partyId) continue;
      map.set(row.partyId, (row._sum.amount ?? new Prisma.Decimal(0)).sub(row._sum.paidAmount ?? new Prisma.Decimal(0)));
    }
    return map;
  }

  async stats(organizationId: string, rolesCsv?: string) {
    const roles = rolesCsv
      ?.split(",")
      .map((role) => role.trim())
      .filter((role): role is PartyRole => (Object.values(PartyRole) as string[]).includes(role));
    const baseWhere: Prisma.PartyWhereInput = { organizationId, ...(roles?.length ? { roles: { hasSome: roles } } : {}) };

    const [total, active, suspendedOrInactive, matchingParties] = await Promise.all([
      this.prisma.party.count({ where: baseWhere }),
      this.prisma.party.count({ where: { ...baseWhere, status: "ACTIVE" } }),
      this.prisma.party.count({ where: { ...baseWhere, status: { in: ["SUSPENDED", "INACTIVE"] } } }),
      this.prisma.party.findMany({ where: baseWhere, select: { id: true } }),
    ]);

    const outstandingAgg = await this.prisma.payable.aggregate({
      where: { organizationId, partyId: { in: matchingParties.map((party) => party.id) } },
      _sum: { amount: true, paidAmount: true },
    });
    const outstandingPayable = (outstandingAgg._sum.amount ?? new Prisma.Decimal(0)).sub(outstandingAgg._sum.paidAmount ?? new Prisma.Decimal(0));

    return { total, active, suspendedOrInactive, outstandingPayable: outstandingPayable.toFixed(2) };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.party.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("Party not found");

    const [payables, documents, projectExposure] = await Promise.all([
      this.prisma.payable.findMany({ where: { organizationId, partyId: id }, orderBy: { billDate: "desc" }, take: 20 }),
      this.prisma.document.findMany({
        where: { organizationId, partyId: id },
        select: { id: true, name: true, category: true, expiryDate: true, status: true },
        orderBy: { createdAt: "desc" },
      }),
      // Honest placeholder: no Vendor<->Project assignment model exists yet (deliberately not
      // built this phase — see final report). Reported as 0 rather than fabricated.
      Promise.resolve(0),
    ]);

    const outstandingPayable = payables.reduce((sum, payable) => sum.add(payable.amount.sub(payable.paidAmount)), new Prisma.Decimal(0));

    return {
      ...toDto(record),
      linked: {
        payables: payables.map((payable) => ({ ...payable, amount: payable.amount.toFixed(2), paidAmount: payable.paidAmount.toFixed(2) })),
        documents,
        projectsAssigned: projectExposure,
      },
      outstandingPayable: outstandingPayable.toFixed(2),
    };
  }

  /** Warnings only — never blocks and never auto-merges, per spec. */
  private async findDuplicateWarnings(organizationId: string, dto: CreatePartyDto | UpdatePartyDto, excludeId?: string): Promise<string[]> {
    const warnings: string[] = [];
    const normalizedName = dto.name?.trim().toLowerCase();

    const candidates = await this.prisma.party.findMany({
      where: {
        organizationId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [
          ...(normalizedName ? [{ name: { equals: normalizedName, mode: "insensitive" as const } }] : []),
          ...(dto.tinNo ? [{ tinNo: dto.tinNo }] : []),
          ...(dto.binVat ? [{ binVat: dto.binVat }] : []),
          ...(dto.registrationNo ? [{ registrationNo: dto.registrationNo }] : []),
          ...(dto.bankAccountNo ? [{ bankAccountNo: dto.bankAccountNo }] : []),
        ],
      },
      select: { name: true, tinNo: true, binVat: true, registrationNo: true, bankAccountNo: true },
    });

    for (const candidate of candidates) {
      if (normalizedName && candidate.name.trim().toLowerCase() === normalizedName) warnings.push(`A party named "${candidate.name}" already exists in this organization.`);
      if (dto.tinNo && candidate.tinNo === dto.tinNo) warnings.push(`Another party already uses TIN "${dto.tinNo}".`);
      if (dto.binVat && candidate.binVat === dto.binVat) warnings.push(`Another party already uses BIN/VAT "${dto.binVat}".`);
      if (dto.registrationNo && candidate.registrationNo === dto.registrationNo) warnings.push(`Another party already uses registration no. "${dto.registrationNo}".`);
      if (dto.bankAccountNo && candidate.bankAccountNo === dto.bankAccountNo) warnings.push(`Another party already uses bank account no. "${dto.bankAccountNo}".`);
    }
    return [...new Set(warnings)];
  }

  private async assertReferences(organizationId: string, dto: { paymentTermId?: string; categoryId?: string }) {
    if (dto.paymentTermId) {
      const term = await this.prisma.paymentTerm.findFirst({ where: { id: dto.paymentTermId, organizationId } });
      if (!term) throw new NotFoundException("Payment Term not found");
    }
    if (dto.categoryId) {
      const category = await this.prisma.masterCategory.findFirst({ where: { id: dto.categoryId, organizationId, type: "VENDOR" } });
      if (!category) throw new NotFoundException("Vendor category not found");
    }
  }

  async create(organizationId: string, userId: string, dto: CreatePartyDto) {
    await this.assertReferences(organizationId, dto);
    if (dto.subcontractor?.tradeCategoryId) {
      const category = await this.prisma.masterCategory.findFirst({ where: { id: dto.subcontractor.tradeCategoryId, organizationId, type: "SUBCONTRACTOR_TRADE" } });
      if (!category) throw new NotFoundException("Subcontractor trade category not found");
    }

    let code = dto.code?.trim();
    if (code) {
      const clash = await this.prisma.party.findFirst({ where: { organizationId, code } });
      if (clash) throw new BadRequestException(`Vendor/Party code "${code}" is already in use`);
    } else {
      code = await this.numbering.next(organizationId, isPureSubcontractor(dto.roles) ? "SUBCONTRACTOR" : "VENDOR");
    }

    const warnings = await this.findDuplicateWarnings(organizationId, dto);

    const record = await this.prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: {
          organizationId,
          code: code!,
          name: dto.name,
          displayName: dto.displayName,
          roles: dto.roles,
          status: dto.status ?? "ACTIVE",
          contactPerson: dto.contactPerson,
          phone: dto.phone,
          alternatePhone: dto.alternatePhone,
          email: dto.email,
          website: dto.website,
          address: dto.address,
          district: dto.district,
          country: dto.country,
          binVat: dto.binVat,
          tinNo: dto.tinNo,
          tradeLicenseNo: dto.tradeLicenseNo,
          registrationNo: dto.registrationNo,
          bankName: dto.bankName,
          bankAccountName: dto.bankAccountName,
          bankAccountNo: dto.bankAccountNo,
          bankBranch: dto.bankBranch,
          bankRoutingSwift: dto.bankRoutingSwift,
          paymentTermId: dto.paymentTermId,
          defaultCurrency: dto.defaultCurrency ?? "BDT",
          creditLimit: dto.creditLimit,
          categoryId: dto.categoryId,
          notes: dto.notes,
          createdById: userId,
        },
      });

      if (dto.roles.includes("SUBCONTRACTOR")) {
        await tx.subcontractorProfile.create({
          data: {
            organizationId,
            partyId: party.id,
            tradeCategoryId: dto.subcontractor?.tradeCategoryId,
            specialization: dto.subcontractor?.specialization,
            defaultRetentionPct: dto.subcontractor?.defaultRetentionPct,
            performanceRating: dto.subcontractor?.performanceRating,
          },
        });
      }

      return tx.party.findFirstOrThrow({ where: { id: party.id }, include: includeRelations });
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: isPureSubcontractor(dto.roles) ? "SUBCONTRACTOR_CREATED" : "VENDOR_CREATED",
      entityType: "Party",
      entityId: record.id,
      referenceNo: record.code,
      newValue: toDto(record),
    });

    return { ...toDto(record), duplicateWarnings: warnings };
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdatePartyDto) {
    const existing = await this.prisma.party.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!existing) throw new NotFoundException("Party not found");
    await this.assertReferences(organizationId, dto);
    if (dto.subcontractor?.tradeCategoryId) {
      const category = await this.prisma.masterCategory.findFirst({ where: { id: dto.subcontractor.tradeCategoryId, organizationId, type: "SUBCONTRACTOR_TRADE" } });
      if (!category) throw new NotFoundException("Subcontractor trade category not found");
    }

    const warnings = await this.findDuplicateWarnings(organizationId, { ...existing, ...dto } as CreatePartyDto, id);
    const nextRoles = dto.roles ?? existing.roles;

    const record = await this.prisma.$transaction(async (tx) => {
      const party = await tx.party.update({
        where: { id, organizationId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
          ...(dto.roles !== undefined ? { roles: dto.roles } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.contactPerson !== undefined ? { contactPerson: dto.contactPerson } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.alternatePhone !== undefined ? { alternatePhone: dto.alternatePhone } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.website !== undefined ? { website: dto.website } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
          ...(dto.district !== undefined ? { district: dto.district } : {}),
          ...(dto.country !== undefined ? { country: dto.country } : {}),
          ...(dto.binVat !== undefined ? { binVat: dto.binVat } : {}),
          ...(dto.tinNo !== undefined ? { tinNo: dto.tinNo } : {}),
          ...(dto.tradeLicenseNo !== undefined ? { tradeLicenseNo: dto.tradeLicenseNo } : {}),
          ...(dto.registrationNo !== undefined ? { registrationNo: dto.registrationNo } : {}),
          ...(dto.bankName !== undefined ? { bankName: dto.bankName } : {}),
          ...(dto.bankAccountName !== undefined ? { bankAccountName: dto.bankAccountName } : {}),
          ...(dto.bankAccountNo !== undefined ? { bankAccountNo: dto.bankAccountNo } : {}),
          ...(dto.bankBranch !== undefined ? { bankBranch: dto.bankBranch } : {}),
          ...(dto.bankRoutingSwift !== undefined ? { bankRoutingSwift: dto.bankRoutingSwift } : {}),
          ...(dto.paymentTermId !== undefined ? { paymentTermId: dto.paymentTermId } : {}),
          ...(dto.defaultCurrency !== undefined ? { defaultCurrency: dto.defaultCurrency } : {}),
          ...(dto.creditLimit !== undefined ? { creditLimit: dto.creditLimit } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });

      const hasSubcontractorRole = nextRoles.includes("SUBCONTRACTOR");
      if (hasSubcontractorRole && !existing.subcontractorProfile) {
        await tx.subcontractorProfile.create({
          data: {
            organizationId,
            partyId: party.id,
            tradeCategoryId: dto.subcontractor?.tradeCategoryId,
            specialization: dto.subcontractor?.specialization,
            defaultRetentionPct: dto.subcontractor?.defaultRetentionPct,
            performanceRating: dto.subcontractor?.performanceRating,
          },
        });
      } else if (hasSubcontractorRole && existing.subcontractorProfile && dto.subcontractor) {
        await tx.subcontractorProfile.update({
          where: { partyId: party.id },
          data: {
            ...(dto.subcontractor.tradeCategoryId !== undefined ? { tradeCategoryId: dto.subcontractor.tradeCategoryId } : {}),
            ...(dto.subcontractor.specialization !== undefined ? { specialization: dto.subcontractor.specialization } : {}),
            ...(dto.subcontractor.defaultRetentionPct !== undefined ? { defaultRetentionPct: dto.subcontractor.defaultRetentionPct } : {}),
            ...(dto.subcontractor.performanceRating !== undefined ? { performanceRating: dto.subcontractor.performanceRating } : {}),
          },
        });
      }
      // Deliberately never deletes an existing SubcontractorProfile when the SUBCONTRACTOR role
      // is removed — historical retention%/rating stays intact for audit/report purposes.

      return tx.party.findFirstOrThrow({ where: { id: party.id }, include: includeRelations });
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: isPureSubcontractor(nextRoles) ? "SUBCONTRACTOR_UPDATED" : "VENDOR_UPDATED",
      entityType: "Party",
      entityId: id,
      referenceNo: record.code,
      oldValue: toDto(existing),
      newValue: toDto(record),
    });

    return { ...toDto(record), duplicateWarnings: warnings };
  }

  async changeStatus(organizationId: string, userId: string, id: string, dto: ChangePartyStatusDto) {
    const existing = await this.prisma.party.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Party not found");

    const record = await this.prisma.party.update({
      where: { id, organizationId },
      data: {
        status: dto.status,
        ...(dto.status === "ARCHIVED" ? { archivedAt: new Date(), archivedById: userId } : {}),
      },
      include: includeRelations,
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: isPureSubcontractor(existing.roles) ? "SUBCONTRACTOR_UPDATED" : "VENDOR_STATUS_CHANGED",
      entityType: "Party",
      entityId: id,
      referenceNo: record.code,
      description: dto.reason,
      oldValue: { status: existing.status },
      newValue: { status: record.status },
    });

    return toDto(record);
  }

  // --- Contacts sub-resource -------------------------------------------------

  async addContact(organizationId: string, id: string, dto: SavePartyContactDto) {
    const party = await this.prisma.party.findFirst({ where: { id, organizationId } });
    if (!party) throw new NotFoundException("Party not found");
    return this.prisma.organizationContact.create({
      data: { organizationId, partyId: id, contactRole: dto.contactRole, name: dto.name, designation: dto.designation, mobile: dto.mobile, email: dto.email, address: dto.address },
    });
  }

  async updateContact(organizationId: string, id: string, contactId: string, dto: SavePartyContactDto) {
    const contact = await this.prisma.organizationContact.findFirst({ where: { id: contactId, organizationId, partyId: id } });
    if (!contact) throw new NotFoundException("Contact not found");
    return this.prisma.organizationContact.update({
      where: { id: contactId },
      data: { contactRole: dto.contactRole, name: dto.name, designation: dto.designation, mobile: dto.mobile, email: dto.email, address: dto.address },
    });
  }

  async removeContact(organizationId: string, id: string, contactId: string) {
    const contact = await this.prisma.organizationContact.findFirst({ where: { id: contactId, organizationId, partyId: id } });
    if (!contact) throw new NotFoundException("Contact not found");
    await this.prisma.organizationContact.delete({ where: { id: contactId } });
  }
}
