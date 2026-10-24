import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AcceptanceMode, PaymentMethod } from './trip.entities';

export class PlaceDto {
  @IsString() @Length(1, 200) label: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(58) wilaya?: number;
}

/** Lieu de départ ou d'arrivée d'un trajet : la wilaya est obligatoire (paramètres de prix par axe). */
export class WilayaPlaceDto {
  @IsString() @Length(1, 200) label: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(58) wilaya: number;
}

const toBool = () => Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'));

export class TripRulesDto {
  @IsOptional() @IsBoolean() smoking?: boolean;
  @IsOptional() @IsBoolean() pets?: boolean;
  @IsOptional() @IsIn(['small', 'medium', 'large']) luggage?: 'small' | 'medium' | 'large';
  @IsOptional() @IsBoolean() music?: boolean;
}

export class QuoteTripDto {
  @ValidateNested() @Type(() => WilayaPlaceDto) origin: WilayaPlaceDto;
  @ValidateNested() @Type(() => WilayaPlaceDto) destination: WilayaPlaceDto;
  @IsOptional() @ValidateNested({ each: true }) @Type(() => PlaceDto) @ArrayMaxSize(5) stops?: PlaceDto[];
  @IsInt() @Min(1) @Max(8) seats: number;
}

export class PublishTripDto extends QuoteTripDto {
  @IsString() vehicleId: string;
  @IsDateString() departureAt: string;
  @IsInt() @Min(1) pricePerSeat: number;
  @IsOptional() @IsEnum(AcceptanceMode) acceptanceMode?: AcceptanceMode;
  @IsOptional() @IsBoolean() womenOnly?: boolean;
  @IsOptional() @ValidateNested() @Type(() => TripRulesDto) rules?: TripRulesDto;
  @IsOptional() @IsString() @MaxLength(300) meetingPointDescription?: string;
  @IsOptional() @IsInt() @Min(0) @Max(60) waitingToleranceMinutes?: number;
}

export class UpdateTripDto {
  @IsOptional() @IsInt() @Min(1) pricePerSeat?: number;
  @IsOptional() @IsInt() @Min(1) @Max(8) seats?: number;
  @IsOptional() @IsDateString() departureAt?: string;
  @IsOptional() @IsEnum(AcceptanceMode) acceptanceMode?: AcceptanceMode;
  @IsOptional() @ValidateNested() @Type(() => TripRulesDto) rules?: TripRulesDto;
  @IsOptional() @IsString() @MaxLength(300) meetingPointDescription?: string;
}

export class SearchTripsQuery {
  @Type(() => Number) @IsNumber() fromLat: number;
  @Type(() => Number) @IsNumber() fromLng: number;
  @Type(() => Number) @IsNumber() toLat: number;
  @Type(() => Number) @IsNumber() toLng: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(58) fromWilaya?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(58) toWilaya?: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(8) seats?: number;
  @IsOptional() @IsIn(['departure', 'price', 'rating']) sort?: 'departure' | 'price' | 'rating';
  @IsOptional() @Type(() => Number) @IsInt() maxPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() minRating?: number;
  @IsOptional() @toBool() @IsBoolean() womenOnly?: boolean;
  @IsOptional() @toBool() @IsBoolean() instantOnly?: boolean;
  @IsOptional() @toBool() @IsBoolean() smoking?: boolean;
  @IsOptional() @toBool() @IsBoolean() pets?: boolean;
}

export class CancelDto {
  @IsString() @Length(2, 300) reason: string;
}

export class OptionalReasonDto {
  @IsOptional() @IsString() @Length(2, 300) reason?: string;
}

export class CreateBookingDto {
  @IsInt() @Min(1) @Max(8) seats: number;
  @IsOptional() @ValidateNested() @Type(() => PlaceDto) pickup?: PlaceDto;
  @IsOptional() @ValidateNested() @Type(() => PlaceDto) dropoff?: PlaceDto;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
}

export class PickupCodeDto {
  @Matches(/^\d{4}$/) code: string;
}

export class PositionDto {
  @IsNumber() @Min(-90) @Max(90) lat: number;
  @IsNumber() @Min(-180) @Max(180) lng: number;
}

export class CreateAlertDto {
  @ValidateNested() @Type(() => PlaceDto) origin: PlaceDto;
  @ValidateNested() @Type(() => PlaceDto) destination: PlaceDto;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @IsOptional() @IsInt() @Min(1) @Max(8) seats?: number;
}
