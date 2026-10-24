import { Body, Controller, Delete, Get, Headers, HttpCode, Ip, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { BookingsService } from './bookings.service';
import { ExecutionService } from './execution.service';
import {
  CancelDto,
  CreateAlertDto,
  CreateBookingDto,
  OptionalReasonDto,
  PickupCodeDto,
  PositionDto,
  PublishTripDto,
  QuoteTripDto,
  SearchTripsQuery,
  UpdateTripDto,
} from './trips.dto';
import { TripsService } from './trips.service';

@ApiTags('Trajets')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly bookings: BookingsService,
    private readonly execution: ExecutionService,
  ) {}

  @Post('quote')
  quote(@Body() dto: QuoteTripDto) {
    return this.trips.quote(dto);
  }

  @Post()
  publish(@CurrentUser() user: AuthUser, @Body() dto: PublishTripDto) {
    return this.trips.publish(user.id, dto);
  }

  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query() query: SearchTripsQuery) {
    return this.trips.search(user.id, query);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.trips.listMine(user.id);
  }

  @Get('demand-map')
  demandMap(@Query('date') date?: string) {
    return this.trips.demandMap(date);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.detail(id, user.id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTripDto) {
    return this.trips.update(user.id, id, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDto) {
    return this.trips.cancel(user.id, id, dto.reason);
  }

  @Post(':id/start')
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.execution.start(user.id, id);
  }

  @Post(':id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.execution.complete(user.id, id);
  }

  @Get(':id/bookings')
  tripBookings(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.listForTrip(user.id, id);
  }

  @Post(':id/bookings')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  book(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.bookings.create(user.id, id, dto, idempotencyKey);
  }
}

@ApiTags('Réservations')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.bookings.listForPassenger(user.id);
  }

  @Get(':id')
  view(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.view(user.id, id);
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.accept(user.id, id);
  }

  @Post(':id/refuse')
  refuse(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OptionalReasonDto) {
    return this.bookings.refuse(user.id, id, dto.reason);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDto) {
    return this.bookings.cancelByPassenger(user.id, id, dto.reason);
  }

  @Post(':id/remove')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDto) {
    return this.bookings.removeByDriver(user.id, id, dto.reason);
  }

  @Post(':id/board')
  board(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PickupCodeDto, @Ip() ip: string) {
    return this.bookings.board(user.id, id, dto.code, ip);
  }

  @Post(':id/no-show')
  noShow(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PositionDto) {
    return this.bookings.reportNoShow(user.id, id, dto);
  }

  @Post(':id/dropoff')
  dropoff(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.completeBooking(user.id, id);
  }
}

@ApiTags('Alertes de trajet')
@ApiBearerAuth()
@Controller('trip-alerts')
export class TripAlertsController {
  constructor(private readonly trips: TripsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAlertDto) {
    return this.trips.createAlert(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.trips.listAlerts(user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.deleteAlert(user.id, id);
  }
}
