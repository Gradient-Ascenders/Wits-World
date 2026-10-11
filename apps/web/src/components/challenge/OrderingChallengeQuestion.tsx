import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { ArrowDown, ArrowUp, DotsSixVertical } from '@phosphor-icons/react';

import type { OrderingChallengeQuestion as OrderingQuestionData } from '../../api/challenges';

interface OrderingChallengeQuestionProps {
  compact?: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
  isSubmitting: boolean;
  itemIds: string[];
  onOrderChange: (itemIds: string[]) => void;
  onSubmit: () => void;
  question: OrderingQuestionData;
  totalQuestions: number;
}

interface ActivePointer {
  itemId: string;
  pointerId: number;
}

export function OrderingChallengeQuestion({
  compact = false,
  headingRef,
  isSubmitting,
  itemIds,
  onOrderChange,
  onSubmit,
  question,
  totalQuestions,
}: OrderingChallengeQuestionProps) {
  const questionId = `challenge-question-${question.attemptQuestionId}`;
  const instructionId = `${questionId}-instruction`;
  const [announcement, setAnnouncement] = useState('');
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const activePointer = useRef<ActivePointer | null>(null);
  const orderRef = useRef(itemIds);

  useLayoutEffect(() => {
    orderRef.current = itemIds;
  }, [itemIds]);

  const itemsById = new Map(
    question.items.map((item) => [item.itemId, item] as const),
  );
  const orderedItems = itemIds.flatMap((itemId) => {
    const item = itemsById.get(itemId);
    return item ? [item] : [];
  });

  function describeOrder(ids: readonly string[]): string {
    return ids
      .map((itemId, index) => {
        const item = itemsById.get(itemId);
        return `${index + 1}, ${item?.text ?? 'Unknown item'}`;
      })
      .join('; ');
  }

  function moveItem(itemId: string, targetIndex: number, announce = true) {
    const current = orderRef.current;
    const currentIndex = current.indexOf(itemId);

    if (
      currentIndex === -1 ||
      targetIndex < 0 ||
      targetIndex >= current.length ||
      targetIndex === currentIndex
    ) {
      return;
    }

    const next = [...current];
    next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, itemId);
    orderRef.current = next;
    onOrderChange(next);

    if (announce) {
      const item = itemsById.get(itemId);
      setAnnouncement(
        `${item?.text ?? 'Item'} moved to position ${targetIndex + 1} of 4. Current order: ${describeOrder(next)}.`,
      );
    }
  }

  function startPointerMove(
    event: ReactPointerEvent<HTMLSpanElement>,
    itemId: string,
  ) {
    if (isSubmitting) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activePointer.current = { itemId, pointerId: event.pointerId };
    setDraggingItemId(itemId);
    const item = itemsById.get(itemId);
    setAnnouncement(
      `Moving ${item?.text ?? 'item'} from position ${orderRef.current.indexOf(itemId) + 1} of 4.`,
    );
  }

  function movePointerOverItem(itemId: string) {
    const active = activePointer.current;
    if (!active || active.itemId === itemId) return;
    const targetIndex = orderRef.current.indexOf(itemId);
    moveItem(active.itemId, targetIndex, false);
  }

  function trackPointer(event: ReactPointerEvent<HTMLOListElement>) {
    const active = activePointer.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-order-item-id]');
    const targetItemId = target?.dataset.orderItemId;
    if (targetItemId) movePointerOverItem(targetItemId);
  }

  function finishPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const active = activePointer.current;
    if (!active || active.pointerId !== event.pointerId) return;
    activePointer.current = null;
    setDraggingItemId(null);
    const item = itemsById.get(active.itemId);
    const finalPosition = orderRef.current.indexOf(active.itemId) + 1;
    setAnnouncement(
      `${item?.text ?? 'Item'} placed at position ${finalPosition} of 4. Current order: ${describeOrder(orderRef.current)}.`,
    );
  }

  return (
    <section aria-labelledby={questionId} className="challenge-question">
      <p className="eyebrow">
        Question {question.position} of {totalQuestions}
      </p>
      <h2 id={questionId} ref={headingRef} tabIndex={-1}>
        {question.prompt}
      </h2>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <fieldset disabled={isSubmitting}>
          <legend id={instructionId}>
            Arrange the items from first to last
          </legend>
          <p className="challenge-ordering__instruction">
            {compact
              ? 'Drag to reorder, or use the up and down buttons.'
              : 'Drag an item, or use its Move Up and Move Down controls. The numbered list is your current order.'}
          </p>
          <div aria-live="polite" className="sr-only" role="status">
            {announcement}
          </div>
          <ol
            aria-describedby={instructionId}
            aria-label="Current order"
            className={`challenge-ordering${compact ? ' challenge-ordering--compact' : ''}`}
            onPointerCancel={finishPointerMove}
            onPointerMove={trackPointer}
            onPointerUp={finishPointerMove}
          >
            {orderedItems.map((item, index) => (
              <li
                className={`challenge-ordering__item${draggingItemId === item.itemId ? ' challenge-ordering__item--dragging' : ''}`}
                data-order-item-id={item.itemId}
                key={item.itemId}
                onPointerEnter={() => movePointerOverItem(item.itemId)}
              >
                <span
                  aria-hidden="true"
                  className="challenge-ordering__drag-handle"
                  onPointerDown={(event) =>
                    startPointerMove(event, item.itemId)
                  }
                >
                  {compact ? <DotsSixVertical size={20} /> : 'Drag'}
                </span>
                <span className="challenge-ordering__position">
                  {index + 1}
                </span>
                <span className="challenge-ordering__text">{item.text}</span>
                <span className="challenge-ordering__controls">
                  <button
                    aria-label={`Move ${item.text} up from position ${index + 1}`}
                    className="button button--quiet"
                    disabled={index === 0 || isSubmitting}
                    onClick={() => moveItem(item.itemId, index - 1)}
                    type="button"
                  >
                    {compact ? (
                      <ArrowUp aria-hidden="true" size={18} />
                    ) : (
                      'Move up'
                    )}
                  </button>
                  <button
                    aria-label={`Move ${item.text} down from position ${index + 1}`}
                    className="button button--quiet"
                    disabled={index === orderedItems.length - 1 || isSubmitting}
                    onClick={() => moveItem(item.itemId, index + 1)}
                    type="button"
                  >
                    {compact ? (
                      <ArrowDown aria-hidden="true" size={18} />
                    ) : (
                      'Move down'
                    )}
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </fieldset>

        <button
          className="button challenge-question__submit"
          disabled={itemIds.length !== 4 || isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Saving order…' : 'Submit order'}
        </button>
      </form>
    </section>
  );
}
