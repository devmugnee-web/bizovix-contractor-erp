import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { QueryActivityLogDto } from "./dto/query-activity-log.dto";

const include = { user: { select: { id: true, name: true, email: true, organizations: { select: { role: { select: { name: true } } }, take: 1 } } } } satisfies Prisma.AuditLogInclude;
type Row = Prisma.AuditLogGetPayload<{ include: typeof include }>;
function dto(row: Row) { return { ...row, user: row.user ? { id: row.user.id, name: row.user.name, email: row.user.email, role: row.user.organizations[0]?.role.name ?? "User" } : null }; }

@Injectable()
export class ActivityLogsService {
  constructor(private readonly prisma: PrismaService) {}
  private where(organizationId: string, query: QueryActivityLogDto): Prisma.AuditLogWhereInput { return { organizationId, ...(query.userId ? { userId: query.userId } : {}), ...(query.module ? { module: query.module } : {}), ...(query.action ? { action: query.action } : {}), ...(query.status ? { status: query.status } : {}), ...(query.dateFrom || query.dateTo ? { createdAt: { ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}), ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}) } } : {}), ...(query.search ? { OR: [{ description: { contains: query.search, mode: "insensitive" } }, { module: { contains: query.search, mode: "insensitive" } }, { referenceNo: { contains: query.search, mode: "insensitive" } }, { ipAddress: { contains: query.search, mode: "insensitive" } }, { user: { name: { contains: query.search, mode: "insensitive" } } }] } : {}) }; }
  async list(organizationId: string, query: QueryActivityLogDto) { const page=query.page??1,limit=query.limit??20,where=this.where(organizationId,query); const [rows,total]=await Promise.all([this.prisma.auditLog.findMany({where,include,orderBy:{createdAt:"desc"},skip:(page-1)*limit,take:limit}),this.prisma.auditLog.count({where})]); return {items:rows.map(dto),meta:buildPaginationMeta(total,page,limit)}; }
  async one(organizationId:string,id:string){const row=await this.prisma.auditLog.findFirst({where:{id,organizationId},include});if(!row)throw new NotFoundException("Activity not found");return dto(row);}
  async stats(organizationId:string){const start=new Date();start.setHours(0,0,0,0);const [total,today,userActions,alerts]=await Promise.all([this.prisma.auditLog.count({where:{organizationId}}),this.prisma.auditLog.count({where:{organizationId,createdAt:{gte:start}}}),this.prisma.auditLog.count({where:{organizationId,createdAt:{gte:start},userId:{not:null}}}),this.prisma.auditLog.count({where:{organizationId,status:{in:["WARNING","FAILED"]}}})]);return{total,today,userActions,securityAlerts:alerts};}
  async exportCsv(organizationId:string,query:QueryActivityLogDto){const rows=await this.prisma.auditLog.findMany({where:this.where(organizationId,query),include,orderBy:{createdAt:"desc"}});const esc=(v:string)=>`"${v.replaceAll('"','""')}"`;const lines=[["Date & Time","User","Module","Action","Description","Reference","IP Address","Status"].map(esc).join(","),...rows.map(r=>[r.createdAt.toISOString(),r.user?.name??"Unknown User",r.module,r.action,r.description,r.referenceNo??"",r.ipAddress??"",r.status].map(esc).join(","))];return{filename:`activity-logs-${new Date().toISOString().slice(0,10)}.csv`,content:`\uFEFF${lines.join("\r\n")}`};}
  users(organizationId:string){return this.prisma.organizationUser.findMany({where:{organizationId,user:{isActive:true}},select:{user:{select:{id:true,name:true}}},orderBy:{user:{name:"asc"}}}).then(rows=>rows.map(r=>r.user));}
}
