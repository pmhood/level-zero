import { describe, expect, it } from 'vitest';

import { ValidationError } from './errors';
import { normalizePaging } from './paging';
import {
  normalizeTags,
  optionalNonNegativeNumber,
  optionalPositiveInt,
  optionalText,
  requireJsonObject,
  requireNonNegativeInt,
  requireOneOf,
  requireText,
} from './validation';

describe('requireText', () => {
  it('trims and returns the value', () => {
    expect(requireText('name', '  Kael ', 10)).toBe('Kael');
  });

  it.each([
    ['a non-string', 42],
    ['whitespace only', '   '],
    ['undefined', undefined],
  ])('rejects %s', (_label, value) => {
    expect(() => requireText('name', value, 10)).toThrow(ValidationError);
  });

  it('reports the field and limit when too long', () => {
    try {
      requireText('name', 'x'.repeat(11), 10);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ValidationError).details).toMatchObject({
        field: 'name',
        maxLength: 10,
        actual: 11,
      });
    }
  });
});

describe('optionalText', () => {
  it('collapses null, undefined and blank strings to null', () => {
    expect(optionalText('description', undefined, 10)).toBeNull();
    expect(optionalText('description', null, 10)).toBeNull();
    expect(optionalText('description', '   ', 10)).toBeNull();
  });

  it('trims a real value', () => {
    expect(optionalText('description', ' hello ', 10)).toBe('hello');
  });
});

describe('normalizeTags', () => {
  it('trims, drops blanks and dedupes case-insensitively, keeping first spelling', () => {
    expect(normalizeTags([' Rebel ', 'rebel', '', 'REBEL', 'Pilot'])).toEqual(['Rebel', 'Pilot']);
  });

  it('treats null and undefined as no tags', () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
  });

  it('rejects a non-array and non-string members', () => {
    expect(() => normalizeTags('rebel')).toThrow(ValidationError);
    expect(() => normalizeTags([1])).toThrow(ValidationError);
  });

  it('rejects too many tags', () => {
    expect(() => normalizeTags(Array.from({ length: 51 }, (_, i) => `tag-${i}`))).toThrow(
      /at most 50 tags/,
    );
  });
});

describe('requireJsonObject', () => {
  it('defaults to an empty object', () => {
    expect(requireJsonObject('data', undefined)).toEqual({});
  });

  it('copies the input', () => {
    const input = { a: 1 };
    const result = requireJsonObject('data', input);
    input.a = 2;

    expect(result).toEqual({ a: 1 });
  });

  it('rejects arrays and primitives', () => {
    expect(() => requireJsonObject('data', [1])).toThrow(ValidationError);
    expect(() => requireJsonObject('data', 'nope')).toThrow(ValidationError);
  });

  it('rejects a circular structure', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => requireJsonObject('data', circular)).toThrow(/JSON-serialisable/);
  });
});

describe('requireNonNegativeInt', () => {
  it('accepts zero and positive integers', () => {
    expect(requireNonNegativeInt('byteSize', 0)).toBe(0);
    expect(requireNonNegativeInt('byteSize', 1024)).toBe(1024);
  });

  it.each([
    ['a negative number', -1],
    ['a fraction', 1.5],
    ['a non-number', '10'],
    ['undefined', undefined],
  ])('rejects %s', (_label, value) => {
    expect(() => requireNonNegativeInt('byteSize', value)).toThrow(ValidationError);
  });
});

describe('optionalPositiveInt', () => {
  it('passes null and undefined through unchanged', () => {
    expect(optionalPositiveInt('width', null)).toBeNull();
    expect(optionalPositiveInt('width', undefined)).toBeNull();
  });

  it('accepts a positive integer', () => {
    expect(optionalPositiveInt('width', 1920)).toBe(1920);
  });

  it.each([
    ['zero', 0],
    ['a negative number', -1],
    ['a fraction', 1.5],
  ])('rejects %s', (_label, value) => {
    expect(() => optionalPositiveInt('width', value)).toThrow(ValidationError);
  });
});

describe('optionalNonNegativeNumber', () => {
  it('passes null and undefined through unchanged', () => {
    expect(optionalNonNegativeNumber('durationSeconds', null)).toBeNull();
    expect(optionalNonNegativeNumber('durationSeconds', undefined)).toBeNull();
  });

  it('accepts zero and fractional values', () => {
    expect(optionalNonNegativeNumber('durationSeconds', 0)).toBe(0);
    expect(optionalNonNegativeNumber('durationSeconds', 12.5)).toBe(12.5);
  });

  it.each([
    ['a negative number', -0.1],
    ['NaN', Number.NaN],
    ['a non-number', '12'],
  ])('rejects %s', (_label, value) => {
    expect(() => optionalNonNegativeNumber('durationSeconds', value)).toThrow(ValidationError);
  });
});

describe('requireOneOf', () => {
  it('accepts a member and rejects anything else', () => {
    expect(requireOneOf('status', 'draft', ['draft', 'active'] as const)).toBe('draft');
    expect(() => requireOneOf('status', 'gone', ['draft', 'active'] as const)).toThrow(
      /draft, active/,
    );
  });
});

describe('normalizePaging', () => {
  it('applies defaults', () => {
    expect(normalizePaging()).toEqual({ limit: 50, offset: 0 });
  });

  it('passes through valid values', () => {
    expect(normalizePaging(10, 20)).toEqual({ limit: 10, offset: 20 });
  });

  it.each([
    ['a limit above the maximum', 201, 0],
    ['a zero limit', 0, 0],
    ['a fractional limit', 1.5, 0],
    ['a negative offset', 10, -1],
  ])('rejects %s', (_label, limit, offset) => {
    expect(() => normalizePaging(limit, offset)).toThrow(ValidationError);
  });
});
