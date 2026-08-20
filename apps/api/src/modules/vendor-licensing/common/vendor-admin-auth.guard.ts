import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class VendorAdminAuthGuard extends AuthGuard("vendor-admin-jwt") {}
