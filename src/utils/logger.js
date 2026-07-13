/**
 * Minimale logger met tijdstempel en niveau. Eén verantwoordelijkheid: consistente logging.
 */

/** @param {string} level @param {string} scope @param {...any} args */
function log(level, scope, ...args) {
  const ts = new Date().toISOString()
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    `[${ts}] [${level.toUpperCase()}] [${scope}]`,
    ...args
  )
}

export const logger = {
  info: (scope, ...a) => log('info', scope, ...a),
  warn: (scope, ...a) => log('warn', scope, ...a),
  error: (scope, ...a) => log('error', scope, ...a),
  debug: (scope, ...a) => log('debug', scope, ...a)
}
