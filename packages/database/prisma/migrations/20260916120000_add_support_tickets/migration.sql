CREATE TYPE "SupportTicketIssueType" AS ENUM ('TECHNICAL', 'HOW_TO', 'DATA', 'FEATURE', 'ACCOUNT');
CREATE TYPE "SupportTicketPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED');
CREATE TYPE "SupportMessageAuthorType" AS ENUM ('CUSTOMER', 'SUPPORT');

CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "subject" VARCHAR(180) NOT NULL,
    "issueType" "SupportTicketIssueType" NOT NULL,
    "moduleName" VARCHAR(100) NOT NULL,
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "pagePath" VARCHAR(500),
    "appVersion" VARCHAR(50),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_messages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorType" "SupportMessageAuthorType" NOT NULL,
    "authorUserId" TEXT,
    "authorVendorAdminId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_attachments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_ticket_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_tickets_number_key" ON "support_tickets"("number");
CREATE INDEX "support_tickets_organizationId_createdById_lastActivityAt_idx" ON "support_tickets"("organizationId", "createdById", "lastActivityAt");
CREATE INDEX "support_tickets_status_lastActivityAt_idx" ON "support_tickets"("status", "lastActivityAt");
CREATE INDEX "support_ticket_messages_organizationId_ticketId_createdAt_idx" ON "support_ticket_messages"("organizationId", "ticketId", "createdAt");
CREATE INDEX "support_ticket_attachments_organizationId_ticketId_messageId_idx" ON "support_ticket_attachments"("organizationId", "ticketId", "messageId");

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_authorVendorAdminId_fkey" FOREIGN KEY ("authorVendorAdminId") REFERENCES "vendor_admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "support_ticket_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
