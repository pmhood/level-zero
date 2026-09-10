import type { DifferenceGroup } from '@level-zero/domain';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';
import { CompareView } from './compare-view';

const tuning: DifferenceGroup[] = [
  {
    title: 'Tuning',
    differences: [
      { key: 'oxygen-drain', label: 'Oxygen drain', change: 'changed', from: '120 s', to: '90 s' },
      { key: 'sprint', label: 'Sprinting allowed', change: 'added', from: null, to: 'On' },
      { key: 'gasps', label: 'Panic gasps', change: 'removed', from: '3', to: null },
    ],
  },
];

function renderCompare(groups: DifferenceGroup[] = tuning) {
  return render(
    <CompareView
      a={{ label: 'v2', meta: 'Saved 1 March', children: <p>Earlier</p> }}
      b={{
        label: 'v3',
        current: true,
        children: <p>Later</p>,
        actions: <Button size="sm">Start a new line of work</Button>,
      }}
      groups={groups}
    />,
  );
}

describe('CompareView', () => {
  it('lays the two sides out as A and B with their identities', () => {
    renderCompare();

    expect(within(screen.getByRole('region', { name: 'Side A' })).getByText('v2')).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Side A' })).getByText('Earlier'),
    ).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Side B' })).getByText('v3')).toBeTruthy();
  });

  it('marks the side that is the working copy', () => {
    renderCompare();

    expect(
      within(screen.getByRole('region', { name: 'Side B' })).getByText('Current'),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Side A' })).queryByText('Current'),
    ).toBeNull();
  });

  it('reads a change as the values either side of it', () => {
    renderCompare();

    const differences = within(screen.getByRole('region', { name: 'Differences' }));
    expect(differences.getByText('Oxygen drain')).toBeTruthy();
    expect(differences.getByText('120 s')).toBeTruthy();
    expect(differences.getByText('90 s')).toBeTruthy();
  });

  it('names an addition and a removal rather than leaving a blank side', () => {
    renderCompare();

    const differences = within(screen.getByRole('region', { name: 'Differences' }));
    expect(differences.getByText('Added')).toBeTruthy();
    expect(differences.getByText('Removed')).toBeTruthy();
  });

  it('says so when there is nothing between the two sides', () => {
    renderCompare([]);

    expect(screen.getByText(/the same in every way/i)).toBeTruthy();
  });

  it('offers only the actions the surface passed in, and nothing on its own', () => {
    renderCompare();

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Start a new line of work' })).toBeTruthy();
  });

  /** The issue's rule: no Git words anywhere a creative user reads. */
  it('uses no source-control language of its own', () => {
    const { container } = renderCompare();

    expect(container.textContent).not.toMatch(/\b(commit|committed|revert|head|diff|merge)\b/i);
  });
});
