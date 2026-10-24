import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  phone: string;
}

export class VerifyOtpDto {
  @IsUUID()
  challengeId: string;

  @Matches(/^\d{6}$/)
  code: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  deviceId?: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}
