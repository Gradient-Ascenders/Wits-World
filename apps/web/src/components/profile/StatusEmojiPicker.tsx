import {
  CheckIcon,
  MagnifyingGlassIcon,
  SmileyIcon,
} from '@phosphor-icons/react';
import emojis from 'emojilib/emojis.json';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

const choices = Object.entries(emojis)
  .filter(([, emoji]) => emoji.char && emoji.char.length <= 16)
  .map(([name, emoji]) => ({
    name,
    char: emoji.char,
    search: `${name} ${emoji.keywords.join(' ')} ${emoji.char}`
      .toLowerCase()
      .replaceAll('_', ' '),
  }));

export function StatusEmojiPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  return (
    <div
      className="status-emoji-field"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <span className="status-emoji-label">Emoji</span>
      <button
        className="status-emoji-trigger"
        type="button"
        aria-label="Choose status emoji"
        aria-expanded={open && !disabled}
        aria-controls={open && !disabled ? id : undefined}
        disabled={disabled}
        ref={trigger}
        onClick={() => setOpen((previous) => !previous)}
      >
        {value ? (
          <span aria-hidden="true">{value}</span>
        ) : (
          <SmileyIcon size={24} aria-hidden="true" />
        )}
      </button>
      {open && !disabled ? (
        <EmojiMenu
          id={id}
          value={value}
          anchor={trigger.current}
          onSelect={(emoji) => {
            onChange(emoji);
            close();
          }}
        />
      ) : null}
    </div>
  );
}

function EmojiMenu({
  id,
  value,
  anchor,
  onSelect,
}: {
  id: string;
  value: string;
  anchor: HTMLButtonElement | null;
  onSelect: (emoji: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const activeOption = useRef<HTMLButtonElement>(null);
  const terms = query.toLowerCase().trim().replaceAll('_', ' ').split(/\s+/);
  const filtered = choices.filter((emoji) =>
    terms.every((term) => emoji.search.includes(term)),
  );
  const active = filtered[activeIndex];

  useLayoutEffect(() => {
    function position() {
      if (!menu.current || !anchor) return;
      const bounds = anchor.getBoundingClientRect();
      const panel = menu.current;
      const gutter = 16;
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + gutter;
      const topEdge = (viewport?.offsetTop ?? 0) + gutter;
      const rightEdge =
        leftEdge + (viewport?.width ?? window.innerWidth) - gutter * 2;
      const bottomEdge =
        topEdge + (viewport?.height ?? window.innerHeight) - gutter * 2;
      panel.style.width = `${Math.min(288, rightEdge - leftEdge)}px`;
      panel.style.maxHeight = `${bottomEdge - topEdge}px`;
      const height = panel.getBoundingClientRect().height;
      const below = bounds.bottom + 8;
      const top =
        below + height <= bottomEdge
          ? below
          : bounds.top - height - 8 >= topEdge
            ? bounds.top - height - 8
            : Math.max(topEdge, bottomEdge - height);
      panel.style.top = `${top}px`;
      panel.style.left = `${Math.max(leftEdge, Math.min(bounds.left, rightEdge - panel.getBoundingClientRect().width))}px`;
    }
    position();
    input.current?.focus();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [anchor]);

  useEffect(() => {
    activeOption.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, query]);

  return (
    <div
      className="status-emoji-menu"
      id={id}
      ref={menu}
      role="group"
      aria-label="Select an emoji"
    >
      <div className="status-emoji-menu-heading" id={`${id}-heading`}>
        Select an emoji
      </div>
      <div className="status-emoji-search">
        <MagnifyingGlassIcon size={18} aria-hidden="true" />
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label="Filter emojis"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-activedescendant={active ? `${id}-${active.name}` : undefined}
          placeholder="Filter emojis"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (
              ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) &&
              filtered.length
            ) {
              if (
                (event.key === 'Home' || event.key === 'End') &&
                !event.ctrlKey
              )
                return;
              event.preventDefault();
              if (event.key === 'Home') setActiveIndex(0);
              else if (event.key === 'End') setActiveIndex(filtered.length - 1);
              else
                setActiveIndex(
                  (index) =>
                    (index +
                      (event.key === 'ArrowDown' ? 1 : -1) +
                      filtered.length) %
                    filtered.length,
                );
            } else if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              if (active) onSelect(active.char);
            }
          }}
        />
      </div>
      <div
        className="status-emoji-options"
        id={`${id}-list`}
        role="listbox"
        aria-labelledby={`${id}-heading`}
      >
        {filtered.map((emoji, index) => (
          <button
            type="button"
            role="option"
            aria-label={emoji.name}
            aria-selected={value === emoji.char}
            className="status-emoji-option"
            data-active={index === activeIndex}
            key={emoji.name}
            id={`${id}-${emoji.name}`}
            ref={index === activeIndex ? activeOption : undefined}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(emoji.char)}
          >
            <span className="status-emoji-glyph" aria-hidden="true">
              {emoji.char}
            </span>
            <span>{emoji.name}</span>
            {value === emoji.char ? (
              <CheckIcon size={16} aria-hidden="true" />
            ) : null}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="status-emoji-empty" role="status">
          No emojis found. Try another search.
        </p>
      ) : null}
      <button
        className="button button--quiet status-emoji-clear"
        type="button"
        onClick={() => onSelect('')}
      >
        Clear emoji
      </button>
    </div>
  );
}
