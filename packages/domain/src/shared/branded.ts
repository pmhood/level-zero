declare const brand: unique symbol;

/**
 * Nominal typing helper. `Brand<string, 'ProjectId'>` is assignable to `string`
 * but a plain `string` is not assignable to it, which stops IDs of different
 * kinds from being mixed up at compile time.
 */
export type Brand<TValue, TBrand extends string> = TValue & { readonly [brand]: TBrand };
