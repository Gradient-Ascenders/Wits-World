// Exercise asset resolution when documentation is hosted below a path prefix.
export default function useBaseUrl(path: string): string {
  return `/preview${path}`;
}
