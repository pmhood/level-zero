import { beforeEach, describe, expect, it } from 'vitest';

import { createAsset, type Asset } from '../asset/asset';
import { archiveEntity, createEntity, type Entity } from '../entity/entity';
import { createPrototypeVersion, type PrototypeVersion } from '../prototype/prototype-version';
import { fixedClock } from '../shared/clock';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryAssetRepository,
  InMemoryCommentRepository,
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryPrototypeVersionRepository,
} from '../testing';
import { CommentService } from './comment-service';
import { ReviewTargetResolver } from './review-target-resolver';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const laterClock = fixedClock('2026-03-01T11:00:00.000Z');
const ids = sequentialIdGenerator('comment');

const project = 'project-1';
const otherProject = 'project-2';

let comments: InMemoryCommentRepository;
let entities: InMemoryEntityRepository;
let assets: InMemoryAssetRepository;
let prototypeVersions: InMemoryPrototypeVersionRepository;
let service: CommentService;
let later: CommentService;

let diver: Entity;
let portrait: Asset;
let slice: PrototypeVersion;

function serviceWith(at: ReturnType<typeof fixedClock>): CommentService {
  return new CommentService(
    comments,
    new ReviewTargetResolver(
      entities,
      assets,
      prototypeVersions,
      new InMemoryEntityVersionRepository(),
    ),
    { clock: at, ids },
  );
}

beforeEach(async () => {
  comments = new InMemoryCommentRepository();
  entities = new InMemoryEntityRepository();
  assets = new InMemoryAssetRepository();
  prototypeVersions = new InMemoryPrototypeVersionRepository();
  service = serviceWith(clock);
  later = serviceWith(laterClock);

  diver = await entities.insert(
    createEntity({ projectId: project, type: 'character', name: 'The Diver' }, { clock, ids }),
  );
  portrait = await assets.insert(
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
      { clock, ids },
    ),
  );
  const prototype = await entities.insert(
    createEntity({ projectId: project, type: 'prototype', name: 'Trench Run' }, { clock, ids }),
  );
  slice = await prototypeVersions.insert(
    createPrototypeVersion(
      { projectId: project, prototypeId: prototype.id, versionNumber: 1, members: [] },
      { clock, ids },
    ),
  );
});

