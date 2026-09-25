import { useSyncExternalStore } from 'react';

export interface AccessibilityPreferences {
  speech: boolean;
  motion: 'system' | 'reduce' | 'full';
  contrast: 'standard' | 'high';
  scale: '100' | '125' | '150';
  reading: 'default' | 'comfortable';
  font: 'current' | 'plain';
}

export const defaultAccessibilityPreferences: AccessibilityPreferences = {
  speech: false,
  motion: 'system',
  contrast: 'standard',
  scale: '100',
  reading: 'default',
  font: 'current',
};

const STORAGE_KEY = 'wits-world.accessibility-preferences.v1';
const listeners = new Set<() => void>();
let current = defaultAccessibilityPreferences;
let initialized = false;
let saved = true;

function validChoice<T extends string>(
  value: unknown,
  choices: readonly T[],
  fallback: T,
): T {
  return choices.includes(value as T) ? (value as T) : fallback;
}

function parsePreferences(raw: string | null): AccessibilityPreferences {
  if (!raw) return defaultAccessibilityPreferences;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null)
      return defaultAccessibilityPreferences;
    const data = value as Record<string, unknown>;
    return {
      speech: data.speech === true,
      motion: validChoice(data.motion, ['system', 'reduce', 'full'], 'system'),
      contrast: validChoice(data.contrast, ['standard', 'high'], 'standard'),
      scale: validChoice(data.scale, ['100', '125', '150'], '100'),
      reading: validChoice(data.reading, ['default', 'comfortable'], 'default'),
      font: validChoice(data.font, ['current', 'plain'], 'current'),
    };
  } catch {
    return defaultAccessibilityPreferences;
  }
}

function applyPreferences(value: AccessibilityPreferences) {
  const root = document.documentElement;
  root.dataset.motion = value.motion;
  root.dataset.contrast = value.contrast;
  root.dataset.uiScale = value.scale;
  root.dataset.reading = value.reading;
  root.dataset.font = value.font;
}

function publish(value: AccessibilityPreferences) {
  current = value;
  applyPreferences(value);
  listeners.forEach((listener) => listener());
}

export function initializeAccessibilityPreferences() {
  if (initialized) return;
  initialized = true;
  try {
    current = parsePreferences(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    saved = false;
  }
  applyPreferences(current);
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      publish(parsePreferences(event.key === null ? null : event.newValue));
    }
  });
}

export function useAccessibilityPreferences(): AccessibilityPreferences {
  initializeAccessibilityPreferences();
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return current;
}

export function accessibilityPreferencesSaved() {
  return saved;
}

export function updateAccessibilityPreferences(
  patch: Partial<AccessibilityPreferences>,
) {
  initializeAccessibilityPreferences();
  const next = { ...current, ...patch };
  publish(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    saved = true;
  } catch {
    saved = false;
  }
}

export function resetAccessibilityPreferences() {
  initializeAccessibilityPreferences();
  publish(defaultAccessibilityPreferences);
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    saved = true;
  } catch {
    saved = false;
  }
}

export function prefersReducedMotion(): boolean {
  initializeAccessibilityPreferences();
  return (
    current.motion === 'reduce' ||
    (current.motion === 'system' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}
