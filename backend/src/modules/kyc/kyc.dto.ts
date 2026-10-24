import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { Gender } from '../users/user.entities';
import { KycDocumentType, KycStatus } from './kyc-document.entity';

export class SubmitDocumentDto {
  @IsEnum(KycDocumentType) type: KycDocumentType;
  @IsString() @Length(1, 500) fileRef: string;

  @ValidateIf((o) => o.type === KycDocumentType.VEHICLE_REGISTRATION)
  @IsUUID()
  vehicleId?: string;
}

export class ApproveDocumentDto {
  @IsOptional() @IsDateString() expiresAt?: string;
  /** Obligatoire pour la pièce d'identité : le genre fait foi pour le mode « Entre femmes ». */
  @IsOptional() @IsEnum(Gender) gender?: Gender;
}

export class RejectDocumentDto {
  @IsString() @Length(3, 300) reason: string;
  /** Vrai : « à corriger » (nouvelle pièce demandée) ; faux : rejet définitif. */
  @IsOptional() @IsBoolean() allowCorrection?: boolean;
}

export class KycQueueQuery {
  @IsOptional() @IsEnum(KycStatus) status?: KycStatus;
}