describe('create', () => {
  it('comments on an entity', async () => {
    const comment = await service.create(project, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });

    expect(comment).toMatchObject({
      projectId: project,
      author: 'ada',
      parentCommentId: null,
      resolvedAt: null,
    });
    expect(comment.target).toMatchObject({ type: 'entity', id: diver.id, anchor: null });
  });

  it('comments on an asset', async () => {
    const comment = await service.create(project, {
      target: { type: 'asset', id: portrait.id },
      author: 'ada',
      body: 'Helmet glass is too clean.',
    });

    expect(comment.target.type).toBe('asset');
  });

  it('comments on a prototype version', async () => {
    const comment = await service.create(project, {
      target: { type: 'prototype_version', id: slice.id },
      author: 'ada',
      body: 'Second dive stalls.',
    });

    expect(comment.target.type).toBe('prototype_version');
  });

  it('comments on a document section by anchor', async () => {
    const gdd = await entities.insert(
      createEntity({ projectId: project, type: 'document', name: 'GDD' }, { clock, ids }),
    );

    const comment = await service.create(project, {
      target: { type: 'entity', id: gdd.id, anchor: 'Core Loop' },
      author: 'ada',
      body: 'This section still describes the old loop.',
    });

    expect(comment.target.anchor).toBe('Core Loop');
    expect(await service.listThreads(project, { type: 'entity', id: gdd.id })).toEqual([]);
    expect(
      await service.listThreads(project, { type: 'entity', id: gdd.id, anchor: 'Core Loop' }),
    ).toHaveLength(1);
  });

  it('still takes a comment on an archived target', async () => {
    const archived = await entities.save(archiveEntity(diver, { clock }));

    await expect(
      service.create(project, {
        target: { type: 'entity', id: archived.id },
        author: 'ada',
        body: 'Worth reviving for the trench act.',
      }),
    ).resolves.toMatchObject({ author: 'ada' });
  });

  it('refuses a comment on a target in another project', async () => {
    await expect(
      service.create(otherProject, {
        target: { type: 'entity', id: diver.id },
        author: 'ada',
        body: 'Should not be possible.',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('refuses a comment on a target that does not exist', async () => {
    await expect(
      service.create(project, {
        target: { type: 'prototype_version', id: 'gone' },
        author: 'ada',
        body: 'Nothing to talk about.',
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('reply', () => {
  it('inherits the target of the comment it answers', async () => {
    const thread = await service.create(project, {
      target: { type: 'entity', id: diver.id, anchor: 'Backstory' },
      author: 'ada',
      body: 'Is the wreck hers?',
    });

    const reply = await later.reply(project, {
      parentCommentId: thread.id,
      author: 'kai',
      body: 'Her sister crewed it.',
    });

    expect(reply.target).toEqual(thread.target);
    expect(reply.parentCommentId).toBe(thread.id);
  });

  it('refuses to nest a second level', async () => {
    const thread = await service.create(project, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'Is the wreck hers?',
    });
    const reply = await service.reply(project, {
      parentCommentId: thread.id,
      author: 'kai',
      body: 'Her sister crewed it.',
    });

    await expect(
      service.reply(project, { parentCommentId: reply.id, author: 'ada', body: 'Noted.' }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses to reply across projects', async () => {
    const thread = await service.create(project, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'Is the wreck hers?',
    });

    await expect(
      service.reply(otherProject, { parentCommentId: thread.id, author: 'kai', body: 'Yes.' }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('listThreads', () => {
  it('reads a thread with its replies, and survives the target being renamed', async () => {
    const thread = await service.create(project, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });
    await later.reply(project, {
      parentCommentId: thread.id,
      author: 'kai',
      body: 'Agreed, halving it.',
    });
    await entities.save({ ...diver, name: 'The Salvager' });

    const threads = await service.listThreads(project, { type: 'entity', id: diver.id });

    expect(threads).toHaveLength(1);
    expect(threads[0]?.comment.id).toBe(thread.id);
    expect(threads[0]?.replies.map((reply) => reply.author)).toEqual(['kai']);
  });

  it('reads nothing for another project', async () => {
    await service.create(project, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });

    expect(await service.listThreads(otherProject, { type: 'entity', id: diver.id })).toEqual([]);
  });
});

describe('edit', () => {
  it('lets the author rewrite their own comment', async () => {
    const comment = await service.create(project, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });

    const edited = await later.edit(project, comment.id, {
      actor: 'ada',
      body: 'The oxygen drain reads high for a first dive.',
    });

    expect(edited.body).toBe('The oxygen drain reads high for a first dive.');
    expect(edited.updatedAt).toEqual(new Date('2026-03-01T11:00:00.000Z'));
  });

  it('refuses to let anyone else rewrite it', async () => {
    const comment = await service.create(project, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });

    await expect(
      service.edit(project, comment.id, { actor: 'kai', body: 'Actually it is fine.' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('reports another project comment as missing rather than forbidden', async () => {
    const comment = await service.create(project, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });

    await expect(
      service.edit(otherProject, comment.id, { actor: 'ada', body: 'Changed.' }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('remove', () => {
  it('lets the author delete their own comment, and takes its replies', async () => {
    const thread = await service.create(project, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });
    await service.reply(project, {
      parentCommentId: thread.id,
      author: 'kai',
      body: 'Agreed.',
    });

    await service.remove(project, thread.id, 'ada');

    expect(await service.listThreads(project, { type: 'entity', id: diver.id })).toEqual([]);
  });

  it('refuses to let anyone else delete it', async () => {
    const comment = await service.create(project, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });

    await expect(service.remove(project, comment.id, 'kai')).rejects.toThrow(ForbiddenError);
  });
});

describe('resolve and reopen', () => {
  it('records who resolved a thread, whoever wrote it', async () => {
    const thread = await service.create(project, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });

    const resolved = await later.resolve(project, thread.id, 'kai');

    expect(resolved.resolvedBy).toBe('kai');
    expect(resolved.resolvedAt).toEqual(new Date('2026-03-01T11:00:00.000Z'));
  });

  it('reopens a resolved thread', async () => {
    const thread = await service.create(project, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });
    await service.resolve(project, thread.id, 'kai');

    const reopened = await later.reopen(project, thread.id);

    expect(reopened).toMatchObject({ resolvedAt: null, resolvedBy: null });
  });

  it('refuses to resolve a reply rather than its thread', async () => {
    const thread = await service.create(project, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });
    const reply = await service.reply(project, {
      parentCommentId: thread.id,
      author: 'kai',
      body: 'Agreed.',
    });

    await expect(service.resolve(project, reply.id, 'ada')).rejects.toThrow(ValidationError);
  });

  it('reports a thread from another project as missing', async () => {
    const thread = await service.create(project, {
      target: { type: 'entity', id: diver.id },
      author: 'ada',
      body: 'The oxygen drain reads high.',
    });

    await expect(service.resolve(otherProject, thread.id, 'kai')).rejects.toThrow(NotFoundError);
  });
});
