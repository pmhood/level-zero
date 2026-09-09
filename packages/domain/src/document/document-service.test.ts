import { beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../activity/activity-service';
import { EntityService } from '../entity/entity-service';
import { createProject, type Project } from '../project/project';
import { fixedClock } from '../shared/clock';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryActivityRepository,
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryProjectRepository,
} from '../testing';
import { EntityVersionService } from '../version/entity-version-service';
import { type DocumentContent } from './document';
import { DocumentService, type Document } from './document-service';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let entities: EntityService;
let versions: EntityVersionService;
let documents: DocumentService;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projectRepo = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const versionRepo = new InMemoryEntityVersionRepository();

  const activity = new ActivityService(new InMemoryActivityRepository(), deps);
  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  versions = new EntityVersionService(versionRepo, entityRepo, activity, deps);
  documents = new DocumentService(entities, versions);

  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  otherProject = await projectRepo.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
});

/** A body of prose, so successive saves are distinguishable. */
function prose(text: string): DocumentContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

/** A body carrying an entity mention — the node a GDD links designs with. */
function withMention(entityId: string): DocumentContent {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Core loop' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'The diver breathes through ' },
          {
            type: 'entityMention',
            attrs: { entityId, entityType: 'mechanic', label: 'Oxygen Management' },
          },
        ],
      },
    ],
  };
}

async function gdd(): Promise<Document> {
  return documents.create(project.id, { name: 'Game Design Document' });
}

