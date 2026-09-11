import { beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../activity/activity-service';
import { TUNING_GROUP } from '../compare/entity-differences';
import { EntityService } from '../entity/entity-service';
import { TUNING_PARAMETERS_KEY, type Parameter } from '../parameter/parameter';
import { PlaytestService } from '../playtest/playtest-service';
import { createProject, type Project } from '../project/project';
import { PrototypeService } from '../prototype/prototype-service';
import { type PrototypeVersion } from '../prototype/prototype-version';
import { EntityRelationshipService } from '../relationship/entity-relationship-service';
import { fixedClock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryActivityRepository,
  InMemoryAssetRepository,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryPlaytestRepository,
  InMemoryProjectRepository,
  InMemoryPrototypeVersionRepository,
} from '../testing';
import { EntityVersionService } from '../version/entity-version-service';
import { OutcomeComparisonService } from './outcome-comparison-service';
import {
  INTERPRETATION_FORMAT_INSTRUCTION,
  outcomeInterpretationPrompt,
} from './outcome-interpretation';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let entities: EntityService;
let versions: EntityVersionService;
let prototypes: PrototypeService;
let playtests: PlaytestService;
let outcomes: OutcomeComparisonService;
let project: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projectRepo = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const versionRepo = new InMemoryEntityVersionRepository();
  const prototypeRepo = new InMemoryPrototypeVersionRepository();
  const playtestRepo = new InMemoryPlaytestRepository();
  const activity = new ActivityService(new InMemoryActivityRepository(), deps);

  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  versions = new EntityVersionService(versionRepo, entityRepo, activity, deps);
  prototypes = new PrototypeService(
    prototypeRepo,
    entities,
    versionRepo,
    new InMemoryAssetRepository(),
    activity,
    new EntityRelationshipService(new InMemoryEntityRelationshipRepository(), entityRepo, deps),
    deps,
  );
  playtests = new PlaytestService(playtestRepo, prototypeRepo, entities, activity, deps);
  outcomes = new OutcomeComparisonService(prototypes, playtestRepo);

  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project') }),
  );
});

const drain = (value: number): Parameter => ({
  id: 'oxygen-drain',
  label: 'Oxygen drain',
  type: 'range',
  value,
  min: 0,
  max: 240,
  step: 1,
  units: 's',
});

/** A mechanic committed at its first tuning, ready to be pinned. */
async function oxygenMechanic(value: number) {
  const mechanic = await entities.create(project.id, {
    type: 'mechanic',
    name: 'Oxygen management',
    data: { [TUNING_PARAMETERS_KEY]: [drain(value)] },
  });
  await versions.commit(project.id, mechanic.id);
  return mechanic;
}

async function retune(entityId: string, value: number) {
  await entities.update(project.id, entityId, {
    data: { [TUNING_PARAMETERS_KEY]: [drain(value)] },
  });
  await versions.commit(project.id, entityId);
}

/** A prototype of one mechanic, captured before and after it was retuned. */
async function twoTunings(): Promise<{
  mechanicId: string;
  prototypeId: string;
  v1: PrototypeVersion;
  v2: PrototypeVersion;
}> {
  const mechanic = await oxygenMechanic(120);
  const { prototype, version } = await prototypes.create(project.id, {
    prototypeName: 'Deep Dive',
    members: [{ entityId: mechanic.id }],
  });

  await retune(mechanic.id, 90);
  const second = await prototypes.capture(project.id, prototype.id, {
    members: [{ entityId: mechanic.id }],
  });

  return { mechanicId: mechanic.id, prototypeId: prototype.id, v1: version, v2: second };
}

async function playtestOf(version: PrototypeVersion, name: string) {
  return playtests.create(project.id, { prototypeVersionId: version.id, name });
}

