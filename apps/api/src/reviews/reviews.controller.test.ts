import {
  CommentService,
  ReviewService,
  ReviewTargetResolver,
  createAsset,
  createEntity,
  createEntityVersion,
  createReviewDecision,
  fixedClock,
  sequentialIdGenerator,
  type Asset,
  type Entity,
} from '@level-zero/domain';
import {
  InMemoryAssetRepository,
  InMemoryCommentRepository,
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryPrototypeVersionRepository,
  InMemoryReviewDecisionRepository,
} from '@level-zero/domain/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { CommentsController } from './comments.controller';
import { ReviewsController } from './reviews.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const deps = { clock, ids: sequentialIdGenerator('id') };

const project = 'project-1';
const otherProject = 'project-2';

let app: INestApplication;
let entityRepo: InMemoryEntityRepository;
let assetRepo: InMemoryAssetRepository;
let versionRepo: InMemoryEntityVersionRepository;
let decisionRepo: InMemoryReviewDecisionRepository;
let diver: Entity;
let portrait: Asset;

beforeEach(async () => {
  entityRepo = new InMemoryEntityRepository();
  assetRepo = new InMemoryAssetRepository();
  versionRepo = new InMemoryEntityVersionRepository();
  decisionRepo = new InMemoryReviewDecisionRepository();
  const targets = new ReviewTargetResolver(
    entityRepo,
    assetRepo,
    new InMemoryPrototypeVersionRepository(),
    versionRepo,
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [CommentsController, ReviewsController],
    providers: [
      {
        provide: CommentService,
        useValue: new CommentService(new InMemoryCommentRepository(), targets, deps),
      },
      { provide: ReviewService, useValue: new ReviewService(decisionRepo, targets, deps) },
      { provide: APP_FILTER, useClass: DomainExceptionFilter },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  diver = await entityRepo.insert(
    createEntity({ projectId: project, type: 'character', name: 'The Diver' }, deps),
  );
  portrait = await assetRepo.insert(
    createAsset(
      {
        projectId: project,
        kind: 'image',
        filename: 'diver-portrait.png',
        mimeType: 'image/png',
        byteSize: 2048,
        storageKey: 'assets/diver-portrait.png',
        checksum: 'abc123',
      },
      deps,
    ),
  );
});

afterEach(async () => {
  await app.close();
});

const http = () => request(app.getHttpServer());
const commentsUrl = (projectId = project) => `/api/projects/${projectId}/comments`;
const reviewsUrl = (projectId = project) => `/api/projects/${projectId}/reviews`;

/** Records a version of the entity and points the entity at it. */
async function commit(entity: Entity, versionNumber: number): Promise<string> {
  const version = await versionRepo.insert(
    createEntityVersion(
      {
        projectId: entity.projectId,
        entityId: entity.id,
        versionNumber,
        parentVersionId: null,
        snapshot: {
          name: entity.name,
          description: entity.description,
          status: entity.status,
          tags: [...entity.tags],
          data: { ...entity.data },
        },
        reason: 'manual',
      },
      deps,
    ),
  );
  await entityRepo.save({ ...entity, currentVersionId: version.id });
  return version.id;
}

async function comment(body: Record<string, unknown> = {}): Promise<{ id: string }> {
  const response = await http()
    .post(commentsUrl())
    .send({
      targetType: 'entity',
      targetId: diver.id,
      author: 'ada',
      body: 'The oxygen drain reads high.',
      ...body,
    })
    .expect(201);

  return response.body;
}

describe('POST /projects/:projectId/comments', () => {
  it('comments on an entity', async () => {
    const response = await http()
      .post(commentsUrl())
      .send({ targetType: 'entity', targetId: diver.id, author: 'ada', body: 'Reads high.' })
      .expect(201);

    expect(response.body).toMatchObject({
      author: 'ada',
      body: 'Reads high.',
      parentCommentId: null,
      target: { type: 'entity', id: diver.id, anchor: null },
    });
  });

  it('comments on an asset', async () => {
    const response = await http()
      .post(commentsUrl())
      .send({ targetType: 'asset', targetId: portrait.id, author: 'ada', body: 'Too clean.' })
      .expect(201);

    expect(response.body.target).toMatchObject({ type: 'asset', id: portrait.id });
  });

  it('comments on a document section', async () => {
    const gdd = await entityRepo.insert(
      createEntity({ projectId: project, type: 'document', name: 'GDD' }, deps),
    );

    const response = await http()
      .post(commentsUrl())
      .send({
        targetType: 'entity',
        targetId: gdd.id,
        anchor: 'Core Loop',
        author: 'ada',
        body: 'Old loop.',
      })
      .expect(201);

    expect(response.body.target.anchor).toBe('Core Loop');
  });

  it('answers 404 for a target in another project', async () => {
    await http()
      .post(commentsUrl(otherProject))
      .send({ targetType: 'entity', targetId: diver.id, author: 'ada', body: 'Reads high.' })
      .expect(404);
  });

  it('answers 400 for an unknown target type', async () => {
    await http()
      .post(commentsUrl())
      .send({ targetType: 'moodboard', targetId: diver.id, author: 'ada', body: 'Reads high.' })
      .expect(400);
  });

  it('answers 400 for an empty body', async () => {
    await http()
      .post(commentsUrl())
      .send({ targetType: 'entity', targetId: diver.id, author: 'ada', body: '' })
      .expect(400);
  });
});

describe('GET /projects/:projectId/comments', () => {
  it('lists the target’s threads with their replies', async () => {
    const thread = await comment();
    await http()
      .post(`${commentsUrl()}/${thread.id}/replies`)
      .send({ author: 'kai', body: 'Halving it.' })
      .expect(201);

    const response = await http()
      .get(commentsUrl())
      .query({ targetType: 'entity', targetId: diver.id })
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].comment.id).toBe(thread.id);
    expect(response.body[0].replies).toHaveLength(1);
  });

  it('does not list a section thread under the document itself', async () => {
    await comment({ anchor: 'Core Loop' });

    const document = await http()
      .get(commentsUrl())
      .query({ targetType: 'entity', targetId: diver.id })
      .expect(200);
    const section = await http()
      .get(commentsUrl())
      .query({ targetType: 'entity', targetId: diver.id, anchor: 'Core Loop' })
      .expect(200);

    expect(document.body).toHaveLength(0);
    expect(section.body).toHaveLength(1);
  });

  it('answers 400 without a target', async () => {
    await http().get(commentsUrl()).expect(400);
  });

  it('lists nothing for another project', async () => {
    await comment();

    const response = await http()
      .get(commentsUrl(otherProject))
      .query({ targetType: 'entity', targetId: diver.id })
      .expect(200);

    expect(response.body).toHaveLength(0);
  });
});

