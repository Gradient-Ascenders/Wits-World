import path from 'node:path';

const MAX_TEXT_LENGTH = 1_000;
const ANSI_ESCAPE_SEQUENCE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  'gu',
);
const SENSITIVE_ASSIGNMENT =
  /\b(authorization|cookie|credential|database_url|password|secret|token)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]*)/giu;
const DATABASE_URL = /\bpostgres(?:ql)?:\/\/[^\s'"<>]+/giu;
const BEARER_TOKEN = /\bbearer\s+[^\s,'"<>]+/giu;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu;
const LOCATION_VALUE =
  /\b(accuracyMetres|lat|latitude|lng|longitude)\b\s*[:=]\s*-?\d+(?:\.\d+)?/giu;
const COORDINATE_ARRAY =
  /\[\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*\]/gu;
const FAILURE_DETAILS = Object.freeze({
  assertion: {
    failureCategory: 'assertion-failure',
    failureReason: 'A Playwright assertion failed.',
  },
  interrupted: {
    failureCategory: 'interrupted',
    failureReason: 'The Playwright test was interrupted.',
  },
  runner: {
    failureCategory: 'runner-setup-failure',
    failureReason: 'Playwright setup or the test runner failed.',
  },
  test: {
    failureCategory: 'test-failure',
    failureReason: 'The Playwright test failed outside an assertion.',
  },
  timeout: {
    failureCategory: 'timeout',
    failureReason: 'The Playwright test timed out.',
  },
});

export function buildSanitizedPlaywrightDiagnostics(report) {
  const failures = [];

  for (const suite of report?.suites ?? []) {
    collectSuiteFailures(suite, [], failures);
  }

  if ((report?.errors ?? []).length > 0) {
    failures.push({
      attachments: [],
      durationSeconds: 0,
      failingStep: null,
      file: null,
      ...FAILURE_DETAILS.runner,
      line: null,
      projectName: null,
      testTitle: 'Playwright setup or runner',
    });
  }

  return {
    failures,
    schemaVersion: 2,
    status: failures.length > 0 ? 'failed' : 'passed',
  };
}

function sanitizeStructuredText(value) {
  const normalized = String(value ?? '')
    .replaceAll(ANSI_ESCAPE_SEQUENCE, '')
    .replaceAll(DATABASE_URL, '[REDACTED_DATABASE_URL]')
    .replaceAll(BEARER_TOKEN, 'Bearer [REDACTED]')
    .replaceAll(JWT, '[REDACTED_JWT]')
    .replaceAll(SENSITIVE_ASSIGNMENT, '$1=[REDACTED]')
    .replaceAll(LOCATION_VALUE, '$1=[REDACTED]')
    .replaceAll(COORDINATE_ARRAY, '[REDACTED_LOCATION]')
    .replaceAll(/wits-world-[A-Za-z0-9_-]*token/giu, '[REDACTED_TOKEN]')
    .trim();

  if (normalized.length <= MAX_TEXT_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_TEXT_LENGTH - 14)}… [truncated]`;
}

function collectSuiteFailures(suite, parentTitles, failures) {
  const suiteTitles = suite.title
    ? [...parentTitles, sanitizeTitle(suite.title)]
    : parentTitles;

  for (const spec of suite.specs ?? []) {
    const testTitle = [...suiteTitles, sanitizeTitle(spec.title)]
      .filter(Boolean)
      .join(' › ');

    for (const test of spec.tests ?? []) {
      for (const result of test.results ?? []) {
        if (!isFailureStatus(result.status)) continue;
        failures.push({
          attachments: sanitizeAttachments(result.attachments),
          durationSeconds: Math.ceil(Math.max(0, result.duration ?? 0) / 1_000),
          ...failureDetailsForResult(result),
          failingStep: findFailingStep(result.steps),
          file: sanitizeSourceFile(spec.file ?? suite.file),
          line: Number.isInteger(spec.line) && spec.line > 0 ? spec.line : null,
          projectName: sanitizeNullableTitle(test.projectName),
          testTitle: testTitle || 'Unnamed Playwright test',
        });
      }
    }
  }

  for (const child of suite.suites ?? []) {
    collectSuiteFailures(child, suiteTitles, failures);
  }
}

function failureDetailsForResult(result) {
  if (result.status === 'timedOut') return FAILURE_DETAILS.timeout;
  if (result.status === 'interrupted') return FAILURE_DETAILS.interrupted;

  const errors = [result.error, ...(result.errors ?? [])].filter(Boolean);
  if (
    errors.some(
      (error) =>
        error?.matcherResult ||
        error?.name === 'AssertionError' ||
        /\bexpect(?:\(|\.)/u.test(String(error?.message ?? '')),
    )
  ) {
    return FAILURE_DETAILS.assertion;
  }

  return FAILURE_DETAILS.test;
}

function findFailingStep(steps = []) {
  for (const step of steps) {
    const childFailure = findFailingStep(step.steps);
    if (childFailure) return childFailure;
    if (step.error) return sanitizeTitle(step.title) || null;
  }
  return null;
}

function isFailureStatus(status) {
  return (
    status === 'failed' || status === 'timedOut' || status === 'interrupted'
  );
}

function sanitizeAttachments(attachments = []) {
  return attachments
    .filter((attachment) => attachment?.path)
    .map((attachment) => ({
      contentType: sanitizeTitle(attachment.contentType),
      filename: sanitizeTitle(path.basename(attachment.path)),
      name: sanitizeTitle(attachment.name),
    }));
}

function sanitizeSourceFile(file) {
  if (typeof file !== 'string' || file.length === 0) return null;
  return sanitizeTitle(
    file.replaceAll('\\', '/').split('/').slice(-3).join('/'),
  );
}

function sanitizeNullableTitle(value) {
  const title = sanitizeTitle(value);
  return title || null;
}

function sanitizeTitle(value) {
  return sanitizeStructuredText(value).slice(0, 300);
}
