import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SupportTicketStatus } from "@prisma/client";
import type { SupportTicketDetail, SupportTicketSummary } from "@bizovix/types";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateSupportTicketDto,
  QuerySupportTicketDto,
  ReplySupportTicketDto,
} from "./dto/support-ticket.dto";
import { assertSupportFiles, safeSupportFileName, type UploadedSupportFile } from "./support-ticket-files";

const summarySelect = {
  id: true,
  number: true,
  subject: true,
  issueType: true,
  moduleName: true,
  priority: true,
  status: true,
  createdAt: true,
  lastActivityAt: true,
  organization: { select: { name: true } },
  createdBy: { select: { name: true } },
  _count: { select: { messages: true } },
  messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
} as const;

const detailSelect = {
  ...summarySelect,
  pagePath: true,
  appVersion: true,
  messages: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      authorType: true,
      body: true,
      createdAt: true,
      authorUser: { select: { name: true } },
      authorVendorAdmin: { select: { name: true } },
      attachments: {
        orderBy: { createdAt: "asc" },
        select: { id: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
      },
    },
  },
} as const;

type SummaryRow = Prisma.SupportTicketGetPayload<{ select: typeof summarySelect }>;
type DetailRow = Prisma.SupportTicketGetPayload<{ select: typeof detailSelect }>;

function summary(row: SummaryRow): SupportTicketSummary {
  return {
    id: row.id,
    number: row.number,
    subject: row.subject,
    issueType: row.issueType,
    moduleName: row.moduleName,
    priority: row.priority,
    status: row.status,
    organizationName: row.organization.name,
    createdByName: row.createdBy.name,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    lastMessagePreview: row.messages[0]?.body.slice(0, 180) ?? "",
    messageCount: row._count.messages,
  };
}

function detail(row: DetailRow): SupportTicketDetail {
  return {
    ...summary({ ...row, messages: row.messages.slice(-1) }),
    pagePath: row.pagePath,
    appVersion: row.appVersion,
    messages: row.messages.map((message) => ({
      id: message.id,
      authorType: message.authorType,
      authorName: message.authorUser?.name ?? message.authorVendorAdmin?.name ?? "Former user",
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize,
        createdAt: attachment.createdAt.toISOString(),
      })),
    })),
  };
}

