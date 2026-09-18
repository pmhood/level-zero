import { describe, expect, it } from 'vitest';

import { documentData, type DocumentContent } from '../document/document';
import { createEntity, type Entity } from '../entity/entity';
import {
  createReviewDecision,
  type ReviewDecision,
  type ReviewState,
} from '../review/review-decision';
import { fixedClock } from '../shared/clock';
import { sequentialIdGenerator } from '../shared/id';
import { fingerprint, type ProjectFacts } from './consistency-check';
import { staleSectionReferenceCheck } from './stale-section-reference-check';

const projectId = 'project-1';
const ids = sequentialIdGenerator('id');

const APPROVED_AT = '2026-03-01T09:00:00.000Z';
const BEFORE_APPROVAL = '2026-02-01T09:00:00.000Z';
const AFTER_APPROVAL = '2026-03-02T09:00:00.000Z';

const CORE_LOOP = 'section-core-loop';
const PILLARS = 'section-pillars';

function at(iso: string) {
  return { clock: fixedClock(iso), ids };
}

function heading(text: string, sectionId: string): unknown {
  return {
    type: 'heading',
    attrs: { level: 1, sectionId },
    content: [{ type: 'text', text }],
  };
}

function mentions(...entityIds: string[]): unknown {
  return {
    type: 'paragraph',
    content: entityIds.map((entityId) => ({ type: 'entityMention', attrs: { entityId } })),
  };
}

function doc(...nodes: unknown[]): DocumentContent {
  return { type: 'doc', content: nodes };
}

/** A character nobody has touched since the design was signed off. */
function character(name: string, updatedAt = BEFORE_APPROVAL): Entity {
  const base = createEntity({ projectId, type: 'character', name }, at(BEFORE_APPROVAL));
  return { ...base, updatedAt: new Date(updatedAt), currentVersionId: `${base.id}-version` };
}

function designDocument(content: DocumentContent): Entity {
  return createEntity(
    {
      projectId,
      type: 'document',
      name: 'Game Design Document',
      data: documentData(content),
    },
    at(BEFORE_APPROVAL),
  );
}

function decision(
  documentId: string,
  anchor: string,
  state: ReviewState = 'approved',
  decidedAt = APPROVED_AT,
): ReviewDecision {
  return createReviewDecision(
    { projectId, target: { type: 'entity', id: documentId, anchor }, state, actor: 'Ada' },
    at(decidedAt),
  );
}

function facts(overrides: Partial<ProjectFacts> = {}): ProjectFacts {
  return {
    projectId,
    entities: [],
    prototypeVersions: [],
    sectionDecisions: [],
    ...overrides,
  };
}

/** The everyday case: one approved section, one entity that moved afterwards. */
function staleProject(state: ReviewState = 'approved') {
  const kael = character('Kael', AFTER_APPROVAL);
  const gdd = designDocument(doc(heading('Core loop', CORE_LOOP), mentions(kael.id)));

  return {
    kael,
    gdd,
    facts: facts({
      entities: [gdd, kael],
      sectionDecisions: [decision(gdd.id, CORE_LOOP, state)],
    }),
  };
}

