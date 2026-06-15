'use strict';

/**
 * node:sqlite is shipped as a built-in module but currently emits an
 * `ExperimentalWarning` on first use. The API surface we rely on
 * (DatabaseSync / prepare / run / get / all) is stable, so we filter out
 * just that one warning while letting every other warning through.
 *
 * Requiring this module before `node:sqlite` keeps server and test output
 * clean without resorting to a global --no-warnings flag.
 */

const defaultListeners = process.listeners('warning');
process.removeAllListeners('warning');

process.on('warning', (warning) => {
  if (warning.name === 'ExperimentalWarning' && /SQLite/i.test(warning.message)) {
    return; // swallow only the node:sqlite experimental notice
  }
  for (const listener of defaultListeners) listener(warning);
});

module.exports = {};
