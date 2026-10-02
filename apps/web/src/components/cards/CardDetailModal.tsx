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
import { CardPresentationDialog } from './CardPresentationDialog';

interface CardDetailModalProps {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  group: { card: OwnedCard; copies: OwnedCard[] };
  onApplyEvolutionResult: (result: CardEvolutionResult) => void;
  onClose: () => void;
  onRefreshCollection: () => Promise<void>;
  evolutionPreview?: CardEvolutionPreview;
  collectionCards?: OwnedCard[];
}

export function CardDetailModal({
  apiBaseUrl,
  getAccessToken,
  group,
  onApplyEvolutionResult,
  onClose,
  onRefreshCollection,
  evolutionPreview,
  collectionCards,
}: CardDetailModalProps) {
  if (!evolutionPreview) {
    return <CardPresentationDialog card={group.card} onClose={onClose} />;
  }

  return (
    <EvolutionCardDetailModal
      apiBaseUrl={apiBaseUrl}
      collectionCards={collectionCards}
      evolutionPreview={evolutionPreview}
      getAccessToken={getAccessToken}
      group={group}
      onApplyEvolutionResult={onApplyEvolutionResult}
      onClose={onClose}
      onRefreshCollection={onRefreshCollection}
    />
  );
}

function EvolutionCardDetailModal({
  apiBaseUrl,
  getAccessToken,
  group,
  onApplyEvolutionResult,
  onClose,
  onRefreshCollection,
  evolutionPreview,
  collectionCards,
}: CardDetailModalProps & { evolutionPreview: CardEvolutionPreview }) {
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
      const activeDialog =
        dialog?.querySelector<HTMLElement>('[role="alertdialog"]') ?? dialog;
      if (event.key === 'Escape') {
        if (activeDialog !== dialog) return;
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== 'Tab' || !activeDialog) return;
      const focusable = Array.from(
        activeDialog.querySelectorAll<HTMLElement>(
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
      className="card-detail-backdrop card-detail-backdrop--evolution"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        aria-label={`${group.card.name} evolution`}
        aria-modal="true"
        className="card-detail-modal evolution-surface"
        ref={dialogRef}
        role="dialog"
      >
        <header className="card-detail-modal__header">
          <p className="eyebrow">Evolution</p>
          <button
            aria-label="Close evolution"
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
        </div>
        <div className="card-detail-modal__footer" ref={setActionContainer} />
      </section>
    </div>,
    document.body,
  );
}
