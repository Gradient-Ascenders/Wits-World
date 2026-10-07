import { redirectToCanonicalHost } from './canonical-host';
import { bootApplication } from './boot-recovery';

if (!redirectToCanonicalHost(window.location)) {
  void bootApplication(document.getElementById('root'), () => import('./main'));
}