describe('comparing two prototype versions with what was measured about them', () => {
  it('reads a mechanic retuning as the parameter values that moved', async () => {
    const { mechanicId, v1, v2 } = await twoTunings();

    const comparison = await outcomes.compare(project.id, v1.id, v2.id);

    expect(comparison.designChanges).toHaveLength(1);
    const [change] = comparison.designChanges;
    expect(change).toMatchObject({
      entityId: mechanicId,
      name: 'Oxygen management',
      change: 'changed',
      from: { versionNumber: 1 },
      to: { versionNumber: 2 },
    });
    expect(change?.groups).toEqual([
      {
        title: TUNING_GROUP,
        differences: [
          {
            key: 'oxygen-drain',
            label: 'Oxygen drain',
            change: 'changed',
            from: '120 s',
            to: '90 s',
          },
        ],
      },
    ]);
  });

  it('names the entity versions each side pinned, so a change can be followed back', async () => {
    const { v1, v2 } = await twoTunings();

    const comparison = await outcomes.compare(project.id, v1.id, v2.id);

    const [change] = comparison.designChanges;
    expect(change?.from?.entityVersionId).toBe(v1.members[0]?.entityVersionId);
    expect(change?.to?.entityVersionId).toBe(v2.members[0]?.entityVersionId);
  });

  it('reports entities brought in and dropped without diffing them', async () => {
    const mechanic = await oxygenMechanic(120);
    const diver = await entities.create(project.id, { type: 'character', name: 'The diver' });
    await versions.commit(project.id, diver.id);

    const { prototype, version } = await prototypes.create(project.id, {
      prototypeName: 'Deep Dive',
      members: [{ entityId: mechanic.id }],
    });
    const second = await prototypes.capture(project.id, prototype.id, {
      members: [{ entityId: diver.id }],
    });

    const comparison = await outcomes.compare(project.id, version.id, second.id);

    expect(comparison.designChanges).toEqual([
      expect.objectContaining({ name: 'The diver', change: 'added', from: null, groups: [] }),
      expect.objectContaining({
        name: 'Oxygen management',
        change: 'removed',
        to: null,
        groups: [],
      }),
    ]);
  });

  it('answers with empty evidence for a version nobody has played', async () => {
    const { v1, v2 } = await twoTunings();
    const played = await playtestOf(v1, 'First look');
    await playtests.recordMetric(project.id, played.id, {
      label: 'Session duration',
      value: 120,
      unit: 's',
    });

    const comparison = await outcomes.compare(project.id, v1.id, v2.id);

    expect(comparison.from.playtests.map((playtest) => playtest.name)).toEqual(['First look']);
    expect(comparison.to.playtests).toEqual([]);
    expect(comparison.to.metrics).toEqual([]);
    expect(comparison.to.sessionCount).toBe(0);
    // The metric was measured on one side only: that is a removal, not a fall.
    expect(comparison.metricChanges).toEqual([
      expect.objectContaining({
        difference: expect.objectContaining({ change: 'removed', from: '120 s', to: null }),
        to: null,
      }),
    ]);
  });

  it('averages a metric across every session of every playtest of a version', async () => {
    const { v1, v2 } = await twoTunings();

    const before = await playtestOf(v1, 'First look');
    const beforeRun = await playtests.recordSession(project.id, before.id, {});
    await playtests.recordMetric(project.id, before.id, {
      sessionId: beforeRun.id,
      label: 'Session duration',
      value: 120,
      unit: 's',
    });

    const after = await playtestOf(v2, 'Second look');
    const firstRun = await playtests.recordSession(project.id, after.id, {});
    const secondRun = await playtests.recordSession(project.id, after.id, {});
    await playtests.recordMetric(project.id, after.id, {
      sessionId: firstRun.id,
      label: 'Session duration',
      value: 80,
      unit: 's',
    });
    await playtests.recordMetric(project.id, after.id, {
      sessionId: secondRun.id,
      label: 'Session duration',
      value: 100,
      unit: 's',
    });

    const comparison = await outcomes.compare(project.id, v1.id, v2.id);

    expect(comparison.from.sessionCount).toBe(1);
    expect(comparison.to.sessionCount).toBe(2);
    expect(comparison.metricChanges).toEqual([
      {
        difference: {
          key: 'session-duration',
          label: 'Session duration',
          change: 'changed',
          from: '120 s',
          to: '90 s',
        },
        from: expect.objectContaining({ sampleCount: 1, playtestIds: [before.id] }),
        to: expect.objectContaining({ sampleCount: 2, playtestIds: [after.id] }),
      },
    ]);
  });

  it('groups feedback and observations by category, keeping the words as written', async () => {
    const { mechanicId, v1, v2 } = await twoTunings();

    const before = await playtestOf(v1, 'First look');
    await playtests.recordFeedback(project.id, before.id, {
      body: 'I ran out of air before the wreck.',
      sentiment: 'negative',
      tags: ['difficulty'],
    });

    const after = await playtestOf(v2, 'Second look');
    await playtests.recordFeedback(project.id, after.id, {
      body: 'The pacing felt right this time.',
      sentiment: 'positive',
      tags: ['pacing'],
    });
    await playtests.recordObservation(project.id, after.id, {
      body: 'Surfaced with 20 seconds to spare.',
      entityId: mechanicId,
      tags: ['pacing'],
    });

    const comparison = await outcomes.compare(project.id, v1.id, v2.id);

    expect(comparison.feedbackThemes).toEqual([
      expect.objectContaining({
        category: 'difficulty',
        from: [expect.objectContaining({ body: 'I ran out of air before the wreck.' })],
        to: [],
      }),
      expect.objectContaining({
        category: 'pacing',
        from: [],
        to: [expect.objectContaining({ body: 'The pacing felt right this time.' })],
      }),
    ]);
    expect(comparison.observationThemes).toEqual([
      expect.objectContaining({
        category: 'pacing',
        to: [expect.objectContaining({ entityId: mechanicId, tags: ['pacing'] })],
      }),
    ]);
  });

  it('files untagged remarks last rather than dropping them', async () => {
    const { v1, v2 } = await twoTunings();

    const after = await playtestOf(v2, 'Second look');
    await playtests.recordFeedback(project.id, after.id, { body: 'No idea what to do.' });
    await playtests.recordFeedback(project.id, after.id, {
      body: 'The wreck looks great.',
      tags: ['delight'],
    });

    const comparison = await outcomes.compare(project.id, v1.id, v2.id);

    expect(comparison.feedbackThemes.map((theme) => theme.category)).toEqual(['delight', null]);
    expect(comparison.feedbackThemes[1]?.to).toEqual([
      expect.objectContaining({ body: 'No idea what to do.' }),
    ]);
  });

  it('keeps answering with what was pinned after the entities have moved on', async () => {
    const { mechanicId, v1, v2 } = await twoTunings();
    const asCaptured = await outcomes.compare(project.id, v1.id, v2.id);

    await retune(mechanicId, 30);

    const comparison = await outcomes.compare(project.id, v1.id, v2.id);
    expect(comparison.designChanges).toEqual(asCaptured.designChanges);
  });

  it('refuses two versions of different prototypes', async () => {
    const { v1 } = await twoTunings();
    const other = await twoTunings();

    await expect(outcomes.compare(project.id, v1.id, other.v2.id)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('reads a version from another project as missing', async () => {
    const { v1, v2 } = await twoTunings();

    await expect(outcomes.compare('prj_other', v1.id, v2.id)).rejects.toThrow();
  });
});

/**
 * The briefing is the only thing a model sees, so what it says is part of the
 * contract: the facts, and the rules that stop a reading of them becoming a
 * causal claim.
 */
describe('the briefing behind an AI interpretation', () => {
  it('carries the design change, the measured move and the words people wrote', async () => {
    const { v1, v2 } = await twoTunings();

    const before = await playtestOf(v1, 'First look');
    await playtests.recordMetric(project.id, before.id, {
      label: 'Session duration',
      value: 120,
      unit: 's',
    });
    const after = await playtestOf(v2, 'Second look');
    await playtests.recordMetric(project.id, after.id, {
      label: 'Session duration',
      value: 90,
      unit: 's',
    });
    await playtests.recordFeedback(project.id, after.id, {
      body: 'Much tighter.',
      tags: ['pacing'],
    });

    const prompt = outcomeInterpretationPrompt(await outcomes.compare(project.id, v1.id, v2.id));

    expect(prompt).toContain('Oxygen drain 120 s → 90 s');
    expect(prompt).toContain('Session duration: 120 s → 90 s');
    expect(prompt).toContain('1 measurement');
    expect(prompt).toContain('"Much tighter."');
    expect(prompt).toContain('pacing: 0 on A, 1 on B');
  });

  it('says so when a side was never played, and never asks for a cause', async () => {
    const { v1, v2 } = await twoTunings();

    const prompt = outcomeInterpretationPrompt(await outcomes.compare(project.id, v1.id, v2.id));

    expect(prompt).toContain('no playtests recorded');
    expect(prompt).toContain('Measured metrics: none recorded.');
    expect(prompt).toContain(INTERPRETATION_FORMAT_INSTRUCTION);
    expect(prompt).toContain('Never claim that a change caused an outcome');
  });
});
