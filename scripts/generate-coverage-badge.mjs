import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const summaryPaths = [
  resolve('coverage/api/coverage-summary.json'),
  resolve('coverage/docs/coverage-summary.json'),
  resolve('coverage/web/coverage-summary.json'),
  resolve('coverage/account-policy/coverage-summary.json'),
  resolve('coverage/game-rules/coverage-summary.json'),
];

const lineTotals = await Promise.all(
  summaryPaths.map(async (summaryPath) => {
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    const { covered, total } = summary.total?.lines ?? {};

    if (!Number.isFinite(covered) || !Number.isFinite(total)) {
      throw new Error(`Missing line coverage totals in ${summaryPath}`);
    }

    return { covered, total };
  }),
);

const covered = lineTotals.reduce((sum, total) => sum + total.covered, 0);
const total = lineTotals.reduce((sum, lineTotal) => sum + lineTotal.total, 0);

if (total === 0) {
  throw new Error('Cannot generate a coverage badge from zero measured lines');
}

const percentage = (covered / total) * 100;
const displayPercentage = `${percentage.toFixed(1)}%`;
const color =
  percentage >= 90
    ? '#4c1'
    : percentage >= 80
      ? '#97ca00'
      : percentage >= 70
        ? '#dfb317'
        : '#e05d44';
const outputPath = resolve(process.argv[2] ?? 'coverage/coverage.svg');
const accessibleLabel = `coverage: ${displayPercentage}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="126" height="20" role="img" aria-label="${accessibleLabel}">
  <title>${accessibleLabel}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="126" height="20" rx="3"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="72" height="20" fill="#555"/>
    <rect x="72" width="54" height="20" fill="${color}"/>
    <rect width="126" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="36" y="15" fill="#010101" fill-opacity=".3">coverage</text>
    <text x="36" y="14">coverage</text>
    <text x="99" y="15" fill="#010101" fill-opacity=".3">${displayPercentage}</text>
    <text x="99" y="14">${displayPercentage}</text>
  </g>
</svg>
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, svg, 'utf8');

console.log(
  `Generated ${outputPath} with ${displayPercentage} line coverage (${covered}/${total})`,
);