describe('editing and deleting a comment', () => {
  it('lets the author rewrite their own', async () => {
    const thread = await comment();

    const response = await http()
      .patch(`${commentsUrl()}/${thread.id}`)
      .send({ actor: 'ada', body: 'Reads high for a first dive.' })
      .expect(200);

    expect(response.body.body).toBe('Reads high for a first dive.');
  });

  it('answers 403 when somebody else tries', async () => {
    const thread = await comment();

    const response = await http()
      .patch(`${commentsUrl()}/${thread.id}`)
      .send({ actor: 'kai', body: 'Actually it is fine.' })
      .expect(403);

    expect(response.body.error).toBe('forbidden');
  });

  it('deletes the author’s own comment', async () => {
    const thread = await comment();

    await http().delete(`${commentsUrl()}/${thread.id}`).query({ actor: 'ada' }).expect(204);
    await http()
      .get(commentsUrl())
      .query({ targetType: 'entity', targetId: diver.id })
      .expect(200)
      .expect((response) => expect(response.body).toHaveLength(0));
  });

  it('answers 403 when somebody else tries to delete it', async () => {
    const thread = await comment();

    await http().delete(`${commentsUrl()}/${thread.id}`).query({ actor: 'kai' }).expect(403);
  });

  it('answers 404 across projects rather than 403', async () => {
    const thread = await comment();

    await http()
      .patch(`/api/projects/${otherProject}/comments/${thread.id}`)
      .send({ actor: 'ada', body: 'Changed.' })
      .expect(404);
  });
});

