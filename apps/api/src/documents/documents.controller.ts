import {
  DocumentService,
  type Document,
  type DocumentHistory,
  type DocumentVersion,
  type DocumentVersionComparison,
  type DocumentVersionSnapshot,
  type EntityPage,
} from '@level-zero/domain';
import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';

import {
  CompareDocumentVersionsQueryDto,
  CreateDocumentDto,
  ListDocumentVersionsQueryDto,
  ListDocumentsQueryDto,
  RestoreDocumentVersionDto,
  SaveDocumentContentDto,
  SnapshotDocumentDto,
} from './dto/document.dto';

/**
 * Rich-text documents and their history.
 *
 * A document is an ordinary `document` entity, so it is archived, tagged and
 * related through the entities endpoints. What lives here is what an editor
 * needs: the structured body, autosave, and the versions a user chose to keep.
 *
 * Autosave (`PUT :documentId/content`) never writes a version; snapshots
 * (`POST :documentId/versions`) always do, and restoring appends rather than
 * rewinding, so later work is never lost.
 */
@Controller('projects/:projectId/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentService) {}

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() body: CreateDocumentDto,
  ): Promise<Document> {
    return this.documents.create(projectId, body);
  }

  @Get()
  list(
    @Param('projectId') projectId: string,
    @Query() query: ListDocumentsQueryDto,
  ): Promise<EntityPage> {
    return this.documents.list(projectId, query);
  }

  @Get(':documentId')
  get(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ): Promise<Document> {
    return this.documents.getById(projectId, documentId);
  }

  /** Autosave. Replaces the body; deliberately writes no version. */
  @Put(':documentId/content')
  saveContent(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Body() body: SaveDocumentContentDto,
  ): Promise<Document> {
    return this.documents.saveContent(projectId, documentId, body.content);
  }

  /** Records the current body as a version a user can come back to. */
  @Post(':documentId/versions')
  snapshot(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Body() body: SnapshotDocumentDto,
  ): Promise<DocumentVersion> {
    return this.documents.snapshot(projectId, documentId, body);
  }

  /** Version metadata for a history list — no bodies, so the list stays small. */
  @Get(':documentId/versions')
  listVersions(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Query() query: ListDocumentVersionsQueryDto,
  ): Promise<DocumentHistory> {
    return this.documents.listVersions(projectId, documentId, query);
  }

  /**
   * Two versions side by side.
   *
   * Declared before `:versionId` so the literal path wins: Nest matches routes
   * in declaration order and `compare` would otherwise read as a version id.
   */
  @Get(':documentId/versions/compare')
  compare(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Query() query: CompareDocumentVersionsQueryDto,
  ): Promise<DocumentVersionComparison> {
    return this.documents.compareVersions(projectId, documentId, query.from, query.to);
  }

  @Get(':documentId/versions/:versionId')
  getVersion(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
  ): Promise<DocumentVersionSnapshot> {
    return this.documents.getVersion(projectId, documentId, versionId);
  }

  /** Brings this version's body back as a new version. Later history is kept. */
  @Post(':documentId/versions/:versionId/restore')
  restore(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Body() body: RestoreDocumentVersionDto,
  ): Promise<DocumentVersion> {
    return this.documents.restoreVersion(projectId, documentId, versionId, body);
  }
}
