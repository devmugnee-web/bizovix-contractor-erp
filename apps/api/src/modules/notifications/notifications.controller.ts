import { Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { QueryNotificationDto } from "./dto/notification.dto";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@RequirePermissions("notifications.read")
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@Query() query: QueryNotificationDto, @CurrentUser() user: AuthUser) {
    return this.service.list(user.organizationId, user.id, query);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.service.unreadCount(user.organizationId, user.id).then((count) => ({ count }));
  }

  @Patch(":id/read")
  markRead(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.markRead(user.organizationId, user.id, id);
  }

  @Post("read-all")
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.organizationId, user.id);
  }
}
