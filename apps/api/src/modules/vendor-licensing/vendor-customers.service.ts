import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { rethrowAsConflictIfUniqueViolation } from "./common/prisma-error.util";
import { CreateVendorCustomerDto } from "./dto/create-customer.dto";
import { UpdateVendorCustomerDto } from "./dto/update-customer.dto";
import { QueryVendorCustomersDto } from "./dto/query-customers.dto";

@Injectable()
export class VendorCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryVendorCustomersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.VendorCustomerWhereInput = query.search
      ? {
          OR: [
            { companyName: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
            { contactName: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.vendorCustomer.findMany({
        where,
        include: { _count: { select: { licenseKeys: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.vendorCustomer.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async get(id: string) {
    const customer = await this.prisma.vendorCustomer.findUnique({
      where: { id },
      include: {
        licenseKeys: {
          include: { package: true, subscription: true, _count: { select: { activations: { where: { status: "ACTIVE" } } } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  async create(dto: CreateVendorCustomerDto) {
    try {
      return await this.prisma.vendorCustomer.create({ data: dto });
    } catch (error) {
      rethrowAsConflictIfUniqueViolation(error, "A customer with this email already exists");
    }
  }

  async update(id: string, dto: UpdateVendorCustomerDto) {
    await this.get(id);
    try {
      return await this.prisma.vendorCustomer.update({ where: { id }, data: dto });
    } catch (error) {
      rethrowAsConflictIfUniqueViolation(error, "A customer with this email already exists");
    }
  }
}