describe('creating and loading documents', () => {
  it('creates a document entity with an empty body', async () => {
    const created = await gdd();

    expect(created.entity).toMatchObject({
      type: 'document',
      name: 'Game Design Document',
      projectId: project.id,
    });
    expect(created.content).toEqual({ type: 'doc', content: [] });
    expect(created.currentVersion).toBeNull();
    expect(created.hasUnversionedChanges).toBe(false);
  });

  it('creates a document with a starting body', async () => {
    const created = await documents.create(project.id, {
      name: 'Playtest write-up',
      tags: ['playtest'],
      content: prose('Six players, forty minutes.'),
    });

    expect(created.content).toEqual(prose('Six players, forty minutes.'));
    expect(created.entity.tags).toEqual(['playtest']);
  });

  it('rejects a body that is not a structured document', async () => {
    await expect(
      documents.create(project.id, {
        name: 'Broken',
        content: '<h1>rendered html</h1>' as unknown as DocumentContent,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('survives a reload with the structured body intact', async () => {
    const created = await gdd();
    await documents.saveContent(project.id, created.entity.id, withMention('mechanic-1'));

    const reloaded = await documents.getById(project.id, created.entity.id);

    expect(reloaded.content).toEqual(withMention('mechanic-1'));
  });

  it('lists the project documents without touching other types', async () => {
    await gdd();
    await entities.create(project.id, { type: 'character', name: 'Kael' });

    const page = await documents.list(project.id);

    expect(page.total).toBe(1);
    expect(page.items[0]?.name).toBe('Game Design Document');
  });

  it('reports a document from another project as missing', async () => {
    const created = await gdd();

    await expect(documents.getById(otherProject.id, created.entity.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('refuses to read an entity that is not a document', async () => {
    const kael = await entities.create(project.id, { type: 'character', name: 'Kael' });

    await expect(documents.getById(project.id, kael.id)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('autosaving', () => {
  it('replaces the body without writing a version', async () => {
    const created = await gdd();

    for (const text of ['A', 'A d', 'A diver']) {
      await documents.saveContent(project.id, created.entity.id, prose(text));
    }

    const history = await documents.listVersions(project.id, created.entity.id);
    expect(history.total).toBe(0);
    await expect(documents.getById(project.id, created.entity.id)).resolves.toMatchObject({
      content: prose('A diver'),
    });
  });

  it('keeps the other type-specific fields on the document', async () => {
    const created = await documents.create(project.id, { name: 'Brief' });
    await entities.update(project.id, created.entity.id, {
      data: { ...created.entity.data, sectionStatus: 'review' },
    });

    await documents.saveContent(project.id, created.entity.id, prose('Rewritten.'));

    const reloaded = await documents.getById(project.id, created.entity.id);
    expect(reloaded.entity.data).toMatchObject({ sectionStatus: 'review' });
    expect(reloaded.content).toEqual(prose('Rewritten.'));
  });

  it('reports work done since the last snapshot', async () => {
    const created = await gdd();
    await documents.snapshot(project.id, created.entity.id, { name: 'First pass' });

    await expect(documents.getById(project.id, created.entity.id)).resolves.toMatchObject({
      hasUnversionedChanges: false,
    });

    await documents.saveContent(project.id, created.entity.id, prose('More.'));

    await expect(documents.getById(project.id, created.entity.id)).resolves.toMatchObject({
      hasUnversionedChanges: true,
      currentVersion: { name: 'First pass', versionNumber: 1 },
    });
  });

  it('rejects a body that is not a structured document', async () => {
    const created = await gdd();

    await expect(
      documents.saveContent(project.id, created.entity.id, { type: 'paragraph' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('snapshots', () => {
  it('records the current body under a name', async () => {
    const created = await gdd();
    await documents.saveContent(project.id, created.entity.id, prose('Pillars settled.'));

    const version = await documents.snapshot(project.id, created.entity.id, {
      name: 'Pillars locked',
      reason: 'milestone',
      createdBy: 'ana',
    });

    expect(version).toMatchObject({
      documentId: created.entity.id,
      versionNumber: 1,
      name: 'Pillars locked',
      reason: 'milestone',
      createdBy: 'ana',
      isCurrent: true,
    });
  });

  it('defaults to an unnamed manual snapshot', async () => {
    const created = await gdd();

    await expect(documents.snapshot(project.id, created.entity.id)).resolves.toMatchObject({
      name: null,
      reason: 'manual',
    });
  });

  it('refuses a reason that is not a document event', async () => {
    const created = await gdd();

    await expect(
      documents.snapshot(project.id, created.entity.id, {
        reason: 'branch' as never,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('lists versions newest first, with the current one flagged', async () => {
    const created = await gdd();
    await documents.snapshot(project.id, created.entity.id, { name: 'First pass' });
    await documents.saveContent(project.id, created.entity.id, prose('Second draft.'));
    const second = await documents.snapshot(project.id, created.entity.id, { name: 'Review copy' });

    const history = await documents.listVersions(project.id, created.entity.id);

    expect(history).toMatchObject({ documentId: created.entity.id, currentVersionId: second.id });
    expect(history.versions.map((version) => version.name)).toEqual(['Review copy', 'First pass']);
    expect(history.versions.map((version) => version.isCurrent)).toEqual([true, false]);
  });

  it('will not snapshot an archived document', async () => {
    const created = await gdd();
    await entities.archive(project.id, created.entity.id);

    await expect(documents.snapshot(project.id, created.entity.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe('restoring', () => {
  it('brings a version body back as a new version, keeping later history', async () => {
    const created = await gdd();
    await documents.saveContent(project.id, created.entity.id, withMention('mechanic-1'));
    const first = await documents.snapshot(project.id, created.entity.id, { name: 'With oxygen' });

    await documents.saveContent(project.id, created.entity.id, prose('Oxygen cut.'));
    const second = await documents.snapshot(project.id, created.entity.id, { name: 'Without' });

    const restored = await documents.restoreVersion(project.id, created.entity.id, first.id);

    expect(restored).toMatchObject({
      versionNumber: 3,
      parentVersionId: second.id,
      reason: 'restore',
      isCurrent: true,
    });

    const history = await documents.listVersions(project.id, created.entity.id);
    expect(history.total).toBe(3);
    expect(history.versions.map((version) => version.versionNumber)).toEqual([3, 2, 1]);
  });

  it('restores entity-reference nodes exactly as they were written', async () => {
    const created = await gdd();
    await documents.saveContent(project.id, created.entity.id, withMention('mechanic-1'));
    const first = await documents.snapshot(project.id, created.entity.id, { name: 'With oxygen' });

    await documents.saveContent(project.id, created.entity.id, prose('Mentions removed.'));
    await documents.snapshot(project.id, created.entity.id);
    await documents.restoreVersion(project.id, created.entity.id, first.id);

    const reloaded = await documents.getById(project.id, created.entity.id);
    expect(reloaded.content).toEqual(withMention('mechanic-1'));
    expect(reloaded.hasUnversionedChanges).toBe(false);
  });

  it('refuses a version belonging to another document', async () => {
    const created = await gdd();
    const other = await documents.create(project.id, { name: 'Brief' });
    const version = await documents.snapshot(project.id, other.entity.id);

    await expect(
      documents.restoreVersion(project.id, created.entity.id, version.id),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('comparing versions', () => {
  it('hands back both bodies and what else changed', async () => {
    const created = await gdd();
    await documents.saveContent(project.id, created.entity.id, withMention('mechanic-1'));
    const first = await documents.snapshot(project.id, created.entity.id, { name: 'With oxygen' });

    await entities.update(project.id, created.entity.id, { name: 'Design document' });
    await documents.saveContent(project.id, created.entity.id, prose('Oxygen cut.'));
    const second = await documents.snapshot(project.id, created.entity.id, { name: 'Without' });

    const comparison = await documents.compareVersions(
      project.id,
      created.entity.id,
      first.id,
      second.id,
    );

    expect(comparison.from).toMatchObject({
      name: 'With oxygen',
      title: 'Game Design Document',
      content: withMention('mechanic-1'),
    });
    expect(comparison.to).toMatchObject({ name: 'Without', title: 'Design document' });
    expect(comparison.contentChanged).toBe(true);
    expect(comparison.changes).toEqual([
      { field: 'name', from: 'Game Design Document', to: 'Design document' },
    ]);
  });

  it('reports an unchanged body between two snapshots of the same text', async () => {
    const created = await gdd();
    await documents.saveContent(project.id, created.entity.id, prose('Settled.'));
    const first = await documents.snapshot(project.id, created.entity.id);
    const second = await documents.snapshot(project.id, created.entity.id);

    const comparison = await documents.compareVersions(
      project.id,
      created.entity.id,
      first.id,
      second.id,
    );

    expect(comparison.contentChanged).toBe(false);
    expect(comparison.changes).toEqual([]);
  });

  it('reads one version with the body it holds', async () => {
    const created = await gdd();
    await documents.saveContent(project.id, created.entity.id, withMention('mechanic-1'));
    const version = await documents.snapshot(project.id, created.entity.id, { name: 'Snapshot' });

    await documents.saveContent(project.id, created.entity.id, prose('Moved on.'));

    await expect(
      documents.getVersion(project.id, created.entity.id, version.id),
    ).resolves.toMatchObject({ content: withMention('mechanic-1'), name: 'Snapshot' });
  });
});
