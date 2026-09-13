import { describe, expect, it } from 'vitest';

import { buildSanitizedPlaywrightDiagnostics } from '../scripts/playwright-diagnostics.mjs';
import {
  classifyExceptionCategory,
  createStructuralFailure,
} from '../../web/playwright/diagnostic-reporter.mjs';

describe('sanitized Playwright diagnostics', () => {
  it('retains the failed test, journey step, duration, and safe attachment basenames', () => {
    const diagnostics = buildSanitizedPlaywrightDiagnostics({
      errors: [],
      suites: [
        {
          file: 'C:/repo/apps/web/playwright/basic.deterministic.spec.ts',
          specs: [
            {
              file: 'C:/repo/apps/web/playwright/basic.deterministic.spec.ts',
              line: 90,
              title: 'completes the canonical Basic journey',
              tests: [
                {
                  projectName: 'chromium',
                  results: [
                    {
                      attachments: [
                        {
                          contentType: 'image/png',
                          name: 'screenshot',
                          path: 'C:/private/run/test-failed-1.png',
                        },
                      ],
                      duration: 35_201,
                      error: {
                        message: 'Error: expect(locator).toBeVisible() failed',
                      },
                      status: 'failed',
                      steps: [
                        {
                          error: { message: 'locator was hidden' },
                          title: '02 discover the known published demo event',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(diagnostics).toEqual({
      failures: [
        {
          attachments: [
            {
              contentType: 'image/png',
              filename: 'test-failed-1.png',
              name: 'screenshot',
            },
          ],
          durationSeconds: 36,
          errorColumn: null,
          errorFile: null,
          errorLine: null,
          exceptionCategory: 'uncategorized-exception',
          failureCategory: 'assertion-failure',
          failureReason: 'A Playwright assertion failed.',
          failurePhase: 'test-body',
          failingStep: '02 discover the known published demo event',
          file: 'web/playwright/basic.deterministic.spec.ts',
          hookOrFixtureTitle: null,
          line: 90,
          projectName: 'chromium',
          testTitle: 'completes the canonical Basic journey',
        },
      ],
      schemaVersion: 3,
      status: 'failed',
    });
  });

  it('never copies arbitrary Playwright error, snapshot, output, or attachment content', () => {
    const sensitiveValues = [
      'accepted-answer-like-string',
      'player@example.test',
      'Naledi Private Player',
      'DOM text containing private challenge content',
      'lat=-26.19&lng=28.03',
      '[-26.19, 28.03]',
      'Authorization: Bearer private-auth-value',
      'cookie=private-session-cookie',
      'token=wits-world-private-test-token',
      'postgresql://owner:password@db.example/private',
    ];
    const arbitraryBody = sensitiveValues.join('\n');
    const diagnostics = buildSanitizedPlaywrightDiagnostics({
      errors: [],
      suites: [
        {
          specs: [
            {
              file: 'C:/repo/apps/web/playwright/basic.deterministic.spec.ts',
              line: 492,
              title: 'keeps the authenticated shell accessible',
              tests: [
                {
                  projectName: 'chromium',
                  results: [
                    {
                      attachments: [
                        {
                          body: arbitraryBody,
                          contentType: 'text/markdown',
                          name: 'error-context',
                          path: 'C:/private/run/error-context.md',
                        },
                      ],
                      duration: 15_001,
                      error: {
                        message: `Error: expect(locator).toBeFocused() failed\n${arbitraryBody}`,
                        snippet: arbitraryBody,
                        stack: arbitraryBody,
                      },
                      errors: [{ message: arbitraryBody }],
                      status: 'failed',
                      stderr: [arbitraryBody],
                      stdout: [arbitraryBody],
                      steps: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const uploadedJson = JSON.stringify(diagnostics);

    for (const sensitiveValue of sensitiveValues) {
      expect(uploadedJson).not.toContain(sensitiveValue);
    }
    expect(diagnostics.failures[0]).toMatchObject({
      attachments: [
        {
          contentType: 'text/markdown',
          filename: 'error-context.md',
          name: 'error-context',
        },
      ],
      failureCategory: 'assertion-failure',
      failureReason: 'A Playwright assertion failed.',
    });
  });

  it('redacts coordinate forms if they occur in retained structured labels', () => {
    const diagnostics = buildSanitizedPlaywrightDiagnostics({
      suites: [
        {
          specs: [
            {
              title: 'fixed step near lat=-26.19&lng=28.03 and [-26.19, 28.03]',
              tests: [
                {
                  results: [{ status: 'failed' }],
                },
              ],
            },
          ],
        },
      ],
    });
    const uploadedJson = JSON.stringify(diagnostics);

    expect(uploadedJson).not.toContain('-26.19');
    expect(uploadedJson).not.toContain('28.03');
    expect(diagnostics.failures[0].testTitle).toContain('[REDACTED]');
    expect(diagnostics.failures[0].testTitle).toContain('[REDACTED_LOCATION]');
  });

  it('retains structural fixture phase, fixed exception category, and error source', () => {
    const diagnostics = buildSanitizedPlaywrightDiagnostics({
      failures: [
        {
          attachments: [],
          duration: 701,
          errorSource: {
            column: 14,
            file: '/runner/private/node_modules/playwright/browserType.js',
            line: 117,
          },
          exceptionCategory: 'browser-executable-missing',
          failedStep: {
            category: 'pw:api',
            title: 'Launch browser',
            titlePath: ['Before Hooks', 'Fixture "browser"', 'Launch browser'],
          },
          projectName: 'chromium',
          status: 'failed',
          testLocation: {
            column: 1,
            file: '/checkout/apps/web/playwright/basic.deterministic.spec.ts',
            line: 90,
          },
          testTitlePath: [
            'basic.deterministic.spec.ts',
            'canonical Basic journey',
          ],
        },
      ],
      format: 'wits-playwright-structural-v1',
      globalErrors: [],
    });

    expect(diagnostics.failures[0]).toMatchObject({
      errorColumn: 14,
      errorFile: 'browserType.js',
      errorLine: 117,
      exceptionCategory: 'browser-executable-missing',
      failureCategory: 'test-failure',
      failurePhase: 'fixture/setup',
      file: 'web/playwright/basic.deterministic.spec.ts',
      hookOrFixtureTitle: 'browser',
      line: 90,
      projectName: 'chromium',
      testTitle: 'basic.deterministic.spec.ts › canonical Basic journey',
    });
    expect(diagnostics.schemaVersion).toBe(3);
    expect(JSON.stringify(diagnostics)).not.toContain('/runner/private');
  });

  it('builds a raw structural failure without copying exception text or output', () => {
    const sensitive = [
      'accepted-answer-like-string',
      'player@example.test',
      'Naledi Private Player',
      'DOM text containing private challenge content',
      'lat=-26.19&lng=28.03',
      '[-26.19, 28.03]',
      'Authorization: Bearer private-auth-value',
      'cookie=private-session-cookie',
      'token=wits-world-private-test-token',
      'postgresql://owner:password@db.example/private',
    ].join('\n');
    const failure = createStructuralFailure(
      {
        location: {
          column: 1,
          file: 'C:/repo/basic.deterministic.spec.ts',
          line: 90,
        },
        parent: { project: () => ({ name: 'chromium' }) },
        titlePath: () => ['basic.deterministic.spec.ts', 'canonical journey'],
      },
      {
        attachments: [
          {
            body: sensitive,
            contentType: 'text/markdown',
            name: 'error-context',
            path: 'C:/private/error-context.md',
          },
        ],
        duration: 500,
        error: {
          message: `browserType.launch: Executable doesn't exist at ${sensitive}`,
          stack: `Error: ${sensitive}\n    at C:/repo/browserType.js:117:14`,
        },
        status: 'failed',
        stderr: [sensitive],
        stdout: [sensitive],
        steps: [],
      },
    );

    expect(failure).toMatchObject({
      exceptionCategory: 'browser-executable-missing',
      projectName: 'chromium',
    });
    expect(JSON.stringify(failure)).not.toContain(sensitive);
    expect(JSON.stringify(failure)).not.toContain('body');
    expect(JSON.stringify(failure)).not.toContain('stdout');
    expect(JSON.stringify(failure)).not.toContain('stderr');
  });

  it.each([
    [['Before Hooks', 'beforeAll hook'], 'beforeAll'],
    [['Before Hooks', 'beforeEach hook'], 'beforeEach'],
    [['Before Hooks', 'Fixture "page"'], 'fixture/setup'],
    [['test.step: deterministic action'], 'test-body'],
    [['After Hooks', 'afterEach hook'], 'afterEach'],
    [['After Hooks', 'afterAll hook'], 'afterAll'],
  ])(
    'derives the structural lifecycle phase from %j',
    (titlePath, expected) => {
      const diagnostics = buildSanitizedPlaywrightDiagnostics({
        failures: [
          {
            attachments: [],
            duration: 1,
            exceptionCategory: 'uncategorized-exception',
            failedStep: {
              category: titlePath[0].startsWith('test.step')
                ? 'test.step'
                : 'hook',
              title: titlePath.at(-1),
              titlePath,
            },
            status: 'failed',
            testTitlePath: ['safe test'],
          },
        ],
        format: 'wits-playwright-structural-v1',
        globalErrors: [],
      });

      expect(diagnostics.failures[0].failurePhase).toBe(expected);
    },
  );

  it.each([
    [
      "Executable doesn't exist at /cache/chromium",
      'browser-executable-missing',
    ],
    ['browserType.launch failed', 'browser-launch-failure'],
    ['connect ECONNREFUSED 127.0.0.1', 'connection-refused'],
    ['request ETIMEDOUT', 'network-timeout'],
    ['Target page, context or browser has been closed', 'browser-closed'],
  ])('maps known framework errors to %s', (message, expected) => {
    expect(classifyExceptionCategory({ message })).toBe(expected);
  });

  it.each([
    ['timedOut', 'timeout', 'The Playwright test timed out.'],
    ['interrupted', 'interrupted', 'The Playwright test was interrupted.'],
    [
      'failed',
      'test-failure',
      'The Playwright test failed outside an assertion.',
    ],
  ])(
    'maps %s results to a fixed failure category and reason',
    (status, failureCategory, failureReason) => {
      const diagnostics = buildSanitizedPlaywrightDiagnostics({
        suites: [
          {
            specs: [
              {
                title: 'fixed test title',
                tests: [
                  {
                    results: [
                      {
                        error: { message: 'arbitrary private runtime value' },
                        status,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      expect(diagnostics.failures[0]).toMatchObject({
        failureCategory,
        failureReason,
      });
      expect(JSON.stringify(diagnostics)).not.toContain(
        'arbitrary private runtime value',
      );
    },
  );

  it('captures global setup failures using only a fixed category and reason', () => {
    const diagnostics = buildSanitizedPlaywrightDiagnostics({
      errors: [
        {
          message:
            'API health failed for player@example.test at [-26.19, 28.03] token=private-value',
        },
      ],
      suites: [],
    });

    expect(diagnostics.failures).toEqual([
      {
        attachments: [],
        durationSeconds: 0,
        errorColumn: null,
        errorFile: null,
        errorLine: null,
        exceptionCategory: 'uncategorized-exception',
        failureCategory: 'runner-setup-failure',
        failureReason: 'Playwright setup or the test runner failed.',
        failurePhase: 'runner/web-server-setup',
        failingStep: null,
        file: null,
        hookOrFixtureTitle: null,
        line: null,
        projectName: null,
        testTitle: 'Playwright setup or runner',
      },
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('player@example.test');
    expect(JSON.stringify(diagnostics)).not.toContain('[-26.19, 28.03]');
    expect(JSON.stringify(diagnostics)).not.toContain('private-value');
  });
});
