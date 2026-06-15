'use strict';

/**
 * validateBody
 *
 * A tiny declarative request-body validator. Takes a map of field → validator
 * function; each validator returns an error message string, or null when the
 * value is acceptable. Keeps validation out of the controllers.
 *
 * @param {Record<string, (value: unknown) => string | null>} schema
 * @returns {import('express').RequestHandler}
 */
function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, validate] of Object.entries(schema)) {
      const message = validate(req.body?.[field]);
      if (message) errors.push({ field, message });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed.',
        type: 'ValidationError',
        errors,
      });
    }

    next();
  };
}

// ── Reusable validators ──────────────────────────────────────────────────────

const isNonEmptyString = (label) => (v) =>
  typeof v !== 'string' || !v.trim() ? `"${label}" must be a non-empty string.` : null;

const isPositiveInteger = (label) => (v) =>
  !Number.isInteger(v) || v < 1 ? `"${label}" must be a positive integer (seconds).` : null;

const isEmail = (label) => (v) => {
  // Pragmatic check: one @, non-empty local and domain parts, a dot in domain.
  if (typeof v !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return `"${label}" must be a valid email address.`;
  }
  return null;
};

const isOptionalUrl = (label) => (v) => {
  if (v === undefined || v === null || v === '') return null;
  try {
    const url = new URL(v);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return `"${label}" must be an http(s) URL.`;
    }
    return null;
  } catch {
    return `"${label}" must be a valid URL when provided.`;
  }
};

module.exports = {
  validateBody,
  validators: { isNonEmptyString, isPositiveInteger, isEmail, isOptionalUrl },
};
