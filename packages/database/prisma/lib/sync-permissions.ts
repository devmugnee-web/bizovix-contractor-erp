import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "@bizovix/types";

export async function syncPermissions(prisma: PrismaClient) {
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, group: key.split(".")[0] ?? "general" },
    });
  }

  const allPermissions = await prisma.permission.findMany();
  const systemRoles = await prisma.role.findMany({ where: { isSystem: true } });

  for (const role of systemRoles) {
    for (const permission of allPermissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  return { permissionCount: allPermissions.length, roleCount: systemRoles.length };
}
