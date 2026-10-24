import { Body, Controller, Get, Headers, HttpStatus, Ip, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsDefined, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser, StaffRole } from '../../common/auth/auth.types';
import { CurrentUser, StaffOnly } from '../../common/auth/decorators';
import { PageQuery } from '../../common/db/pagination';
import { DomainError } from '../../common/errors';
import { normalizeAlgerianMobile } from '../../common/utils/phone';
import { AuditService } from '../audit/audit.service';
import { ApproveDocumentDto, KycQueueQuery, RejectDocumentDto } from '../kyc/kyc.dto';
import { KycService } from '../kyc/kyc.service';
import { LedgerService } from '../ledger/ledger.service';
import { ReviewsService } from '../reviews/reviews.service';
import { UpdateIncidentDto } from '../safety/safety.dto';
import { IncidentStatus } from '../safety/safety.entities';
import { SafetyService } from '../safety/safety.service';
import { SettingsService } from '../settings/settings.service';
import { TripsService } from '../trips/trips.service';
import { User, UserStatus } from '../users/user.entities';
import { UsersService } from '../users/users.service';

class ReasonDto {
  @IsString() @Length(3, 500) reason: string;
}

class SettingValueDto {
  @IsDefined() value: unknown;
}

class PricingDto {
  @IsOptional() @IsInt() @Min(1) @Max(58) fromWilaya?: number;
  @IsOptional() @IsInt() @Min(1) @Max(58) toWilaya?: number;
  @IsNumber() @Min(0) costPerKm: number;
  @IsInt() @Min(0) tollAmount: number;
  @IsInt() @Min(1) roundingStep: number;
  @IsOptional() @IsDateString() effectiveFrom?: string;
}

class TopUpDto {
  @IsInt() @Min(1) @Max(1_000_000) amount: number;
}

class AuditQuery extends PageQuery {
  @IsOptional() @IsString() objectType?: string;
  @IsOptional() @IsString() objectId?: string;
  @IsOptional() @IsString() action?: string;
}

class UserLookupQuery {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsUUID() id?: string;
}

/**
 * Panneau d'administration (cahier des charges 10) : API séparée sous /admin, réservée au personnel.
 * Toutes les actions sensibles sont journalisées avec l'auteur et l'adresse réseau.
 */
