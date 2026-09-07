import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import type {
  CardEvolutionPreview,
  CardEvolutionResult,
  OwnedCard,
} from '../../api/cards';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import { CardEvolutionFlow } from './CardEvolutionFlow';
import { CollectibleCard } from './CollectibleCard';
import { CardSheetHandle } from './CardSheetHandle';

export function CardDetailModal({
  apiBaseUrl,
  getAccessToken,
  group,
  onApplyEvolutionResult,
  onClose,
  onRefreshCollection,
  evolutionPreview,
  collectionCards,
}: {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  group: { card: OwnedCard; copies: OwnedCard[] };
  onApplyEvolutionResult: (result: CardEvolutionResult) => void;
  onClose: () => void;
  onRefreshCollection: () => Promise<void>;
  evolutionPreview?: CardEvolutionPreview;
  collectionCards?: OwnedCard[];
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);
  const [isBusy, setIsBusy] = useState(false);
  const [actionContainer, setActionContainer] = useState<HTMLDivElement | null>(
    null,
  );

  const handleBusyChange = useCallback((busy: boolean) => {
    busyRef.current = busy;
    setIsBusy(busy);
  }, []);

  const requestClose = useCallback(() => {
    if (!busyRef.current) onClose();
  }, [onClose]);

  useEffect(() => {
    const applicationRoot = document.getElementById('root');
    const previousInert = applicationRoot?.inert ?? false;
    const previousOverflow = document.documentElement.style.overflow;
    const dialog = dialogRef.current;

    if (applicationRoot) applicationRoot.inert = true;
    document.documentElement.style.overflow = 'hidden';
    window.requestAnimationFrame(() => {
      if (dialog && !dialog.contains(document.activeElement)) {
        dialog.querySelector<HTMLElement>('[data-card-detail-focus]')?.focus();
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), summary, a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) => window.getComputedStyle(element).display !== 'none',
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (!focusable.includes(document.activeElement as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (applicationRoot) applicationRoot.inert = previousInert;
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [group.card.cardDefinitionId, requestClose]);

  return createPortal(
    <div
      className="card-detail-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        aria-label={
          evolutionPreview
            ? `${group.card.name} evolution`
            : `${group.card.name} card details`
        }
        aria-modal="true"
        className={`card-detail-modal${evolutionPreview ? ' evolution-surface' : ''}`}
        ref={dialogRef}
        role="dialog"
      >
        {!evolutionPreview ? (
          <CardSheetHandle
            panelRef={dialogRef}
            onClose={requestClose}
            disabled={isBusy}
          />
        ) : null}
        <header className="card-detail-modal__header">
          <p className="eyebrow">
            {evolutionPreview ? 'Evolution' : 'Card details'}
          </p>
          <button
            aria-label={
              evolutionPreview ? 'Close evolution' : 'Close card details'
            }
            className="card-detail-modal__close"
            data-card-detail-focus
            disabled={isBusy}
            onClick={requestClose}
            type="button"
          >
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="card-detail-modal__scroll" id="card-detail-content">
          {evolutionPreview ? (
            <CardEvolutionFlow
              actionContainer={actionContainer}
              apiBaseUrl={apiBaseUrl}
              card={group.card}
              copies={group.copies}
              getAccessToken={getAccessToken}
              onApplyResult={onApplyEvolutionResult}
              onBusyChange={handleBusyChange}
              onRefreshCollection={onRefreshCollection}
              initialPreview={evolutionPreview}
              collectionCards={collectionCards ?? []}
              onClose={onClose}
            />
          ) : (
            <CollectibleCard
              card={group.card}
              ownedCopies={group.copies}
              headingLevel={2}
            />
          )}
        </div>
        <div className="card-detail-modal__footer" ref={setActionContainer} />
      </section>
    </div>,
    document.body,
  );
}
