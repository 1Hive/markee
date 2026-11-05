import assert from 'node:assert/strict';
import test from 'node:test';
import { createThemeController } from '../src/theme';

test('warning colors override either palette and reset to defaults when removed', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'CSS');
  Object.defineProperty(globalThis, 'CSS', { configurable: true, value: { supports: () => true } });
  try {
    const properties = new Map<string, string>();
    const host = { dataset: {}, style: { setProperty(key: string, value: string) { properties.set(key, value); } } } as unknown as HTMLElement;
    const theme = createThemeController(host, { mode: 'dark', colors: { warning: '#123456', warningText: '#ffffff', warningBorder: '#abcdef' } });
    assert.equal(properties.get('--markee-warning'), '#123456');
    assert.equal(properties.get('--markee-warning-text'), '#ffffff');
    assert.equal(properties.get('--markee-warning-border'), '#abcdef');
    theme.set({ mode: 'dark' });
    const dark = properties.get('--markee-warning');
    assert.ok(dark && dark !== '#123456');
    theme.set();
    assert.notEqual(properties.get('--markee-warning'), dark);
    theme.destroy();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'CSS', previous);
    else Reflect.deleteProperty(globalThis, 'CSS');
  }
});
