import { parseAuthorWorkspaceRoute } from './author-routing';

export const loadEventWorkspace = () => import('./EventWorkspace');
export const loadCardWorkspace = () => import('./CardWorkspace');
export const loadCampaignWorkspace = () => import('./CampaignWorkspace');
export const loadAnalyticsWorkspace = () => import('./AnalyticsWorkspace');
export const loadTrustReviewWorkspace = () => import('./TrustReviewWorkspace');
export const loadEventPlacementWorkspace = () =>
  import('./EventPlacementWorkspace');
export const loadReviewWorkspace = () => import('./ReviewWorkspace');

// Start only the destination's code beside the console and identity checks.
// This does not mount a workspace or start any protected data requests.
export function prepareAuthorWorkspace(pathname: string) {
  const section = parseAuthorWorkspaceRoute(pathname).section;
  switch (section) {
    case 'events':
      return loadEventWorkspace();
    case 'cards':
      return loadCardWorkspace();
    case 'campaigns':
      return loadCampaignWorkspace();
    case 'analytics':
      return loadAnalyticsWorkspace();
    case 'playerReview':
      return loadTrustReviewWorkspace();
    case 'placement':
      return loadEventPlacementWorkspace();
    case 'review':
      return loadReviewWorkspace();
  }
}
