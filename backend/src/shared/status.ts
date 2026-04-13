/**
 * Status constants for all pipeline entities.
 * SQLite doesn't support database-level enums, so we enforce these
 * at the TypeScript level. Use these constants instead of raw strings
 * to get compile-time checking and prevent typos like "RUNING".
 */

export const RunStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETE: 'COMPLETE',
  ERROR: 'ERROR',
  CANCELLED: 'CANCELLED',
} as const;

export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const ProjectStatus = {
  INTAKE: 'INTAKE',
  FEASIBILITY: 'FEASIBILITY',
} as const;

export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const CheckResultStatus = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARNING: 'WARNING',
} as const;

export type CheckResultStatus = (typeof CheckResultStatus)[keyof typeof CheckResultStatus];
