import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ThrottlerModule } from "@nestjs/throttler";
import { VendorAdminJwtStrategy } from "./common/vendor-admin-jwt.strategy";
import { VendorAdminAuthController } from "./vendor-admin-auth.controller";
import { VendorAdminAuthService } from "./vendor-admin-auth.service";
import { VendorPackagesController } from "./vendor-packages.controller";
import { VendorPackagesService } from "./vendor-packages.service";
import { VendorCustomersController } from "./vendor-customers.controller";
import { VendorCustomersService } from "./vendor-customers.service";
import { VendorLicensesController } from "./vendor-licenses.controller";
import { VendorLicensesService } from "./vendor-licenses.service";
import { VendorSubscriptionsController } from "./vendor-subscriptions.controller";
import { VendorSubscriptionsService } from "./vendor-subscriptions.service";
import { VendorDevicesController } from "./vendor-devices.controller";
import { VendorDevicesService } from "./vendor-devices.service";
import { VendorDashboardController } from "./vendor-dashboard.controller";
import { VendorDashboardService } from "./vendor-dashboard.service";
import { VendorLicenseClientController } from "./vendor-license-client.controller";
import { VendorLicenseClientService } from "./vendor-license-client.service";

@Module({
  imports: [PassportModule, JwtModule.register({}), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
  controllers: [
    VendorAdminAuthController,
    VendorPackagesController,
    VendorCustomersController,
    VendorLicensesController,
    VendorSubscriptionsController,
    VendorDevicesController,
    VendorDashboardController,
    VendorLicenseClientController,
  ],
  providers: [
    VendorAdminJwtStrategy,
    VendorAdminAuthService,
    VendorPackagesService,
    VendorCustomersService,
    VendorLicensesService,
    VendorSubscriptionsService,
    VendorDevicesService,
    VendorDashboardService,
    VendorLicenseClientService,
  ],
})
export class VendorLicensingModule {}