@Injectable()
export class SupportTicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(organizationId: string, userId: string, query: QuerySupportTicketDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SupportTicketWhereInput = {
      organizationId,
      createdById: userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { subject: { contains: query.search.trim(), mode: "insensitive" } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        select: summarySelect,
        orderBy: { lastActivityAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { items: rows.map(summary), meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async listForSupport(query: QuerySupportTicketDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const where: Prisma.SupportTicketWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { subject: { contains: search, mode: "insensitive" } },
              { organization: { name: { contains: search, mode: "insensitive" } } },
              ...(Number.isSafeInteger(Number(search)) ? [{ number: Number(search) }] : []),
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        select: summarySelect,
        orderBy: { lastActivityAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { items: rows.map(summary), meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getMine(organizationId: string, userId: string, id: string): Promise<SupportTicketDetail> {
    const row = await this.prisma.supportTicket.findFirst({
      where: { id, organizationId, createdById: userId },
      select: detailSelect,
    });
    if (!row) throw new NotFoundException("Support ticket not found");
    return detail(row);
  }

  async getForSupport(id: string): Promise<SupportTicketDetail> {
    const row = await this.prisma.supportTicket.findUnique({ where: { id }, select: detailSelect });
    if (!row) throw new NotFoundException("Support ticket not found");
    return detail(row);
  }

  async create(organizationId: string, userId: string, dto: CreateSupportTicketDto, files: UploadedSupportFile[]) {
    assertSupportFiles(files);
    const subject = dto.subject.trim();
    const moduleName = dto.moduleName.trim();
    const description = dto.description.trim();
    if (subject.length < 5 || moduleName.length < 2 || description.length < 10) {
      throw new BadRequestException("Subject, module and description are required");
    }
    const ticketId = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          organizationId,
          createdById: userId,
          subject,
          issueType: dto.issueType,
          moduleName,
          priority: dto.priority,
          pagePath: dto.pagePath ?? null,
          appVersion: dto.appVersion ?? null,
        },
      });
      const message = await tx.supportTicketMessage.create({
        data: { organizationId, ticketId: ticket.id, authorType: "CUSTOMER", authorUserId: userId, body: description },
      });
      if (files.length) {
        await tx.supportTicketAttachment.createMany({
          data: files.map((file) => ({
            organizationId,
            ticketId: ticket.id,
            messageId: message.id,
            fileName: safeSupportFileName(file.originalname),
            mimeType: file.mimetype,
            fileSize: file.size,
            data: Uint8Array.from(file.buffer),
          })),
        });
      }
      return ticket.id;
    });
    return this.getMine(organizationId, userId, ticketId);
  }

  async replyMine(organizationId: string, userId: string, id: string, dto: ReplySupportTicketDto, files: UploadedSupportFile[]) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, organizationId, createdById: userId } });
    if (!ticket) throw new NotFoundException("Support ticket not found");
    await this.addMessage(ticket.id, organizationId, "CUSTOMER", userId, null, dto.body, files,
      ticket.status === "RESOLVED" || ticket.status === "CLOSED" || ticket.status === "WAITING_FOR_CUSTOMER" ? "OPEN" : ticket.status);
    return this.getMine(organizationId, userId, id);
  }

  async replyForSupport(adminId: string, id: string, dto: ReplySupportTicketDto, files: UploadedSupportFile[]) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException("Support ticket not found");
    await this.addMessage(ticket.id, ticket.organizationId, "SUPPORT", null, adminId, dto.body, files, "WAITING_FOR_CUSTOMER", ticket.createdById, ticket.number);
    return this.getForSupport(id);
  }

  async setStatusMine(organizationId: string, userId: string, id: string, status: SupportTicketStatus) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, organizationId, createdById: userId } });
    if (!ticket) throw new NotFoundException("Support ticket not found");
    if (status === "CLOSED" && ticket.status !== "RESOLVED") {
      throw new BadRequestException("Only resolved tickets can be closed");
    }
    if (status === "OPEN" && !["RESOLVED", "CLOSED"].includes(ticket.status)) {
      throw new BadRequestException("Only resolved or closed tickets can be reopened");
    }
    if (!["CLOSED", "OPEN"].includes(status)) {
      throw new BadRequestException("This ticket status is managed by support");
    }
    if (ticket.status !== status) {
      await this.prisma.supportTicket.update({ where: { id }, data: { status, lastActivityAt: new Date() } });
    }
    return this.getMine(organizationId, userId, id);
  }

  async setStatusForSupport(id: string, status: SupportTicketStatus) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException("Support ticket not found");
    if (ticket.status !== status) {
      await this.prisma.$transaction(async (tx) => {
        await tx.supportTicket.update({ where: { id }, data: { status, lastActivityAt: new Date() } });
        await tx.notification.create({
          data: {
            organizationId: ticket.organizationId,
            userId: ticket.createdById,
            type: "SUPPORT_STATUS",
            title: `Ticket #${ticket.number} status updated`,
            message: `Your support ticket is now ${status.replaceAll("_", " ").toLowerCase()}.`,
            sourceModule: "SUPPORT",
            sourceType: "STATUS",
            sourceId: ticket.id,
            priority: ticket.priority === "URGENT" ? "HIGH" : "MEDIUM",
          },
        });
      });
    }
    return this.getForSupport(id);
  }

  async attachmentMine(organizationId: string, userId: string, ticketId: string, attachmentId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id: ticketId, organizationId, createdById: userId }, select: { id: true } });
    if (!ticket) throw new NotFoundException("Attachment not found");
    return this.attachment(ticketId, attachmentId);
  }

  async attachmentForSupport(ticketId: string, attachmentId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true } });
    if (!ticket) throw new NotFoundException("Attachment not found");
    return this.attachment(ticketId, attachmentId);
  }

  private async attachment(ticketId: string, attachmentId: string) {
    const row = await this.prisma.supportTicketAttachment.findFirst({
      where: { id: attachmentId, ticketId },
      select: { fileName: true, mimeType: true, data: true },
    });
    if (!row) throw new NotFoundException("Attachment not found");
    return row;
  }

  private async addMessage(
    ticketId: string,
    organizationId: string,
    authorType: "CUSTOMER" | "SUPPORT",
    authorUserId: string | null,
    authorVendorAdminId: string | null,
    bodyInput: string,
    files: UploadedSupportFile[],
    status: SupportTicketStatus,
    notifyUserId?: string,
    ticketNumber?: number,
  ) {
    assertSupportFiles(files);
    const body = bodyInput.trim();
    if (!body || body.length > 5000) throw new BadRequestException("Reply must be 1 to 5000 characters");
    await this.prisma.$transaction(async (tx) => {
      const message = await tx.supportTicketMessage.create({
        data: { organizationId, ticketId, authorType, authorUserId, authorVendorAdminId, body },
      });
      if (files.length) {
        await tx.supportTicketAttachment.createMany({
          data: files.map((file) => ({
            organizationId,
            ticketId,
            messageId: message.id,
            fileName: safeSupportFileName(file.originalname),
            mimeType: file.mimetype,
            fileSize: file.size,
            data: Uint8Array.from(file.buffer),
          })),
        });
      }
      await tx.supportTicket.update({ where: { id: ticketId }, data: { status, lastActivityAt: new Date() } });
      if (notifyUserId) {
        await tx.notification.create({
          data: {
            organizationId,
            userId: notifyUserId,
            type: "SUPPORT_REPLY",
            title: `Reply on ticket #${ticketNumber}`,
            message: body.slice(0, 180),
            sourceModule: "SUPPORT",
            sourceType: "REPLY",
            sourceId: ticketId,
            priority: status === "WAITING_FOR_CUSTOMER" ? "HIGH" : "MEDIUM",
          },
        });
      }
    });
  }
}
