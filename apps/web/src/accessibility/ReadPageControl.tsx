import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, SpeakerHigh, Stop } from '@phosphor-icons/react';
import { useAccessibilityPreferences } from './preferences';

type SpeechState = 'idle' | 'speaking' | 'paused' | 'unavailable' | 'error';

const EXCLUDED =
  '[aria-hidden="true"], [hidden], [inert], .sr-only, [data-read-aloud-control], script, style, svg, input, textarea, select, [role="timer"]';
const READABLE_TEXT_DEBOUNCE_MS = 50;
const READABLE_STATE_ATTRIBUTES = [
  'aria-busy',
  'aria-hidden',
  'class',
  'hidden',
  'inert',
  'open',
  'style',
];

function isRendered(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    const style = getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    current = current.parentElement;
  }
  return true;
}

function visibleText(root: Element): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    const value = node.textContent?.replace(/\s+/gu, ' ').trim();
    if (!parent || !value || parent.closest(EXCLUDED)) continue;
    const closedDetails = parent.closest('details:not([open])');
    if (closedDetails && !parent.closest('summary')) continue;
    if (parent.closest('[aria-busy="true"]')) continue;
    if (isRendered(parent)) parts.push(value);
  }
  return parts.join(' ').replace(/\s+/gu, ' ').trim();
}

export function readablePageText(main: Element): string {
  const navigation = [
    ...document.querySelectorAll('nav[aria-label="Player"]'),
  ].find(isRendered);
  const navText = navigation ? visibleText(navigation) : '';
  const mainText = visibleText(main);
  return [navText && `Navigation. ${navText}.`, mainText]
    .filter(Boolean)
    .join(' ');
}

function chunks(text: string): string[] {
  const result: string[] = [];
  const words = text.split(/\s+/u);
  let current = '';
  for (const word of words) {
    if (current.length + word.length > 400 && current) {
      result.push(current);
      current = '';
    }
    current += `${current ? ' ' : ''}${word}`;
  }
  if (current) result.push(current);
  return result;
}

export function ReadPageControl({
  main,
  pathname,
}: {
  main: React.RefObject<HTMLElement | null>;
  pathname: string;
}) {
  const { speech } = useAccessibilityPreferences();
  const [state, setState] = useState<SpeechState>('idle');
  const run = useRef(0);
  const spokenText = useRef('');

  const stop = useCallback(() => {
    run.current += 1;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    spokenText.current = '';
    setState('idle');
  }, []);

  useEffect(() => {
    return () => {
      run.current += 1;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [pathname, speech]);

  useEffect(() => {
    if (state !== 'speaking' && state !== 'paused') return;
    const target = main.current;
    if (!target) return;
    let updateTimer: number | undefined;
    const observer = new MutationObserver(() => {
      window.clearTimeout(updateTimer);
      updateTimer = window.setTimeout(() => {
        if (readablePageText(target) !== spokenText.current) stop();
      }, READABLE_TEXT_DEBOUNCE_MS);
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: READABLE_STATE_ATTRIBUTES,
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      window.clearTimeout(updateTimer);
    };
  }, [main, state, stop]);

  if (!speech) return null;

  function start() {
    const target = main.current;
    if (!target) return;
    if (
      !('speechSynthesis' in window) ||
      !('SpeechSynthesisUtterance' in window)
    ) {
      setState('unavailable');
      return;
    }
    const text = readablePageText(target);
    if (!text) {
      setState('unavailable');
      return;
    }
    const synthesis = window.speechSynthesis;
    synthesis.cancel();
    spokenText.current = text;
    const list = chunks(text);
    const id = ++run.current;
    let index = 0;
    const speakNext = () => {
      if (run.current !== id) return;
      if (index >= list.length) {
        spokenText.current = '';
        setState('idle');
        return;
      }
      const utterance = new SpeechSynthesisUtterance(list[index++]);
      utterance.onend = speakNext;
      utterance.onerror = () => {
        if (run.current === id) setState('error');
      };
      synthesis.speak(utterance);
    };
    setState('speaking');
    speakNext();
  }

  return (
    <div
      className="read-page-control"
      data-read-aloud-control=""
      data-state={state}
      role="group"
      aria-label="Read aloud"
    >
      {state === 'idle' || state === 'error' || state === 'unavailable' ? (
        <button
          aria-label="Read page"
          className="read-page-control__button"
          onClick={start}
          title="Read page"
          type="button"
        >
          <SpeakerHigh aria-hidden="true" size={22} weight="bold" />
        </button>
      ) : (
        <>
          <button
            aria-label={state === 'paused' ? 'Resume reading' : 'Pause reading'}
            className="read-page-control__button"
            onClick={() => {
              if (state === 'paused') {
                window.speechSynthesis.resume();
                setState('speaking');
              } else {
                window.speechSynthesis.pause();
                setState('paused');
              }
            }}
            title={state === 'paused' ? 'Resume reading' : 'Pause reading'}
            type="button"
          >
            {state === 'paused' ? (
              <Play aria-hidden="true" size={20} weight="fill" />
            ) : (
              <Pause aria-hidden="true" size={20} weight="fill" />
            )}
          </button>
          <button
            aria-label="Stop reading"
            className="read-page-control__button"
            onClick={stop}
            title="Stop reading"
            type="button"
          >
            <Stop aria-hidden="true" size={20} weight="fill" />
          </button>
        </>
      )}
      {(state === 'unavailable' || state === 'error') && (
        <span className="read-page-control__status" role="status">
          {state === 'unavailable'
            ? 'Read aloud is unavailable in this browser.'
            : 'Speech stopped. Try again.'}
        </span>
      )}
    </div>
  );
}
