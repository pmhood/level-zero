import { describe, expect, it } from 'vitest';

import { type PlaytestMetric } from '../playtest/playtest-metric';
import { formatMetricValue, metricDifferences, summarizeMetrics } from './metric-differences';

function metric(overrides: Partial<PlaytestMetric> = {}): PlaytestMetric {
  return {
    id: 'ptm_1',
    projectId: 'prj_1',
    playtestId: 'pt_1',
    sessionId: 'pts_1',
    metricKey: 'session-duration',
    label: 'Session duration',
    value: 120,
    unit: 's',
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    updatedAt: new Date('2026-03-01T09:00:00.000Z'),
    ...overrides,
  };
}

describe('metric summaries', () => {
  it('averages every measurement recorded under one key', () => {
    const summaries = summarizeMetrics([
      metric({ id: 'a', sessionId: 's1', value: 120 }),
      metric({ id: 'b', sessionId: 's2', value: 90 }),
      metric({ id: 'c', sessionId: 's3', value: 90 }),
    ]);

    expect(summaries).toEqual([
      {
        metricKey: 'session-duration',
        label: 'Session duration',
        unit: 's',
        mean: 100,
        sampleCount: 3,
        playtestIds: ['pt_1'],
      },
    ]);
  });

  it('keeps the playtests a metric was measured in, once each', () => {
    const summaries = summarizeMetrics([
      metric({ id: 'a', playtestId: 'pt_1' }),
      metric({ id: 'b', playtestId: 'pt_2' }),
      metric({ id: 'c', playtestId: 'pt_1' }),
    ]);

    expect(summaries[0]?.playtestIds).toEqual(['pt_1', 'pt_2']);
  });

  it('keeps metrics with different keys apart', () => {
    const summaries = summarizeMetrics([
      metric(),
      metric({
        id: 'b',
        metricKey: 'completion-rate',
        label: 'Completion rate',
        value: 40,
        unit: '%',
      }),
    ]);

    expect(summaries.map((summary) => summary.metricKey)).toEqual([
      'session-duration',
      'completion-rate',
    ]);
  });

  it('renders a value the way a tuning parameter is rendered', () => {
    expect(formatMetricValue(summarizeMetrics([metric()])[0]!)).toBe('120 s');
    expect(formatMetricValue(summarizeMetrics([metric({ value: 73.5, unit: '%' })])[0]!)).toBe(
      '73.5%',
    );
    expect(formatMetricValue(summarizeMetrics([metric({ value: 7, unit: null })])[0]!)).toBe('7');
  });

  it('rounds a mean to two decimals rather than showing the division', () => {
    const summaries = summarizeMetrics([
      metric({ id: 'a', value: 10 }),
      metric({ id: 'b', value: 11 }),
      metric({ id: 'c', value: 11 }),
    ]);

    expect(formatMetricValue(summaries[0]!)).toBe('10.67 s');
  });
});

describe('metric differences', () => {
  const before = summarizeMetrics([metric({ value: 120 })]);

  it('reads a measured change as the numbers and their unit', () => {
    expect(metricDifferences(before, summarizeMetrics([metric({ value: 90 })]))).toEqual([
      {
        key: 'session-duration',
        label: 'Session duration',
        change: 'changed',
        from: '120 s',
        to: '90 s',
      },
    ]);
  });

  it('pairs measurements on the stable key even when the label was re-typed', () => {
    const after = summarizeMetrics([metric({ label: 'Session length', value: 90 })]);

    expect(metricDifferences(before, after)).toEqual([
      {
        key: 'session-duration',
        label: 'Session length',
        change: 'changed',
        from: '120 s',
        to: '90 s',
      },
    ]);
  });

  it('says nothing when the two sides measured the same number', () => {
    expect(metricDifferences(before, summarizeMetrics([metric({ id: 'b' })]))).toEqual([]);
  });

  it('reports a metric only one side measured as added or removed, never as a move', () => {
    const completion = summarizeMetrics([
      metric({ metricKey: 'completion-rate', label: 'Completion rate', value: 40, unit: '%' }),
    ]);

    expect(metricDifferences(before, [...before, ...completion])).toEqual([
      {
        key: 'completion-rate',
        label: 'Completion rate',
        change: 'added',
        from: null,
        to: '40%',
      },
    ]);

    expect(metricDifferences([...before, ...completion], before)).toEqual([
      {
        key: 'completion-rate',
        label: 'Completion rate',
        change: 'removed',
        from: '40%',
        to: null,
      },
    ]);
  });

  it('compares the means, not the sample counts, when the sides were measured unequally', () => {
    const twiceAtNinety = summarizeMetrics([
      metric({ id: 'a', sessionId: 's1', value: 80 }),
      metric({ id: 'b', sessionId: 's2', value: 100 }),
    ]);

    expect(twiceAtNinety[0]?.sampleCount).toBe(2);
    expect(before[0]?.sampleCount).toBe(1);
    expect(metricDifferences(before, twiceAtNinety)).toEqual([
      {
        key: 'session-duration',
        label: 'Session duration',
        change: 'changed',
        from: '120 s',
        to: '90 s',
      },
    ]);
  });
});
