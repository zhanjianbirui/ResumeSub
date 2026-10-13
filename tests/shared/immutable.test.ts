import { expect, it } from 'vitest';
import { removeAt, updateAt } from '@/shared/immutable';

it('updateAt returns a new array and leaves the original untouched', () => {
  const original = ['a', 'b', 'c'] as const;
  expect(updateAt(original, 1, 'x')).toEqual(['a', 'x', 'c']);
  expect(original).toEqual(['a', 'b', 'c']);
});

it('removeAt returns a new array without the index', () => {
  const original = [1, 2, 3];
  expect(removeAt(original, 0)).toEqual([2, 3]);
  expect(original).toEqual([1, 2, 3]);
});
