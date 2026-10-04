import {
  accessibilityPreferencesSaved,
  resetAccessibilityPreferences,
  updateAccessibilityPreferences,
  useAccessibilityPreferences,
  type AccessibilityPreferences,
} from './preferences';
import { useState } from 'react';
import { SelectField } from '../components/fields/SelectField';

export function AccessibilitySettings() {
  const preferences = useAccessibilityPreferences();
  const [storageNotice, setStorageNotice] = useState('');

  function change<K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K],
  ) {
    updateAccessibilityPreferences({ [key]: value });
    setStorageNotice(
      accessibilityPreferencesSaved()
        ? 'Saved on this device.'
        : 'Could not save this choice. It applies until this page closes.',
    );
  }

  return (
    <section
      aria-labelledby="account-accessibility-title"
      className="account-page__section accessibility-settings"
    >
      <div className="account-section-heading">
        <h2 id="account-accessibility-title">Accessibility</h2>
        <p>Changes save automatically on this device.</p>
      </div>
      <div className="accessibility-settings__fields">
        <div className="accessibility-settings__field">
          <span className="accessibility-settings__label">
            <label htmlFor="account-speech">Read aloud</label>
            <small id="accessibility-speech-help">
              Adds a read-aloud button. Select it to start listening.
            </small>
          </span>
          <SelectField
            label="Read aloud"
            hideLabel
            id="account-speech"
            descriptionId="accessibility-speech-help"
            value={preferences.speech ? 'on' : 'off'}
            onChange={(value) => change('speech', value === 'on')}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'on', label: 'On' },
            ]}
          />
        </div>
        <div className="accessibility-settings__field">
          <span className="accessibility-settings__label">
            <label htmlFor="account-motion">Motion</label>
            <small id="accessibility-motion-help">
              Controls animations and map movement.
            </small>
          </span>
          <SelectField
            label="Motion"
            hideLabel
            id="account-motion"
            descriptionId="accessibility-motion-help"
            value={preferences.motion}
            onChange={(value) =>
              change('motion', value as AccessibilityPreferences['motion'])
            }
            options={[
              { value: 'system', label: 'Use device setting' },
              { value: 'reduce', label: 'Reduce motion' },
              { value: 'full', label: 'Full motion' },
            ]}
          />
        </div>
        <div className="accessibility-settings__field">
          <span className="accessibility-settings__label">
            <label htmlFor="account-contrast">Contrast</label>
          </span>
          <SelectField
            label="Contrast"
            hideLabel
            id="account-contrast"
            value={preferences.contrast}
            onChange={(value) =>
              change('contrast', value as AccessibilityPreferences['contrast'])
            }
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'high', label: 'High contrast' },
            ]}
          />
        </div>
        <div className="accessibility-settings__field">
          <span className="accessibility-settings__label">
            <label htmlFor="account-scale">Interface size</label>
          </span>
          <SelectField
            label="Interface size"
            hideLabel
            id="account-scale"
            value={preferences.scale}
            onChange={(value) =>
              change('scale', value as AccessibilityPreferences['scale'])
            }
            options={[
              { value: '100', label: '100%' },
              { value: '125', label: '125%' },
              { value: '150', label: '150%' },
            ]}
          />
        </div>
        <div className="accessibility-settings__field">
          <span className="accessibility-settings__label">
            <label htmlFor="account-reading">Reading layout</label>
            <small id="accessibility-reading-help">
              Comfortable adds spacing and shorter lines.
            </small>
          </span>
          <SelectField
            label="Reading layout"
            hideLabel
            id="account-reading"
            descriptionId="accessibility-reading-help"
            value={preferences.reading}
            onChange={(value) =>
              change('reading', value as AccessibilityPreferences['reading'])
            }
            options={[
              { value: 'default', label: 'Default' },
              { value: 'comfortable', label: 'Comfortable' },
            ]}
          />
        </div>
        <div className="accessibility-settings__field">
          <span className="accessibility-settings__label">
            <label htmlFor="account-font">Font</label>
          </span>
          <SelectField
            label="Font"
            hideLabel
            id="account-font"
            value={preferences.font}
            onChange={(value) =>
              change('font', value as AccessibilityPreferences['font'])
            }
            options={[
              { value: 'current', label: 'Current' },
              { value: 'plain', label: 'Plain sans-serif' },
            ]}
          />
        </div>
      </div>
      <div className="accessibility-settings__footer">
        <button
          className="button button--quiet"
          onClick={() => {
            resetAccessibilityPreferences();
            setStorageNotice(
              accessibilityPreferencesSaved()
                ? 'Defaults restored.'
                : 'Defaults restored for this page, but could not be saved.',
            );
          }}
          type="button"
        >
          Reset to defaults
        </button>
        <p
          aria-live="polite"
          className="accessibility-settings__notice"
          role="status"
        >
          {storageNotice}
        </p>
      </div>
    </section>
  );
}