describe('staleSectionReferenceCheck', () => {
  it('flags a section whose referenced entity changed after it was approved', () => {
    const { kael, gdd, facts: project } = staleProject();

    const findings = staleSectionReferenceCheck.run(project);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      fingerprint: fingerprint('stale-section-reference', gdd.id, CORE_LOOP, kael.id),
      severity: 'warning',
      summary: 'Kael has changed since “Core loop” was approved.',
      evidence: [
        {
          entityId: gdd.id,
          anchor: CORE_LOOP,
          where: 'Core loop',
          states: 'approved before Kael changed',
        },
        {
          entityId: kael.id,
          entityVersionId: kael.currentVersionId,
          where: 'Kael',
          states: 'has changed since that decision',
        },
      ],
    });
  });

  it('flags a section that was only sent for review, and says so', () => {
    const findings = staleSectionReferenceCheck.run(staleProject('review').facts);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.summary).toBe('Kael has changed since “Core loop” was sent for review.');
  });

  it('never makes a draft section stale: a draft is not out of date, it is a draft', () => {
    const kael = character('Kael', AFTER_APPROVAL);
    const gdd = designDocument(doc(heading('Core loop', CORE_LOOP), mentions(kael.id)));

    expect(
      staleSectionReferenceCheck.run(facts({ entities: [gdd, kael], sectionDecisions: [] })),
    ).toEqual([]);
  });

  it('leaves a rejected section alone: it is already known to need work', () => {
    expect(staleSectionReferenceCheck.run(staleProject('rejected').facts)).toEqual([]);
  });

  it('does not flag an entity that has not changed since the decision', () => {
    const kael = character('Kael', BEFORE_APPROVAL);
    const gdd = designDocument(doc(heading('Core loop', CORE_LOOP), mentions(kael.id)));

    expect(
      staleSectionReferenceCheck.run(
        facts({ entities: [gdd, kael], sectionDecisions: [decision(gdd.id, CORE_LOOP)] }),
      ),
    ).toEqual([]);
  });

  it('reads the newest decision, so re-approving after the change clears it', () => {
    const { gdd, facts: project } = staleProject();
    const reApproved = facts({
      ...project,
      sectionDecisions: [
        ...project.sectionDecisions,
        decision(gdd.id, CORE_LOOP, 'approved', '2026-03-03T09:00:00.000Z'),
      ],
    });

    expect(staleSectionReferenceCheck.run(reApproved)).toEqual([]);
  });

  it('keeps staleness local to the section whose prose names the entity', () => {
    const kael = character('Kael', AFTER_APPROVAL);
    const gdd = designDocument(
      doc(heading('Design pillars', PILLARS), heading('Core loop', CORE_LOOP), mentions(kael.id)),
    );

    const findings = staleSectionReferenceCheck.run(
      facts({
        entities: [gdd, kael],
        sectionDecisions: [decision(gdd.id, PILLARS), decision(gdd.id, CORE_LOOP)],
      }),
    );

    expect(findings.map((finding) => finding.evidence[0]?.anchor)).toEqual([CORE_LOOP]);
  });

  it('reports one finding per changed entity, so each can be dismissed on its own', () => {
    const kael = character('Kael', AFTER_APPROVAL);
    const oxygen = character('Oxygen', AFTER_APPROVAL);
    const gdd = designDocument(doc(heading('Core loop', CORE_LOOP), mentions(kael.id, oxygen.id)));

    const findings = staleSectionReferenceCheck.run(
      facts({
        entities: [gdd, kael, oxygen],
        sectionDecisions: [decision(gdd.id, CORE_LOOP)],
      }),
    );

    expect(findings).toHaveLength(2);
    expect(new Set(findings.map((finding) => finding.fingerprint)).size).toBe(2);
  });

  it('ignores a reference to an entity that is not in the facts it was given', () => {
    const gdd = designDocument(doc(heading('Core loop', CORE_LOOP), mentions('ghost-entity')));

    expect(
      staleSectionReferenceCheck.run(
        facts({ entities: [gdd], sectionDecisions: [decision(gdd.id, CORE_LOOP)] }),
      ),
    ).toEqual([]);
  });

  it('leaves an archived document alone', () => {
    const { gdd, facts: project } = staleProject();
    const archived = { ...gdd, status: 'archived' as const };

    expect(
      staleSectionReferenceCheck.run(
        facts({ ...project, entities: [archived, ...project.entities.slice(1)] }),
      ),
    ).toEqual([]);
  });

  it('ignores a decision anchored on a section the document no longer has', () => {
    const kael = character('Kael', AFTER_APPROVAL);
    const gdd = designDocument(doc(heading('Core loop', CORE_LOOP), mentions(kael.id)));

    expect(
      staleSectionReferenceCheck.run(
        facts({ entities: [gdd, kael], sectionDecisions: [decision(gdd.id, 'section-removed')] }),
      ),
    ).toEqual([]);
  });

  it('names an untitled heading rather than citing an empty place', () => {
    const kael = character('Kael', AFTER_APPROVAL);
    const gdd = designDocument(doc(heading('   ', CORE_LOOP), mentions(kael.id)));

    const findings = staleSectionReferenceCheck.run(
      facts({ entities: [gdd, kael], sectionDecisions: [decision(gdd.id, CORE_LOOP)] }),
    );

    expect(findings[0]?.evidence[0]?.where).toBe('Untitled section');
  });

  it('keeps its fingerprint across an entity edit, so a dismissal is not abandoned', () => {
    const { kael, facts: project } = staleProject();
    const before = staleSectionReferenceCheck.run(project);

    // The entity is renamed, re-versioned and saved again — everything that
    // makes a finding's *content* change without making it a different finding
    // (docs/decisions/consistency-findings.md §4.2).
    const edited: Entity = {
      ...kael,
      name: 'Kael Ardis',
      currentVersionId: 'version-later',
      updatedAt: new Date('2026-03-04T09:00:00.000Z'),
    };
    const after = staleSectionReferenceCheck.run(
      facts({ ...project, entities: [project.entities[0]!, edited] }),
    );

    expect(after[0]?.fingerprint).toBe(before[0]?.fingerprint);
    expect(after[0]?.summary).not.toBe(before[0]?.summary);
  });

  it('produces the same fingerprint on repeated runs over the same facts', () => {
    const { facts: project } = staleProject();

    expect(staleSectionReferenceCheck.run(project)[0]?.fingerprint).toBe(
      staleSectionReferenceCheck.run(project)[0]?.fingerprint,
    );
  });

  it('never cites an object outside the facts it was given', () => {
    // A second project's document approves a section naming its own character.
    // `ProjectFacts` holds one project's records, so the check has nothing else
    // it could reach even if it wanted to.
    const impostor = createEntity(
      { projectId: 'project-2', type: 'character', name: 'Impostor' },
      at(AFTER_APPROVAL),
    );
    const { kael, gdd, facts: project } = staleProject();

    const findings = staleSectionReferenceCheck.run(project);

    const cited = findings.flatMap((finding) => finding.evidence.map((item) => item.entityId));
    expect(cited).not.toContain(impostor.id);
    expect(new Set(cited)).toEqual(new Set([gdd.id, kael.id]));
  });
});
