import {
  ActivityService,
  AssetService,
  CommentService,
  EntityRelationshipService,
  EntityService,
  EntityVersionService,
  ProjectService,
  PrototypeService,
  ReviewService,
  ReviewTargetResolver,
  fixedClock,
  systemClock,
  uuidIdGenerator,
  type Asset,
  type Entity,
  type Project,
  type PrototypeVersion,
} from '@level-zero/domain';
import { InMemoryObjectStorageProvider } from '@level-zero/domain/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleActivityRepository } from './activity-repository';
import { DrizzleAssetRepository } from './asset-repository';
import { DrizzleCommentRepository } from './comment-repository';
import { DrizzleEntityRelationshipRepository } from './entity-relationship-repository';
import { DrizzleEntityRepository } from './entity-repository';
import { DrizzleEntityVersionRepository } from './entity-version-repository';
import { DrizzleProjectRepository } from './project-repository';
import { DrizzlePrototypeVersionRepository } from './prototype-version-repository';
import { DrizzleReviewDecisionRepository } from './review-decision-repository';

const deps = { clock: systemClock, ids: uuidIdGenerator };

let client: DatabaseClient;
let projects: ProjectService;
let entities: EntityService;
let versions: EntityVersionService;
let assets: AssetService;
let prototypes: PrototypeService;
let comments: CommentService;
let reviews: ReviewService;
let commentsAt: (instant: string) => CommentService;
let reviewsAt: (instant: string) => ReviewService;

let project: Project;
let otherProject: Project;
let diver: Entity;
let portrait: Asset;
let slice: PrototypeVersion;

beforeAll(async () => {
  client = await connectTestDatabase();

  const projectRepo = new DrizzleProjectRepository(client.db);
  const entityRepo = new DrizzleEntityRepository(client.db);
  const versionRepo = new DrizzleEntityVersionRepository(client.db);
  const assetRepo = new DrizzleAssetRepository(client.db);
  const prototypeRepo = new DrizzlePrototypeVersionRepository(client.db);
  const activity = new ActivityService(new DrizzleActivityRepository(client.db), deps);

  projects = new ProjectService(projectRepo, deps);
  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  versions = new EntityVersionService(versionRepo, entityRepo, activity, deps);
  assets = new AssetService(
    assetRepo,
    projectRepo,
    new InMemoryObjectStorageProvider(),
    activity,
    deps,
  );
  prototypes = new PrototypeService(
    prototypeRepo,
    entities,
    versionRepo,
    assetRepo,
    activity,
    new EntityRelationshipService(
      new DrizzleEntityRelationshipRepository(client.db),
      entityRepo,
      deps,
    ),
    deps,
  );

  const targets = new ReviewTargetResolver(entityRepo, assetRepo, prototypeRepo, versionRepo);
  const commentRepo = new DrizzleCommentRepository(client.db);
  const decisionRepo = new DrizzleReviewDecisionRepository(client.db);
  comments = new CommentService(commentRepo, targets, deps);
  reviews = new ReviewService(decisionRepo, targets, deps);

  // The same services writing at a stated instant. Timestamps come from the
  // app clock at millisecond resolution, so two rows written in the same
  // millisecond would order by their random uuid — fine in the product, not
  // fine in a test that asserts which came first.
  commentsAt = (instant: string) =>
    new CommentService(commentRepo, targets, { clock: fixedClock(instant), ids: uuidIdGenerator });
  reviewsAt = (instant: string) =>
    new ReviewService(decisionRepo, targets, { clock: fixedClock(instant), ids: uuidIdGenerator });
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
  project = await projects.create({ name: 'Deep Fathom' });
  otherProject = await projects.create({ name: 'Sky Wreck' });

  diver = await entities.create(project.id, { type: 'character', name: 'The Diver' });
  portrait = await assets.upload(project.id, {
    kind: 'image',
    filename: 'diver-portrait.png',
    mimeType: 'image/png',
    content: Buffer.from('pretend png bytes'),
  });
  const captured = await prototypes.create(project.id, {
    prototypeName: 'Vertical slice',
    members: [],
  });
  slice = captured.version;
});

