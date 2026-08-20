import { redirectToCanonicalHost } from './canonical-host';

if (!redirectToCanonicalHost(window.location)) {
  void import('./main');
}
