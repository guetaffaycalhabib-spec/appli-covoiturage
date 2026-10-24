import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { MessagingService } from './messaging.service';

class SendMessageDto {
  @IsString() @Length(1, 1000) body: string;
}

@ApiTags('Messagerie')
@ApiBearerAuth()
@Controller('bookings/:bookingId/messages')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.messaging.list(user.id, bookingId);
  }

  @Post()
  send(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() dto: SendMessageDto) {
    return this.messaging.send(user.id, bookingId, dto.body);
  }

  @Post('read')
  @HttpCode(204)
  read(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.messaging.markRead(user.id, bookingId);
  }
}