describe('resolving a thread', () => {
  it('resolves and reopens it, recording who resolved it', async () => {
    const thread = await comment();

    const resolved = await http()
      .post(`${commentsUrl()}/${thread.id}/resolve`)
      .send({ actor: 'kai' })
      .expect(201);
    expect(resolved.body.resolvedBy).toBe('kai');

    const reopened = await http().post(`${commentsUrl()}/${thread.id}/reopen`).send().expect(201);
    expect(reopened.body).toMatchObject({ resolvedAt: null, resolvedBy: null });
  });

  it('answers 400 when asked to resolve a reply', async () => {
    const thread = await comment();
    const reply = await http()
      .post(`${commentsUrl()}/${thread.id}/replies`)
      .send({ author: 'kai', body: 'Halving it.' })
      .expect(201);

    await http()
      .post(`${commentsUrl()}/${reply.body.id}/resolve`)
      .send({ actor: 'ada' })
      .expect(400);
  });
});

describe('POST /projects/:projectId/reviews', () => {
  it('records an approval against the version in force', async () => {
    const versionId = await commit(diver, 1);

    const response = await http()
      .post(reviewsUrl())
      .send({ targetType: 'entity', targetId: diver.id, state: 'approved', actor: 'ada' })
      .expect(201);

    expect(response.body).toMatchObject({ state: 'approved', actor: 'ada' });
    expect(response.body.target.versionId).toBe(versionId);
  });

  it('answers 400 for a state outside the vocabulary', async () => {
    await http()
      .post(reviewsUrl())
      .send({ targetType: 'entity', targetId: diver.id, state: 'shipped', actor: 'ada' })
      .expect(400);
  });

  it('answers 400 for a version pin on an asset', async () => {
    await http()
      .post(reviewsUrl())
      .send({
        targetType: 'asset',
        targetId: portrait.id,
        versionId: 'version-1',
        state: 'approved',
        actor: 'ada',
      })
      .expect(400);
  });

  it('answers 404 for a target in another project', async () => {
    await http()
      .post(reviewsUrl(otherProject))
      .send({ targetType: 'asset', targetId: portrait.id, state: 'approved', actor: 'ada' })
      .expect(404);
  });
});

describe('GET /projects/:projectId/reviews', () => {
  it('reads draft with the target resolved before anything is decided', async () => {
    const response = await http()
      .get(reviewsUrl())
      .query({ targetType: 'entity', targetId: diver.id })
      .expect(200);

    expect(response.body).toMatchObject({
      state: 'draft',
      decision: null,
      staleDecision: null,
      target: { label: 'The Diver', archived: false },
    });
  });

  it('does not carry an approval of v1 onto v2', async () => {
    await commit(diver, 1);
    await http()
      .post(reviewsUrl())
      .send({ targetType: 'entity', targetId: diver.id, state: 'approved', actor: 'ada' })
      .expect(201);
    await commit({ ...diver, name: 'The Diver, revised' }, 2);

    const response = await http()
      .get(reviewsUrl())
      .query({ targetType: 'entity', targetId: diver.id })
      .expect(200);

    expect(response.body.state).toBe('draft');
    expect(response.body.staleDecision).toMatchObject({ state: 'approved', actor: 'ada' });
  });

  it('reads a status for a target that no longer resolves', async () => {
    // Nothing in the product deletes a target row, so this is seeded directly:
    // the decision carries no foreign key to what it was about, and the status
    // has to stay readable if one ever goes.
    await decisionRepo.insert(
      createReviewDecision(
        {
          projectId: project,
          target: { type: 'asset', id: 'asset-that-went' },
          state: 'rejected',
          actor: 'ada',
        },
        deps,
      ),
    );

    const response = await http()
      .get(reviewsUrl())
      .query({ targetType: 'asset', targetId: 'asset-that-went' })
      .expect(200);

    expect(response.body).toMatchObject({ target: null, state: 'rejected' });
  });
});

