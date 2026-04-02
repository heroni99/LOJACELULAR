import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthenticatedRequest } from "../../common/auth-request";
import { Public } from "./decorators/public.decorator";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshSessionDto } from "./dto/refresh-session.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  async login(@Body() body: LoginDto, @Req() req: Request) {
    return this.authService.login(body, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
  }

  @Public()
  @Post("refresh")
  async refresh(@Body() body: RefreshSessionDto, @Req() req: Request) {
    return this.authService.refresh(body, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  async logout(
    @Body() body: RefreshSessionDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.authService.logout(body, {
      userId: req.authUser?.sub ?? null,
      storeId: req.authUser?.storeId ?? null,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() req: AuthenticatedRequest) {
    return this.authService.me(req.authUser?.sub ?? "");
  }
}
