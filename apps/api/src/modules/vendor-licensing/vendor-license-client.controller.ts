import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { Public } from "../../common/decorators/public.decorator";
import { VendorLicenseClientService } from "./vendor-license-client.service";
import { ActivateLicenseDto } from "./dto/activate.dto";
import { HeartbeatDto } from "./dto/heartbeat.dto";
import { VerifyLicenseDto } from "./dto/verify.dto";
import { DeactivateDeviceDto } from "./dto/deactivate.dto";
import { TrackDownloadDto } from "./dto/track-download.dto";
import { RequestTrialDto } from "./dto/request-trial.dto";

/**
 * Untrusted-client surface: the installed customer software calls these, unauthenticated,
 * secured only by the license key + device id in the request body. The server is always the
 * authority on validity — nothing here trusts a value the client asserts about its own state.
 */
@Public()
@UseGuards(ThrottlerGuard)
@Controller("vendor-license")
export class VendorLicenseClientController {
  constructor(private readonly service: VendorLicenseClientService) {}

  @Post("activate")
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  activate(@Body() dto: ActivateLicenseDto, @Req() req: Request) {
    return this.service.activate(dto, req.ip);
  }

  @Post("verify")
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyLicenseDto) {
    return this.service.verify(dto);
  }

  @Post("heartbeat")
  @HttpCode(HttpStatus.OK)
  heartbeat(@Body() dto: HeartbeatDto) {
    return this.service.heartbeat(dto);
  }

  @Post("deactivate")
  @HttpCode(HttpStatus.OK)
  deactivate(@Body() dto: DeactivateDeviceDto) {
    return this.service.deactivate(dto);
  }

  @Post("downloads")
  trackDownload(@Body() dto: TrackDownloadDto, @Req() req: Request) {
    return this.service.trackDownload(dto, req.ip);
  }

  @Post("trial")
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  requestTrial(@Body() dto: RequestTrialDto) {
    return this.service.requestTrial(dto);
  }
}
