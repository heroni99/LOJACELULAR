import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsHexColor,
  IsOptional,
  IsString,
  MaxLength
} from "class-validator";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class UpdateStoreBrandingDto {
  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsHexColor({ message: "Informe uma cor primaria valida." })
  primaryColor?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsHexColor({ message: "Informe uma cor secundaria valida." })
  secondaryColor?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsHexColor({ message: "Informe uma cor de destaque valida." })
  accentColor?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(255)
  logoUrl?: string | null;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(255)
  bannerUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  heroBannerEnabled?: boolean;
}
