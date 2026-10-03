import {
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from '@phosphor-icons/react';
import { parseDateTime } from '@internationalized/date';
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  FieldError,
  Group,
  Heading,
  I18nProvider,
  Label,
  Popover,
} from 'react-aria-components';
import { toAppDateTimeLocal } from '../../date-time';
import './author-date-time-picker.css';

interface AuthorDateTimePickerProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

/** Values remain campus wall-clock strings; the event form owns conversion to UTC. */
export function AuthorDateTimePicker({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
}: AuthorDateTimePickerProps) {
  return (
    <I18nProvider locale="en-ZA">
      <DatePicker
        className="author-date-picker form-field"
        id={id}
        value={value ? parseDateTime(value) : null}
        onChange={(date) => onChange(date ? date.toString().slice(0, 16) : '')}
        placeholderValue={parseDateTime(
          toAppDateTimeLocal(new Date().toISOString()),
        )}
        granularity="minute"
        hourCycle={24}
        isRequired
        isDisabled={disabled}
        isInvalid={Boolean(error)}
        validationBehavior="aria"
        shouldForceLeadingZeros
      >
        <Label>{label}</Label>
        <Group className="author-date-picker__control">
          <DateInput className="author-date-picker__input">
            {(segment) => (
              <DateSegment
                segment={segment}
                className="author-date-picker__segment"
              />
            )}
          </DateInput>
          <Button
            className="author-date-picker__trigger"
            aria-label={`Choose ${label.toLowerCase()} date`}
          >
            <CalendarBlankIcon size={20} aria-hidden="true" />
          </Button>
        </Group>
        <FieldError className="field-error">{error}</FieldError>
        <Popover
          className="author-date-picker__popover"
          placement="bottom start"
          offset={8}
        >
          <Dialog className="author-date-picker__dialog">
            <Calendar className="author-date-picker__calendar">
              <header>
                <Heading />
                <Button
                  slot="previous"
                  aria-label="Previous month"
                  className="author-date-picker__month-button"
                >
                  <CaretLeftIcon size={18} aria-hidden="true" />
                </Button>
                <Button
                  slot="next"
                  aria-label="Next month"
                  className="author-date-picker__month-button"
                >
                  <CaretRightIcon size={18} aria-hidden="true" />
                </Button>
              </header>
              <CalendarGrid className="author-date-picker__grid">
                <CalendarGridHeader>
                  {(day) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
                </CalendarGridHeader>
                <CalendarGridBody>
                  {(date) => (
                    <CalendarCell
                      date={date}
                      className="author-date-picker__day"
                    />
                  )}
                </CalendarGridBody>
              </CalendarGrid>
            </Calendar>
            <p className="author-date-picker__zone">Johannesburg · UTC+02:00</p>
          </Dialog>
        </Popover>
      </DatePicker>
    </I18nProvider>
  );
}