describe('comments', () => {
  it('round-trips a thread on each kind of target', async () => {
    const onEntity = await comments.create(project.id, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });
    const onAsset = await comments.create(project.id, {
      target: { type: 'asset', id: portrait.id },
      author: 'ada',
      body: 'Helmet glass is too clean.',
    });
    const onVersion = await comments.create(project.id, {
      target: { type: 'prototype_version', id: slice.id },
      author: 'ada',
      body: 'Second dive stalls.',
    });

    await expect(comments.getById(project.id, onEntity.id)).resolves.toMatchObject({
      target: { type: 'entity', id: diver.id, anchor: null, versionId: null },
      body: 'The oxygen drain reads high.',
    });
    await expect(comments.getById(project.id, onAsset.id)).resolves.toMatchObject({
      target: { type: 'asset', id: portrait.id },
    });
    await expect(comments.getById(project.id, onVersion.id)).resolves.toMatchObject({
      target: { type: 'prototype_version', id: slice.id },
    });
  });

  it('keeps a section thread separate from the document it is in', async () => {
    const gdd = await entities.create(project.id, { type: 'document', name: 'GDD' });
    await comments.create(project.id, {
      target: { type: 'entity', id: gdd.id, anchor: 'Core Loop' },
      author: 'ada',
      body: 'Still describes the old loop.',
    });
    await comments.create(project.id, {
      target: { type: 'entity', id: gdd.id },
      author: 'kai',
      body: 'Overall this reads well.',
    });

    const section = await comments.listThreads(project.id, {
      type: 'entity',
      id: gdd.id,
      anchor: 'Core Loop',
    });
    const document = await comments.listThreads(project.id, { type: 'entity', id: gdd.id });

    expect(section.map((thread) => thread.comment.author)).toEqual(['ada']);
    expect(document.map((thread) => thread.comment.author)).toEqual(['kai']);
  });

  it('reads threads with their replies, oldest first', async () => {
    const target = { type: 'entity', id: diver.id } as const;
    const first = await commentsAt('2026-03-01T09:00:00.000Z').create(project.id, {
      target,
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });
    await commentsAt('2026-03-01T09:00:01.000Z').reply(project.id, {
      parentCommentId: first.id,
      author: 'kai',
      body: 'Halving it.',
    });
    await commentsAt('2026-03-01T09:00:02.000Z').create(project.id, {
      target,
      author: 'kai',
      body: 'Name is still a placeholder.',
    });

    const threads = await comments.listThreads(project.id, target);

    expect(threads).toHaveLength(2);
    expect(threads[0]?.comment.id).toBe(first.id);
    expect(threads[0]?.replies.map((reply) => reply.body)).toEqual(['Halving it.']);
    expect(threads[1]?.replies).toEqual([]);
  });

  it('survives its target being renamed and archived', async () => {
    const thread = await comments.create(project.id, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });
    await entities.update(project.id, diver.id, { name: 'The Salvager' });
    await entities.archive(project.id, diver.id);

    const status = await reviews.getStatus(project.id, { type: 'entity', id: diver.id });

    expect(await comments.listThreads(project.id, { type: 'entity', id: diver.id })).toMatchObject([
      { comment: { id: thread.id } },
    ]);
    expect(status.target).toMatchObject({ label: 'The Salvager', archived: true });
  });

  it('resolves and reopens a thread', async () => {
    const thread = await comments.create(project.id, {
      target: { type: 'asset', id: portrait.id },
      author: 'ada',
      body: 'Helmet glass is too clean.',
    });

    const resolved = await comments.resolve(project.id, thread.id, 'kai');
    expect(resolved).toMatchObject({ resolvedBy: 'kai' });
    expect(resolved.resolvedAt).toBeInstanceOf(Date);

    await expect(comments.reopen(project.id, thread.id)).resolves.toMatchObject({
      resolvedAt: null,
      resolvedBy: null,
    });
  });

  it('takes the replies with the thread when it is deleted', async () => {
    const target = { type: 'asset', id: portrait.id } as const;
    const thread = await comments.create(project.id, {
      target,
      author: 'ada',
      body: 'Helmet glass is too clean.',
    });
    await comments.reply(project.id, {
      parentCommentId: thread.id,
      author: 'kai',
      body: 'Agreed.',
    });

    await comments.remove(project.id, thread.id, 'ada');

    expect(await comments.listThreads(project.id, target)).toEqual([]);
    await expect(countRows('comments')).resolves.toBe(0);
  });

  it('keeps a comment that names one version attached to that version', async () => {
    await versions.commit(project.id, diver.id);
    const committed = await entities.getById(project.id, diver.id);

    const comment = await comments.create(project.id, {
      target: { type: 'entity', id: diver.id, versionId: committed.currentVersionId },
      author: 'ada',
      body: 'This is the drain value I meant.',
    });

    // The composite key against entity_versions(id, entity_id, project_id) is
    // what makes the pin a guarantee rather than a convention.
    await expect(comments.getById(project.id, comment.id)).resolves.toMatchObject({
      target: { versionId: committed.currentVersionId },
    });
    expect(await comments.listThreads(project.id, { type: 'entity', id: diver.id })).toHaveLength(
      1,
    );
  });

  it('hides a comment from another project entirely', async () => {
    const thread = await comments.create(project.id, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });

    await expect(comments.getById(otherProject.id, thread.id)).rejects.toThrow();
    expect(await comments.listThreads(otherProject.id, { type: 'entity', id: diver.id })).toEqual(
      [],
    );
  });
});

