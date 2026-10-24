import { PartialType } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateVehicleDto {
  @IsString() @Length(1, 40) make: string;
  @IsString() @Length(1, 40) model: string;
  @IsInt() @Min(1980) @Max(2100) year: number;
  @IsString() @Length(1, 30) color: string;
  @IsString() @Length(4, 20) plate: string;
  @IsInt() @Min(2) @Max(9) seats: number;
  @IsOptional() @IsIn(['standard', 'confort']) comfort?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) equipment?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) photoRefs?: string[];
}

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}
