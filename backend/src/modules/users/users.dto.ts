import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Gender, Language } from './user.entities';

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 60) firstName?: string;
  @IsOptional() @IsString() @Length(1, 60) lastName?: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsString() @MaxLength(500) bio?: string;
  @IsOptional() @IsString() photoRef?: string;
  @IsOptional() @IsEnum(Language) language?: Language;
  @IsOptional() @IsBoolean() womenOnlyMode?: boolean;
}

export class EmergencyContactDto {
  @IsString() @Length(1, 80) name: string;
  @IsString() phone: string;
}

export class EmergencyContactsDto {
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  @ArrayMaxSize(3)
  contacts: EmergencyContactDto[];
}
