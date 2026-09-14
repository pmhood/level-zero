import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateAssetCollectionDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class RenameAssetCollectionDto {
  @IsString()
  name!: string;
}

export class AddAssetToCollectionDto {
  @IsString()
  assetId!: string;
}
