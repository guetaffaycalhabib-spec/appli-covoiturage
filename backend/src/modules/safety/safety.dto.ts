import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { IncidentCategory, IncidentStatus } from './safety.entities';

export class PositionUpdateDto {
  @IsNumber() @Min(-90) @Max(90) lat: number;
  @IsNumber() @Min(-180) @Max(180) lng: number;
  @IsOptional() @IsNumber() heading?: number;
  @IsOptional() @IsNumber() speedKmh?: number;
  @IsOptional() @IsNumber() accuracyM?: number;
}

export class SosDto {
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
}

export class ReportDto {
  @IsEnum(IncidentCategory) category: IncidentCategory;
  @IsString() @Length(3, 2000) description: string;
  @IsOptional() @IsUUID() targetUserId?: string;
  @IsOptional() @IsUUID() tripId?: string;
  @IsOptional() @IsUUID() bookingId?: string;
}

export class UpdateIncidentDto {
  @IsEnum(IncidentStatus) status: IncidentStatus;
  @IsOptional() @IsString() @Length(1, 2000) resolution?: string;
}
