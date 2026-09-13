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
const EXCEPTION_CATEGORIES = new Set([
  'assertion-error',
  'browser-closed',
  'browser-executable-missing',
  'browser-launch-failure',
  'connection-refused',
  'network-timeout',
  'uncategorized-exception',
]);

export function buildSanitizedPlaywrightDiagnostics(report) {
  const failures = [];

  if (report?.format === 'wits-playwright-structural-v1') {
    collectStructuralFailures(report, failures);
    return diagnosticsResult(failures);
  }

  for (const suite of report?.suites ?? []) {
    collectSuiteFailures(suite, [], failures);
  }

  if ((report?.errors ?? []).length > 0) {
    const error = report.errors[0];
    failures.push({
      attachments: [],
      durationSeconds: 0,
      errorColumn: sanitizePositiveInteger(error?.location?.column),
      errorFile: sanitizeSourceBasename(error?.location?.file),
      errorLine: sanitizePositiveInteger(error?.location?.line),
      exceptionCategory: 'uncategorized-exception',
      failurePhase: 'runner/web-server-setup',
      failingStep: null,
      file: null,
      ...FAILURE_DETAILS.runner,
      hookOrFixtureTitle: null,
      line: null,
      projectName: null,
      testTitle: 'Playwright setup or runner',
    });
  }

  return diagnosticsResult(failures);
}

function collectStructuralFailures(report, failures) {
  for (const failure of report.failures ?? []) {
    const testLocation = failure.testLocation;
    const phase = failurePhase(failure);
    failures.push({
      attachments: sanitizeAttachments(failure.attachments),
      durationSeconds: Math.ceil(Math.max(0, failure.duration ?? 0) / 1_000),
      errorColumn: sanitizePositiveInteger(failure.errorSource?.column),
      errorFile: sanitizeSourceBasename(failure.errorSource?.file),
      errorLine: sanitizePositiveInteger(failure.errorSource?.line),
      exceptionCategory: sanitizeExceptionCategory(failure.exceptionCategory),
      ...failureDetailsForResult(failure),
      failurePhase: phase,
      failingStep:
        failure.failedStep?.category === 'test.step'
          ? sanitizeNullableTitle(failure.failedStep.title)
          : null,
      file: sanitizeSourceFile(testLocation?.file),
      hookOrFixtureTitle: safeHookOrFixtureTitle(failure.failedStep),
      line: sanitizePositiveInteger(testLocation?.line),
      projectName: sanitizeNullableTitle(failure.projectName),
      testTitle:
        (failure.testTitlePath ?? [])
          .map(sanitizeTitle)
          .filter(Boolean)
          .join(' › ') || 'Unnamed Playwright test',
    });
  }

  if ((report.globalErrors ?? []).length > 0) {
    const error = report.globalErrors[0];
    failures.push({
      attachments: [],
      durationSeconds: 0,
      errorColumn: sanitizePositiveInteger(error?.errorSource?.column),
      errorFile: sanitizeSourceBasename(error?.errorSource?.file),
      errorLine: sanitizePositiveInteger(error?.errorSource?.line),
      exceptionCategory: sanitizeExceptionCategory(error?.exceptionCategory),
      failurePhase: 'runner/web-server-setup',
      failingStep: null,
      file: null,
      ...FAILURE_DETAILS.runner,
      hookOrFixtureTitle: null,
      line: null,
      projectName: null,
      testTitle: 'Playwright setup or runner',
    });
  }
}

function diagnosticsResult(failures) {
  return {
    failures,
    schemaVersion: 3,
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
          errorColumn: sanitizePositiveInteger(result.errorLocation?.column),
          errorFile: sanitizeSourceBasename(result.errorLocation?.file),
          errorLine: sanitizePositiveInteger(result.errorLocation?.line),
          exceptionCategory: 'uncategorized-exception',
          ...failureDetailsForResult(result),
          failurePhase: findFailingStep(result.steps) ? 'test-body' : 'unknown',
          failingStep: findFailingStep(result.steps),
          file: sanitizeSourceFile(spec.file ?? suite.file),
          hookOrFixtureTitle: null,
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

function failurePhase(failure) {
  const step = failure.failedStep;
  if (!step) {
    return String(failure.exceptionCategory ?? '').startsWith('browser-')
      ? 'fixture/setup'
      : 'unknown';
  }

  const titlePath = (step.titlePath ?? [step.title])
    .map((title) => String(title).toLowerCase())
    .join(' ');
  if (titlePath.includes('beforeall')) return 'beforeAll';
  if (titlePath.includes('beforeeach')) return 'beforeEach';
  if (titlePath.includes('aftereach')) return 'afterEach';
  if (titlePath.includes('afterall')) return 'afterAll';
  if (titlePath.includes('fixture "')) return 'fixture/setup';
  if (titlePath.includes('before hooks')) return 'beforeEach';
  if (titlePath.includes('after hooks')) return 'afterEach';
  if (step.category === 'fixture') return 'fixture/setup';
  if (step.category === 'hook') {
    return 'fixture/setup';
  }
  return 'test-body';
}

function safeHookOrFixtureTitle(step) {
  if (!step) return null;

  const title = String(step.title ?? '').trim();
  const knownTitles = new Map([
    ['after hooks', 'After Hooks'],
    ['afterall hook', 'afterAll hook'],
    ['aftereach hook', 'afterEach hook'],
    ['before hooks', 'Before Hooks'],
    ['beforeall hook', 'beforeAll hook'],
    ['beforeeach hook', 'beforeEach hook'],
    ['browser', 'browser'],
    ['context', 'context'],
    ['context configuration', 'context configuration'],
    ['page', 'page'],
    ['playwright', 'playwright'],
    ['trace recording', 'trace recording'],
  ]);
  const knownTitle = knownTitles.get(title.toLowerCase());
  if (knownTitle) return knownTitle;

  for (const ancestorTitle of step.titlePath ?? []) {
    const fixtureMatch = String(ancestorTitle).match(
      /^Fixture "(browser|context|page|playwright)"$/iu,
    );
    if (fixtureMatch) return fixtureMatch[1].toLowerCase();
  }
  for (const ancestorTitle of step.titlePath ?? []) {
    const knownAncestor = knownTitles.get(String(ancestorTitle).toLowerCase());
    if (knownAncestor) return knownAncestor;
  }

  return step.category === 'fixture' ? 'fixture' : null;
}

function sanitizeExceptionCategory(value) {
  return EXCEPTION_CATEGORIES.has(value) ? value : 'uncategorized-exception';
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

function sanitizeSourceBasename(file) {
  if (typeof file !== 'string' || file.length === 0) return null;
  return sanitizeTitle(file.replaceAll('\\', '/').split('/').at(-1));
}

function sanitizePositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function sanitizeNullableTitle(value) {
  const title = sanitizeTitle(value);
  return title || null;
}

function sanitizeTitle(value) {
  return sanitizeStructuredText(value).slice(0, 300);
}
