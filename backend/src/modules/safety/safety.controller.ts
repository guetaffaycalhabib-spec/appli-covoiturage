import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { PositionUpdateDto, ReportDto, SosDto } from './safety.dto';
import { SafetyService } from './safety.service';
import { TrackingService } from './tracking.service';

@ApiTags('Suivi et sécurité')
@ApiBearerAuth()
@Controller()
export class SafetyController {
  constructor(
    private readonly tracking: TrackingService,
    private readonly safety: SafetyService,
  ) {}

  @Post('trips/:id/positions')
  @HttpCode(204)
  position(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PositionUpdateDto) {
    return this.tracking.record(user.id, id, dto);
  }

  @Get('trips/:id/position')
  latest(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tracking.latestFor(user.id, id);
  }

  @Post('trips/:id/share-links')
  share(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tracking.createShare(user.id, id);
  }

  @Delete('share-links/:shareId')
  @HttpCode(204)
  revoke(@CurrentUser() user: AuthUser, @Param('shareId', ParseUUIDPipe) shareId: string) {
    return this.tracking.revokeShare(user.id, shareId);
  }

  @Public()
  @Get('public/tracking/:token')
  publicTracking(@Param('token') token: string) {
    return this.tracking.publicView(token);
  }

  @Post('trips/:id/sos')
  sos(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SosDto) {
    return this.safety.sos(user.id, id, dto);
  }

  @Post('reports')
  report(@CurrentUser() user: AuthUser, @Body() dto: ReportDto) {
    return this.safety.report(user.id, dto);
  }
}
