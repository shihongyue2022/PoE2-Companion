import { expect, it } from 'vitest';
import { listedPrice } from './listedPrice';
it('reads explicit native listing notes and uses the same exchange rates as crafting costs', () => {
  expect(listedPrice('備註: ~b/o 2 divine', { divine: 100 })).toMatchObject({ amount: 2, currency: 'divine', exalted: 200 });
  expect(listedPrice('Note: ~price 1/2 divine', { divine: 100 }, { divine: 120 })).toMatchObject({ amount: .5, exalted: 60 });
  expect(listedPrice('备注: ~b/o 5 崇高石', {})).toMatchObject({ amount: 5, exalted: 5 });
});
it('does not guess absent prices, unknown currencies, missing rates or conflicting notes', () => {
  expect(listedPrice('+200 to maximum Life', {})).toBeUndefined();
  expect(listedPrice('Note: ~b/o 10 unknown', {})).toBeUndefined();
  expect(listedPrice('Note: ~b/o 1/0 divine', { divine: 100 })).toBeUndefined();
  expect(listedPrice('Note: ~b/o 2 divine\nNote: ~b/o 3 divine', { divine: 100 })).toBeUndefined();
  expect(listedPrice('Note: ~b/o 2 divine', {})).toMatchObject({ amount: 2, exalted: undefined });
});
