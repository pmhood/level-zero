import { describe, expect, it } from 'vitest';

import { buildProjectCommands, fuzzyMatches, matchesCommand } from './command-palette-commands';

describe('fuzzyMatches', () => {
  it('matches when every character of the query appears in order', () => {
    expect(fuzzyMatches('Create Character', 'crchr')).toBe(true);
    expect(fuzzyMatches('Go to GDD', 'gdd')).toBe(true);
  });

  it('does not match when a character is missing or out of order', () => {
    expect(fuzzyMatches('Create Character', 'xyz')).toBe(false);
    // "rc" never appears in this order in "Create" (it's "cr"), and nothing
    // later in the string can supply an out-of-order "r" before a "c" again.
    expect(fuzzyMatches('Create', 'rc')).toBe(false);
  });

  it('treats an empty or blank query as matching everything', () => {
    expect(fuzzyMatches('Create Character', '')).toBe(true);
    expect(fuzzyMatches('Create Character', '   ')).toBe(true);
  });
});

describe('matchesCommand', () => {
  const command = {
    id: 'create-location',
    label: 'Create Location',
    group: 'Create',
    kind: 'action' as const,
    keywords: ['world', 'place'],
    action: { type: 'navigate' as const, href: '/projects/prj_1/world' as never },
  };

  it('matches against the label', () => {
    expect(matchesCommand(command, 'locat')).toBe(true);
  });

  it('matches against keywords, not just the label', () => {
    expect(matchesCommand(command, 'world')).toBe(true);
  });

  it('matches against the group', () => {
    expect(matchesCommand(command, 'create')).toBe(true);
  });

  it('rejects a query that matches none of label, group or keywords', () => {
    expect(matchesCommand(command, 'zzz')).toBe(false);
  });
});

describe('buildProjectCommands', () => {
  it('scopes every navigation command to the given project', () => {
    const commands = buildProjectCommands('prj_1');

    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      if (command.action.type !== 'navigate') continue;
      expect(command.action.href.startsWith('/projects/prj_1')).toBe(true);
    }
  });

  it('never lets one project’s commands point at another project', () => {
    const first = buildProjectCommands('prj_1');
    const second = buildProjectCommands('prj_2');

    for (const command of second) {
      if (command.action.type !== 'navigate') continue;
      expect(command.action.href.startsWith('/projects/prj_1')).toBe(false);
    }
    // Same ids, different destinations — the registration is a pure function
    // of the project, not cached or shared across projects.
    expect(first.map((c) => c.id)).toEqual(second.map((c) => c.id));
    const firstOverview = first.find((c) => c.id === 'go-overview');
    const secondOverview = second.find((c) => c.id === 'go-overview');
    expect(firstOverview?.action).not.toEqual(secondOverview?.action);
  });

  it('covers creating an Idea, Character, Mechanic and Location', () => {
    const ids = buildProjectCommands('prj_1').map((command) => command.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'create-idea',
        'create-character',
        'create-mechanic',
        'create-location',
      ]),
    );
  });

  it('gives every command a unique id', () => {
    const ids = buildProjectCommands('prj_1').map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks "Ask Level Zero" as an AI command and every navigation command as deterministic', () => {
    const commands = buildProjectCommands('prj_1');
    const ask = commands.find((command) => command.id === 'ask-level-zero');

    expect(ask?.kind).toBe('ai');
    expect(ask?.action).toEqual({ type: 'ask' });
    expect(
      commands
        .filter((command) => command.id !== 'ask-level-zero')
        .every((c) => c.kind === 'action'),
    ).toBe(true);
  });
});