@ApiTags('Administration')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly kyc: KycService,
    private readonly users: UsersService,
    private readonly settings: SettingsService,
    private readonly ledger: LedgerService,
    private readonly safety: SafetyService,
    private readonly reviews: ReviewsService,
    private readonly trips: TripsService,
    private readonly audit: AuditService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // --- KYC ---

  @StaffOnly(StaffRole.KYC_VERIFIER)
  @Get('kyc/queue')
  kycQueue(@Query() query: KycQueueQuery) {
    return this.kyc.queue(query.status);
  }

  @StaffOnly(StaffRole.KYC_VERIFIER)
  @Post('kyc/documents/:id/approve')
  approve(@CurrentUser() staff: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveDocumentDto, @Ip() ip: string) {
    return this.kyc.approve(id, dto, staff.id, ip);
  }

  @StaffOnly(StaffRole.KYC_VERIFIER)
  @Post('kyc/documents/:id/reject')
  reject(@CurrentUser() staff: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDocumentDto, @Ip() ip: string) {
    return this.kyc.reject(id, dto, staff.id, ip);
  }

  // --- Utilisateurs ---

  /** Données personnelles masquées par défaut (10.1) : le téléphone n'est affiché qu'en partie. */
  @StaffOnly(StaffRole.SUPPORT)
  @Get('users')
  async findUser(@Query() query: UserLookupQuery) {
    const phone = query.phone ? normalizeAlgerianMobile(query.phone) : null;
    if (!phone && !query.id) throw new DomainError('LOOKUP_REQUIRED', 'Indiquez un numéro ou un identifiant', HttpStatus.BAD_REQUEST);
    const user = await this.userRepo.findOneBy(phone ? { phone } : { id: query.id });
    if (!user) return null;
    return { ...user, phone: `${user.phone.slice(0, 6)}••••${user.phone.slice(-2)}` };
  }

  @StaffOnly(StaffRole.SUPPORT)
  @Post('users/:id/suspend')
  suspend(@CurrentUser() staff: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Ip() ip: string) {
    return this.users.setStatus(id, UserStatus.SUSPENDED, staff.id, dto.reason, ip);
  }

  @StaffOnly(StaffRole.SUPPORT)
  @Post('users/:id/reactivate')
  reactivate(@CurrentUser() staff: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Ip() ip: string) {
    return this.users.setStatus(id, UserStatus.ACTIVE, staff.id, dto.reason, ip);
  }

  // --- Paramètres et tarification ---

  @StaffOnly(StaffRole.ADMIN)
  @Get('settings')
  getSettings() {
    return this.settings.getAll();
  }

  @StaffOnly(StaffRole.ADMIN)
  @Put('settings/:key')
  setSetting(@CurrentUser() staff: AuthUser, @Param('key') key: string, @Body() dto: SettingValueDto, @Ip() ip: string) {
    return this.settings.set(key, dto.value, staff.id, ip);
  }

  @StaffOnly(StaffRole.ADMIN, StaffRole.FINANCE)
  @Get('pricing')
  pricing() {
    return this.settings.listPricing();
  }

  @StaffOnly(StaffRole.ADMIN)
  @Post('pricing')
  createPricing(@CurrentUser() staff: AuthUser, @Body() dto: PricingDto, @Ip() ip: string) {
    return this.settings.createPricing(
      {
        fromWilaya: dto.fromWilaya ?? null,
        toWilaya: dto.toWilaya ?? null,
        costPerKm: dto.costPerKm,
        tollAmount: dto.tollAmount,
        roundingStep: dto.roundingStep,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      },
      staff.id,
      ip,
    );
  }

  // --- Finance ---

  @StaffOnly(StaffRole.FINANCE)
  @Post('wallets/:userId/top-ups')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  topUp(
    @CurrentUser() staff: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: TopUpDto,
    @Headers('idempotency-key') key: string | undefined,
    @Ip() ip: string,
  ) {
    if (!key) throw new DomainError('IDEMPOTENCY_KEY_REQUIRED', "En-tête Idempotency-Key obligatoire", HttpStatus.BAD_REQUEST);
    return this.users.get(userId).then(() => this.ledger.topUp(userId, dto.amount, key, staff.id, ip));
  }

  @StaffOnly(StaffRole.FINANCE)
  @Get('ledger/reconciliation')
  reconciliation() {
    return this.ledger.reconciliation();
  }

  // --- Sécurité et modération ---

  @StaffOnly(StaffRole.SUPPORT)
  @Get('incidents')
  incidents(@Query('status') status?: IncidentStatus) {
    return this.safety.list(status);
  }

  @StaffOnly(StaffRole.SUPPORT)
  @Patch('incidents/:id')
  updateIncident(@CurrentUser() staff: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateIncidentDto, @Ip() ip: string) {
    return this.safety.update(id, dto, staff.id, ip);
  }

  @StaffOnly(StaffRole.KYC_VERIFIER)
  @Post('reviews/:id/hide')
  hideReview(@CurrentUser() staff: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Ip() ip: string) {
    return this.reviews.setHidden(id, true, staff.id, dto.reason, ip);
  }

  @StaffOnly(StaffRole.KYC_VERIFIER)
  @Post('reviews/:id/restore')
  restoreReview(@CurrentUser() staff: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Ip() ip: string) {
    return this.reviews.setHidden(id, false, staff.id, dto.reason, ip);
  }

  // --- Pilotage ---

  @StaffOnly(StaffRole.ADMIN, StaffRole.MARKETING)
  @Get('demand-map')
  demandMap(@Query('date') date?: string) {
    return this.trips.demandMap(date);
  }

  @StaffOnly(StaffRole.ADMIN)
  @Get('audit')
  auditLog(@Query() query: AuditQuery) {
    return this.audit.list(query);
  }
}
