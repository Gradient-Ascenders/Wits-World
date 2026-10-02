import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import { useId, useRef, type Ref } from 'react';
import './fields.css';

interface SearchFieldProps {
  label: string;
  hideLabel?: boolean;
  className?: string;
  id?: string;
  placeholder?: string;
  title?: string;
  maxLength?: number;
  inputRef?: Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
}

export function SearchField({
  label,
  hideLabel = false,
  className = '',
  id,
  placeholder,
  title,
  maxLength,
  inputRef,
  value,
  onChange,
}: SearchFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const controlRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`shared-field shared-search ${className}`}>
      <label
        className={hideLabel ? 'sr-only' : 'shared-field__label'}
        htmlFor={inputId}
      >
        {label}
      </label>
      <div className="shared-search__control" ref={controlRef}>
        <MagnifyingGlassIcon size={20} aria-hidden="true" />
        <input
          className="shared-search__input"
          id={inputId}
          ref={inputRef}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          title={title}
          maxLength={maxLength}
        />
        {value ? (
          <button
            aria-label={`Clear ${label.toLowerCase()}`}
            className="shared-search__clear"
            onClick={() => {
              onChange('');
              controlRef.current?.querySelector('input')?.focus();
            }}
            type="button"
          >
            <XIcon size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
