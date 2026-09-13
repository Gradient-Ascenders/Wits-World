import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPORT_FORMAT = 'wits-playwright-structural-v1';

export default class DiagnosticReporter {
  constructor(options = {}) {
    this.outputFile = options.outputFile;
    this.failures = [];
    this.globalErrors = [];
  }

  onTestEnd(test, result) {
    if (!isFailureStatus(result.status)) return;
    this.failures.push(createStructuralFailure(test, result));
  }

  onError(error) {
    this.globalErrors.push({
      errorSource: findErrorSource(error),
      exceptionCategory: classifyExceptionCategory(error),
    });
  }

  async onEnd() {
    if (!this.outputFile) return;
    await mkdir(path.dirname(this.outputFile), { recursive: true });
    await writeFile(
      this.outputFile,
      JSON.stringify({
        failures: this.failures,
        format: REPORT_FORMAT,
        globalErrors: this.globalErrors,
      }),
      'utf8',
    );
  }
}

export function createStructuralFailure(test, result) {
  const failedStep = findFailedStep(result.steps);
  return {
    attachments: (result.attachments ?? []).map((attachment) => ({
      contentType: attachment.contentType,
      name: attachment.name,
      path: attachment.path,
    })),
    duration: result.duration,
    errorSource: findErrorSource(result.error) ?? failedStep?.location ?? null,
    exceptionCategory: classifyExceptionCategory(result.error),
    failedStep,
    projectName: test.parent?.project?.()?.name,
    status: result.status,
    testLocation: test.location,
    testTitlePath: test.titlePath(),
  };
}

export function classifyExceptionCategory(error) {
  const message = String(error?.message ?? error?.value ?? '');

  if (message.includes("Executable doesn't exist at")) {
    return 'browser-executable-missing';
  }
  if (/\bbrowserType\.launch\b/u.test(message)) return 'browser-launch-failure';
  if (/\bECONNREFUSED\b/u.test(message)) return 'connection-refused';
  if (/\b(?:ETIMEDOUT|ERR_TIMED_OUT)\b/u.test(message)) {
    return 'network-timeout';
  }
  if (message.includes('Target page, context or browser has been closed')) {
    return 'browser-closed';
  }
  if (error?.matcherResult || /\bexpect(?:\(|\.)/u.test(message)) {
    return 'assertion-error';
  }
  return 'uncategorized-exception';
}

function findFailedStep(steps = []) {
  for (const step of steps) {
    const childFailure = findFailedStep(step.steps);
    if (childFailure) return childFailure;
    if (!step.error) continue;
    return {
      category: step.category,
      location: step.location,
      title: step.title,
      titlePath: step.titlePath(),
    };
  }
  return null;
}

function findErrorSource(error) {
  if (error?.location) return error.location;

  const stack = String(error?.stack ?? '');
  const match = stack.match(
    /(?:\(|\bat\s+)(?<file>(?:[A-Za-z]:[\\/]|\/)[^()\r\n]+?):(?<line>\d+):(?<column>\d+)\)?/u,
  );
  if (!match?.groups) return null;
  return {
    column: Number(match.groups.column),
    file: match.groups.file,
    line: Number(match.groups.line),
  };
}

function isFailureStatus(status) {
  return (
    status === 'failed' || status === 'timedOut' || status === 'interrupted'
  );
}
