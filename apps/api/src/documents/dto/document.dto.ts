import {
  DOCUMENT_VERSION_REASONS,
  type DocumentContent,
  type DocumentVersionReason,
} from '@level-zero/domain';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { toBoolean } from '../../common/query';

export class CreateDocumentDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /** Structured body. Deliberately unconstrained past the outer node; see `DocumentContent`. */
  @IsOptional()
  @IsObject()
  content?: DocumentContent;
}

export class SaveDocumentContentDto {
  @IsObject()
  content!: DocumentContent;
}

export class SnapshotDocumentDto {
  @IsOptional()
  @IsString()
  name?: string | null;

  @IsOptional()
  @IsIn(DOCUMENT_VERSION_REASONS)
  reason?: DocumentVersionReason;

  /** Free text until authentication lands; then it comes from the session. */
  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class RestoreDocumentVersionDto {
  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class ListDocumentsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ListDocumentVersionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class CompareDocumentVersionsQueryDto {
  @IsString()
  from!: string;

  @IsString()
  to!: string;
}