describe('GET /projects/:projectId/reviews/history', () => {
  it('keeps both decisions rather than overwriting who decided what', async () => {
    const target = { targetType: 'asset', targetId: portrait.id };
    await http()
      .post(reviewsUrl())
      .send({ ...target, state: 'review', actor: 'ada' })
      .expect(201);
    await http()
      .post(reviewsUrl())
      .send({ ...target, state: 'approved', actor: 'kai' })
      .expect(201);

    const response = await http().get(`${reviewsUrl()}/history`).query(target).expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body.map((decision: { actor: string }) => decision.actor).sort()).toEqual([
      'ada',
      'kai',
    ]);
  });
});

describe('the anchored listings a design document reads', () => {
  /** A design document: sections of one are anchors on the entity itself. */
  async function gdd(): Promise<Entity> {
    return entityRepo.insert(
      createEntity({ projectId: project, type: 'document', name: 'GDD' }, deps),
    );
  }

  it('lists every section’s threads, each saying which section it is on', async () => {
    const document = await gdd();
    await http()
      .post(commentsUrl())
      .send({
        targetType: 'entity',
        targetId: document.id,
        anchor: 'section-a',
        author: 'ada',
        body: 'Still the old loop.',
      })
      .expect(201);
    await http()
      .post(commentsUrl())
      .send({
        targetType: 'entity',
        targetId: document.id,
        author: 'kai',
        body: 'Overall this reads well.',
      })
      .expect(201);

    const response = await http()
      .get(`${commentsUrl()}/anchored`)
      .query({ targetType: 'entity', targetId: document.id })
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].comment.target.anchor).toBe('section-a');
  });

  it('lists where each section stands', async () => {
    const document = await gdd();
    await http()
      .post(reviewsUrl())
      .send({
        targetType: 'entity',
        targetId: document.id,
        anchor: 'section-a',
        state: 'approved',
        actor: 'ada',
      })
      .expect(201);

    const response = await http()
      .get(`${reviewsUrl()}/anchored`)
      .query({ targetType: 'entity', targetId: document.id })
      .expect(200);

    expect(response.body).toMatchObject([{ anchor: 'section-a', state: 'approved' }]);
  });

  it('does not pin a section’s approval to the document version in force', async () => {
    const document = await gdd();
    await commit(document, 1);

    const response = await http()
      .post(reviewsUrl())
      .send({
        targetType: 'entity',
        targetId: document.id,
        anchor: 'section-a',
        state: 'approved',
        actor: 'ada',
      })
      .expect(201);

    expect(response.body.target.versionId).toBeNull();
  });

  it('answers 400 without a target', async () => {
    await http().get(`${reviewsUrl()}/anchored`).expect(400);
    await http().get(`${commentsUrl()}/anchored`).expect(400);
  });

  it('lists nothing for another project', async () => {
    const document = await gdd();
    await http()
      .post(reviewsUrl())
      .send({
        targetType: 'entity',
        targetId: document.id,
        anchor: 'section-a',
        state: 'approved',
        actor: 'ada',
      })
      .expect(201);

    const response = await http()
      .get(`/api/projects/${otherProject}/reviews/anchored`)
      .query({ targetType: 'entity', targetId: document.id })
      .expect(200);

    expect(response.body).toEqual([]);
  });
});
