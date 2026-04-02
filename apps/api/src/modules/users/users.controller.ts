import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AuthenticatedRequest } from "../../common/auth-request";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ChangeUserPasswordDto } from "./dto/change-user-password.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { ListUsersDto } from "./dto/list-users.dto";
import { UpdateUserActiveDto } from "./dto/update-user-active.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermissions("users.read")
  @Get()
  async findAll(@Query() filters: ListUsersDto) {
    return this.usersService.findAll(filters);
  }

  @RequirePermissions("users.create")
  @Post()
  async create(
    @Body() payload: CreateUserDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.usersService.create(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      roleName: request.authUser?.roleName ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("users.read")
  @Get(":id")
  async findById(@Param("id") id: string) {
    return this.usersService.findById(id);
  }

  @RequirePermissions("users.update")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() payload: UpdateUserDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.usersService.update(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      roleName: request.authUser?.roleName ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("users.change_password")
  @Patch(":id/password")
  async changePassword(
    @Param("id") id: string,
    @Body() payload: ChangeUserPasswordDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.usersService.changePassword(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      roleName: request.authUser?.roleName ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("users.activate")
  @Patch(":id/active")
  async updateActive(
    @Param("id") id: string,
    @Body() payload: UpdateUserActiveDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.usersService.updateActive(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      roleName: request.authUser?.roleName ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
