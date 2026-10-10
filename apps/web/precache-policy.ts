import type { Plugin } from 'vite';

interface ShellEntry {
  url: string;
  revision: string | null;
  precache?: false;
}

// These routes implement the documented prepared-challenge offline journey.
// Follow their emitted static dependencies, rather than guessing chunk names.
const offlineRoots = [
  '/src/main.tsx',
  '/src/pages/HomePage.tsx',
  '/src/offline/OfflinePages.tsx',
];

export function createPrecachePolicy() {
  let requiredScripts: Set<string> | undefined;
  const plugin: Plugin = {
    name: 'wits-world-offline-shell',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(
        (output) => output.type === 'chunk',
      );
      const roots = offlineRoots.map((path) => {
        const chunk = chunks.find((output) =>
          output.facadeModuleId?.replaceAll('\\', '/').endsWith(path),
        );
        if (!chunk) throw new Error(`Missing offline build root: ${path}`);
        return chunk.fileName;
      });
      const scripts = new Set<string>();
      function visit(fileName: string) {
        if (scripts.has(fileName)) return;
        const chunk = bundle[fileName];
        if (!chunk || chunk.type !== 'chunk')
          throw new Error(`Missing offline build dependency: ${fileName}`);
        scripts.add(fileName);
        chunk.imports.forEach(visit);
      }
      [
        ...roots,
        ...chunks
          .filter((chunk) => chunk.isEntry)
          .map((chunk) => chunk.fileName),
      ].forEach(visit);
      requiredScripts = scripts;
    },
  };

  async function transform<T extends ShellEntry>(manifest: T[]) {
    if (!requiredScripts) throw new Error('Offline build graph is unavailable');
    const entries = new Map<string, T & ShellEntry>();
    for (const entry of manifest) {
      const previous = entries.get(entry.url);
      if (previous && previous.revision !== entry.revision)
        throw new Error('Conflicting shell asset revisions');
      entries.set(entry.url, {
        ...entry,
        // Retain the existing CSS, font, branding and campus artwork coverage.
        ...(/\.js$/.test(entry.url) && !requiredScripts.has(entry.url)
          ? { precache: false as const }
          : {}),
      });
    }
    for (const script of requiredScripts) {
      if (!entries.has(script))
        throw new Error(
          `Offline script is outside the shell manifest: ${script}`,
        );
    }
    return { manifest: [...entries.values()], warnings: [] };
  }
  return { plugin, transform };
}