describe('review decisions', () => {
  it('pins an approval to the version reviewed and does not carry it onto the next', async () => {
    await versions.commit(project.id, diver.id);
    const atApproval = await entities.getById(project.id, diver.id);

    await reviews.decide(project.id, {
      target: { type: 'entity', id: diver.id },
      state: 'approved',
      actor: 'ada',
      note: 'Reads well.',
    });
    const approved = await reviews.getStatus(project.id, { type: 'entity', id: diver.id });

    await entities.update(project.id, diver.id, { description: 'Now carries a cutting torch.' });
    await versions.commit(project.id, diver.id);
    const afterCommit = await reviews.getStatus(project.id, { type: 'entity', id: diver.id });

    expect(approved.state).toBe('approved');
    expect(approved.decision?.target.versionId).toBe(atApproval.currentVersionId);
    expect(afterCommit.state).toBe('draft');
    expect(afterCommit.staleDecision?.target.versionId).toBe(atApproval.currentVersionId);
  });

  it('keeps every decision, newest first', async () => {
    const target = { type: 'prototype_version', id: slice.id } as const;

    await reviewsAt('2026-03-01T09:00:00.000Z').decide(project.id, {
      target,
      state: 'review',
      actor: 'ada',
    });
    await reviewsAt('2026-03-01T09:00:01.000Z').decide(project.id, {
      target,
      state: 'approved',
      actor: 'kai',
      note: 'Playable.',
    });

    const history = await reviews.listHistory(project.id, target);

    expect(history.map((decision) => [decision.state, decision.actor])).toEqual([
      ['approved', 'kai'],
      ['review', 'ada'],
    ]);
    expect((await reviews.getStatus(project.id, target)).state).toBe('approved');
  });

  it('refuses to pin a judgement to another entity history', async () => {
    const pilot = await entities.create(project.id, { type: 'character', name: 'The Pilot' });
    await versions.commit(project.id, pilot.id);
    const committed = await entities.getById(project.id, pilot.id);

    await expect(
      reviews.decide(project.id, {
        target: { type: 'entity', id: diver.id, versionId: committed.currentVersionId },
        state: 'approved',
        actor: 'ada',
      }),
    ).rejects.toThrow();
  });

  it('cannot decide on another project target', async () => {
    await expect(
      reviews.decide(otherProject.id, {
        target: { type: 'asset', id: portrait.id },
        state: 'approved',
        actor: 'ada',
      }),
    ).rejects.toThrow();
    expect(
      (await reviews.getStatus(otherProject.id, { type: 'asset', id: portrait.id })).state,
    ).toBe('draft');
  });

  it('still allows a whole project to be removed', async () => {
    await versions.commit(project.id, diver.id);
    await reviews.decide(project.id, {
      target: { type: 'entity', id: diver.id },
      state: 'approved',
      actor: 'ada',
    });
    await comments.create(project.id, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });

    await client.db.execute(sql`delete from projects where id = ${project.id}`);

    await expect(countRows('review_decisions')).resolves.toBe(0);
    await expect(countRows('comments')).resolves.toBe(0);
  });
});

async function countRows(table: 'comments' | 'review_decisions'): Promise<number> {
  const result = await client.db.execute<{ count: number }>(
    table === 'comments'
      ? sql`select count(*)::int as count from comments`
      : sql`select count(*)::int as count from review_decisions`,
  );
  return Number(result.rows[0]?.count);
}
