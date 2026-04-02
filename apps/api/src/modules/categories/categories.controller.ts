import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AuthenticatedRequest } from "../../common/auth-request";
import { ListEntitiesDto } from "../../common/dto/list-entities.dto";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@Controller("categories")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @RequirePermissions("categories.read")
  @Get()
  async findAll(@Query() filters: ListEntitiesDto) {
    return this.categoriesService.findAll(filters);
  }

  @RequirePermissions("categories.create")
  @Post()
  async create(
    @Body() payload: CreateCategoryDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.categoriesService.create(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("categories.read")
  @Get(":id")
  async findById(@Param("id") id: string) {
    return this.categoriesService.findById(id);
  }

  @RequirePermissions("categories.update")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() payload: UpdateCategoryDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.categoriesService.update(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("categories.update")
  @Delete(":id")
  async remove(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.categoriesService.remove(id, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
