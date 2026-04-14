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

export type RunStatusValue = (typeof RunStatus)[keyof typeof RunStatus];

export const ProjectStatus = {
  INTAKE: 'INTAKE',
  FEASIBILITY: 'FEASIBILITY',
} as const;

export type ProjectStatusValue = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const CheckResultStatus = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARNING: 'WARNING',
} as const;

export type CheckResultStatusValue = (typeof CheckResultStatus)[keyof typeof CheckResultStatus];
