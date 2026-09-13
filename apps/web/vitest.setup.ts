// `findBy*` and `waitFor` default to a 1s timeout. That is comfortable on a
// developer machine and tight on a 2-core CI runner working through the whole
// suite, where it produced a test that passed locally 21/21 and failed in CI
// every time. Raise it once here rather than per assertion.
//
// Most tests in this package run in the `node` environment and a component
// test opts into a DOM with `@vitest-environment jsdom`, so this only applies
// where there is a document to query.
if (typeof document !== 'undefined') {
  const { configure } = await import('@testing-library/react');
  configure({ asyncUtilTimeout: 5000 });
}

// Top-level `await` above requires this file to be a module.
export {};
