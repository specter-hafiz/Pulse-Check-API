'use strict';

/**
 * validateBody
 *
 * Lightweight schema validator. Takes a map of field → validator function.
 * Returns 400 with a clear message if any field fails.
 *
 * Keeps validation declarative and out of controllers.
 *
 * @param {Record<string, (value: unknown) => string | null>} schema
 *   Each value is a function that returns an error message string,
 *   or null/undefined if the value is valid.
 *
 * @returns {import('express').RequestHandler}
 */
function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, validate] of Object.entries(schema)) {
      const message = validate(req.body[field]);
      if (message) errors.push({ field, message });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error:  'Validation failed.',
        type:   'ValidationError',
        errors,
      });
    }

    next();
  };
}

// ── Reusable validators ────────────────────────────────────────────────────

const required = (label) => (v) =>
  v === undefined || v === null || v === ''
    ? `"${label}" is required.`
    : null;

const isNonEmptyString = (label) => (v) =>
  typeof v !== 'string' || !v.trim()
    ? `"${label}" must be a non-empty string.`
    : null;

const isPositiveInteger = (label) => (v) =>
  !Number.isInteger(v) || v < 1
    ? `"${label}" must be a positive integer (seconds).`
    : null;

const isEmail = (label) => (v) => {
  if (typeof v !== 'string' || !v.includes('@')) {
    return `"${label}" must be a valid email address.`;
  }
  return null;
};

const isOptionalUrl = (label) => (v) => {
  if (v === undefined || v === null) return null;
  try { new URL(v); return null; }
  catch { return `"${label}" must be a valid URL when provided.`; }
};

module.exports = {
  validateBody,
  validators: { required, isNonEmptyString, isPositiveInteger, isEmail, isOptionalUrl },
};
