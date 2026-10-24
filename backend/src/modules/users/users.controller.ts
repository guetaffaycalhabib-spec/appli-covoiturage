import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { EmergencyContactsDto, UpdateProfileDto } from './users.dto';
import { publicProfile, UsersService } from './users.service';
import { User } from './user.entities';

/** Profil privé : seul l'intéressé voit son propre numéro. */
function privateProfile(user: User) {
  return { ...user, verified: user.trustLevel >= 1 };
}

@ApiTags('Profil')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return privateProfile(await this.users.get(user.id));
  }

  @Patch('me')
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return privateProfile(await this.users.updateProfile(user.id, dto));
  }

  @Delete('me')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser) {
    return this.users.deleteAccount(user.id);
  }

  @Get('me/emergency-contacts')
  contacts(@CurrentUser() user: AuthUser) {
    return this.users.listContacts(user.id);
  }

  @Put('me/emergency-contacts')
  replaceContacts(@CurrentUser() user: AuthUser, @Body() dto: EmergencyContactsDto) {
    return this.users.replaceContacts(user.id, dto.contacts);
  }

  @Post('me/driver-charter')
  async acceptCharter(@CurrentUser() user: AuthUser) {
    return privateProfile(await this.users.acceptDriverCharter(user.id));
  }

  @Post('me/blocks/:userId')
  @HttpCode(204)
  block(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) target: string) {
    return this.users.block(user.id, target);
  }

  @Delete('me/blocks/:userId')
  @HttpCode(204)
  unblock(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) target: string) {
    return this.users.unblock(user.id, target);
  }

  @Get('users/:id')
  async profile(@Param('id', ParseUUIDPipe) id: string) {
    return publicProfile(await this.users.get(id));
  }
}
