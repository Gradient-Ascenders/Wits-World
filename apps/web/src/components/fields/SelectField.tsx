import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react';
import {
  Button,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
  Text,
} from 'react-aria-components';
import './fields.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectFieldProps {
  label: string;
  hideLabel?: boolean;
  className?: string;
  id?: string;
  disabled?: boolean;
  error?: string;
  preserveRouteFocus?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
}

export function SelectField({
  label,
  hideLabel = false,
  className = '',
  id,
  disabled,
  error,
  preserveRouteFocus,
  value,
  onChange,
  options,
}: SelectFieldProps) {
  return (
    <Select
      className={`shared-field shared-select ${className}`}
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
      value={`option:${value}`}
      onChange={(key) => {
        const option = options.find((item) => `option:${item.value}` === key);
        if (option) onChange(option.value);
      }}
    >
      <Label className={hideLabel ? 'sr-only' : 'shared-field__label'}>
        {label}
      </Label>
      <Button
        className="shared-select__trigger"
        id={id}
        render={(props) => (
          <button {...props} aria-invalid={Boolean(error) || undefined} />
        )}
        data-route-focus={preserveRouteFocus ? 'preserve' : undefined}
      >
        <SelectValue className="shared-select__value" />
        <CaretDownIcon size={16} aria-hidden="true" />
      </Button>
      <Popover
        className="shared-select__popover"
        placement="bottom start"
        offset={6}
      >
        <ListBox
          className="shared-select__list"
          items={options}
          data-route-focus={preserveRouteFocus ? 'preserve' : undefined}
        >
          {(option) => (
            <ListBoxItem
              className="shared-select__option"
              id={`option:${option.value}`}
              textValue={option.label}
              isDisabled={option.disabled}
            >
              {({ isSelected }) => (
                <>
                  <Text slot="label">{option.label}</Text>
                  {isSelected ? (
                    <CheckIcon size={16} aria-hidden="true" />
                  ) : null}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
      {error ? (
        <FieldError className="shared-field__error">{error}</FieldError>
      ) : null}
    </Select>
  );
}
