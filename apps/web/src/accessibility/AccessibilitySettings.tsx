import {
  accessibilityPreferencesSaved,
  resetAccessibilityPreferences,
  updateAccessibilityPreferences,
  useAccessibilityPreferences,
  type AccessibilityPreferences,
} from './preferences';
import { useState } from 'react';

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
        ? 'Accessibility preference saved on this device.'
        : 'This browser could not save your choice. It will last until this page closes.',
    );
  }

  return (
    <section
      aria-labelledby="account-accessibility-title"
      className="account-page__section"
    >
      <h2 id="account-accessibility-title">Accessibility</h2>
      <div className="account-profile-card accessibility-settings">
        <p>Choose how Wits World looks and reads on this device.</p>
        <label className="accessibility-settings__field">
          <span>Read aloud</span>
          <small id="accessibility-speech-help">
            Show a speaker control to read the page. Speech starts only when you
            select it.
          </small>
          <select
            aria-label="Read aloud"
            aria-describedby="accessibility-speech-help"
            value={preferences.speech ? 'on' : 'off'}
            onChange={(event) => change('speech', event.target.value === 'on')}
          >
            <option value="off">Off</option>
            <option value="on">On</option>
          </select>
        </label>
        <label className="accessibility-settings__field">
          <span>Motion</span>
          <small id="accessibility-motion-help">
            Reduce animations and map camera movement.
          </small>
          <select
            aria-label="Motion"
            aria-describedby="accessibility-motion-help"
            value={preferences.motion}
            onChange={(event) =>
              change(
                'motion',
                event.target.value as AccessibilityPreferences['motion'],
              )
            }
          >
            <option value="system">Use device setting</option>
            <option value="reduce">Reduce motion</option>
            <option value="full">Full motion</option>
          </select>
        </label>
        <label className="accessibility-settings__field">
          <span>Contrast</span>
          <select
            value={preferences.contrast}
            onChange={(event) =>
              change(
                'contrast',
                event.target.value as AccessibilityPreferences['contrast'],
              )
            }
          >
            <option value="standard">Standard</option>
            <option value="high">High contrast</option>
          </select>
        </label>
        <label className="accessibility-settings__field">
          <span>Interface size</span>
          <select
            value={preferences.scale}
            onChange={(event) =>
              change(
                'scale',
                event.target.value as AccessibilityPreferences['scale'],
              )
            }
          >
            <option value="100">100%</option>
            <option value="125">125%</option>
            <option value="150">150%</option>
          </select>
        </label>
        <label className="accessibility-settings__field">
          <span>Reading layout</span>
          <small id="accessibility-reading-help">
            Comfortable adds spacing and shortens long lines of text.
          </small>
          <select
            aria-label="Reading layout"
            aria-describedby="accessibility-reading-help"
            value={preferences.reading}
            onChange={(event) =>
              change(
                'reading',
                event.target.value as AccessibilityPreferences['reading'],
              )
            }
          >
            <option value="default">Default</option>
            <option value="comfortable">Comfortable</option>
          </select>
        </label>
        <label className="accessibility-settings__field">
          <span>Font</span>
          <select
            value={preferences.font}
            onChange={(event) =>
              change(
                'font',
                event.target.value as AccessibilityPreferences['font'],
              )
            }
          >
            <option value="current">Current</option>
            <option value="plain">Plain sans-serif</option>
          </select>
        </label>
        <button
          className="button button--quiet"
          onClick={() => {
            resetAccessibilityPreferences();
            setStorageNotice(
              accessibilityPreferencesSaved()
                ? 'Accessibility preferences reset to defaults.'
                : 'Preferences reset for this page. This browser could not save the reset.',
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
