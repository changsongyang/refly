import { Controller, Logger, Get, Post, Res, UseGuards, Body } from '@nestjs/common';
import { Response } from 'express';
import { User as UserModel } from '@prisma/client';

import { User } from '@/utils/decorators/user.decorator';
import { AuthService } from './auth.service';
import { GithubOauthGuard } from './guard/github-oauth.guard';
import { GoogleOauthGuard } from './guard/google-oauth.guard';
import { OAuthError } from '@refly-packages/errors';
import {
  EmailSignupRequest,
  EmailLoginRequest,
  CreateVerificationRequest,
  CheckVerificationRequest,
  CheckVerificationResponse,
  EmailSignupResponse,
  ResendVerificationRequest,
  AuthConfigResponse,
  EmailLoginResponse,
  CreateVerificationResponse,
  ResendVerificationResponse,
} from '@refly-packages/openapi-schema';
import { buildSuccessResponse } from '@/utils';
import { hours, minutes, seconds, Throttle } from '@nestjs/throttler';

@Controller('v1/auth')
export class AuthController {
  private logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  @Get('config')
  getAuthConfig(): AuthConfigResponse {
    return buildSuccessResponse(this.authService.getAuthConfig());
  }

  @Throttle({ default: { limit: 5, ttl: hours(1) } })
  @Post('email/signup')
  async emailSignup(@Body() { email, password }: EmailSignupRequest): Promise<EmailSignupResponse> {
    const { sessionId } = await this.authService.emailSignup(email, password);
    return buildSuccessResponse({ sessionId });
  }

  @Throttle({ default: { limit: 5, ttl: minutes(10) } })
  @Post('email/login')
  async emailLogin(@Body() { email, password }: EmailLoginRequest): Promise<EmailLoginResponse> {
    const { accessToken } = await this.authService.emailLogin(email, password);
    return buildSuccessResponse({ accessToken });
  }

  @Throttle({ default: { limit: 5, ttl: minutes(10) } })
  @Post('verification/create')
  async createVerification(
    @Body() params: CreateVerificationRequest,
  ): Promise<CreateVerificationResponse> {
    const { sessionId } = await this.authService.createVerification(params);
    return buildSuccessResponse({ sessionId });
  }

  @Throttle({ default: { limit: 1, ttl: seconds(30) } })
  @Post('verification/resend')
  async resendVerification(
    @Body() { sessionId }: ResendVerificationRequest,
  ): Promise<ResendVerificationResponse> {
    await this.authService.addSendVerificationEmailJob(sessionId);
    return buildSuccessResponse();
  }

  @Throttle({ default: { limit: 5, ttl: minutes(10) } })
  @Post('verification/check')
  async checkVerification(
    @Body() params: CheckVerificationRequest,
  ): Promise<CheckVerificationResponse> {
    const { verification, accessToken } = await this.authService.checkVerification(params);
    return buildSuccessResponse({ accessToken, purpose: verification.purpose });
  }

  @UseGuards(GithubOauthGuard)
  @Get('github')
  async github() {
    // auth guard will automatically handle this
  }

  @UseGuards(GoogleOauthGuard)
  @Get('google')
  async google() {
    // auth guard will automatically handle this
  }

  @UseGuards(GithubOauthGuard)
  @Get('callback/github')
  async githubAuthCallback(@User() user: UserModel, @Res() res: Response) {
    try {
      this.logger.log(`github oauth callback success, req.user = ${user?.email}`);

      const { accessToken } = await this.authService.login(user);
      this.authService.redirect(res, accessToken);
    } catch (error) {
      this.logger.error('GitHub OAuth callback failed:', error.stack);
      throw new OAuthError();
    }
  }

  @UseGuards(GoogleOauthGuard)
  @Get('callback/google')
  async googleAuthCallback(@User() user: UserModel, @Res() res: Response) {
    try {
      this.logger.log(`google oauth callback success, req.user = ${user?.email}`);

      const { accessToken } = await this.authService.login(user);
      this.authService.redirect(res, accessToken);
    } catch (error) {
      this.logger.error('Google OAuth callback failed:', error.stack);
      throw new OAuthError();
    }
  }
}
