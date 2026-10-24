import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entities';
import { AuthController } from './auth.controller';
import { OtpChallenge, RefreshToken } from './auth.entities';
import { AuthService } from './auth.service';

@Module({
  imports: [TypeOrmModule.forFeature([OtpChallenge, RefreshToken, User])],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
