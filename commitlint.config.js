/**
 * Conventional Commits, per CONTRIBUTING.md. The scope list is closed on purpose:
 * an open scope list drifts into synonyms (`webcomponent`, `component`, `ui`) and
 * stops being useful for filtering history.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'docs', 'test', 'ci', 'build', 'refactor', 'chore', 'perf', 'revert']],
    'scope-enum': [2, 'always', ['web', 'flow', 'spec', 'deps']],
    // Deliberately NOT 'lower-case': CONTRIBUTING asks commits to reference task
    // IDs (`W-2`, `P0-3`), which a strict lower-case rule rejects. The
    // config-conventional default still blocks Sentence-, Start-, Pascal- and
    // UPPER-cased subjects, which is the thing actually worth preventing.
    'body-max-line-length': [0],
  },
};
