import type { MarkeeTheme, MarkeeThemeColors } from './types.js';

const light: MarkeeThemeColors = {
  background: '#fbfcff', surface: '#ffffff', text: '#181b21', muted: '#687080', border: '#dce1ea',
  inputBackground: '#ffffff', inputText: '#202737',
  primary: '#282e3e', primaryText: '#ffffff', accent: '#c9f1a7', accentText: '#2b3c20',
  accentSurface: '#f1f7ea', accentSurfaceText: '#4e6535', accentBorder: '#cde3b5',
  selected: '#e9edf7', selectedText: '#242c47',
  info: '#edf1f9', infoText: '#52617b', error: '#fff0f0', errorText: '#9c3540',
  success: '#edf7e6', successText: '#40602f', link: '#4762a5', focusRing: '#5871c8', overlay: '#17203888',
};

const dark: MarkeeThemeColors = {
  background: '#151923', surface: '#202633', text: '#f0f3f8', muted: '#a6b1c3', border: '#434f63',
  inputBackground: '#10151e', inputText: '#f0f3f8',
  primary: '#dde6fa', primaryText: '#182238', accent: '#c9f1a7', accentText: '#24361a',
  accentSurface: '#243221', accentSurfaceText: '#c4e5ad', accentBorder: '#526b40',
  selected: '#313d53', selectedText: '#edf3ff',
  info: '#243149', infoText: '#bdcff1', error: '#44262e', errorText: '#ffbdc5',
  success: '#233b2b', successText: '#b5e4bf', link: '#adc5ff', focusRing: '#a1b4ff', overlay: '#030711b8',
};

const defaultFont = 'Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
const variable = (key: string) => `--markee-${key.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`;

/** Updates only scoped style properties; never replaces form or review DOM. */
export function createThemeController(host: HTMLElement, initial?: MarkeeTheme) {
  let stopWatching: (() => void) | undefined;
  const set = (theme: MarkeeTheme = {}) => {
    stopWatching?.(); stopWatching = undefined;
    const media = theme.mode === 'system' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined;
    const apply = () => {
      const mode = theme.mode === 'dark' || media?.matches ? 'dark' : 'light';
      const palette = mode === 'dark' ? dark : light;
      host.dataset.markeeTheme = mode;
      host.style.setProperty('--markee-color-scheme', mode);
      for (const key of Object.keys(palette) as (keyof MarkeeThemeColors)[]) {
        const value = theme.colors?.[key];
        host.style.setProperty(variable(key), value && CSS.supports('color', value) ? value : palette[key]);
      }
      host.style.setProperty('--markee-font-family', theme.fontFamily && CSS.supports('font-family', theme.fontFamily) ? theme.fontFamily : defaultFont);
      const radius = typeof theme.radius === 'number' && Number.isFinite(theme.radius) ? Math.max(0, Math.min(48, theme.radius)) : 22;
      host.style.setProperty('--markee-radius', `${radius}px`);
      host.style.setProperty('--markee-card-radius', `${radius * 0.64}px`);
      host.style.setProperty('--markee-control-radius', `${radius * 0.45}px`);
      host.style.setProperty('--markee-small-radius', `${radius * 0.32}px`);
    };
    apply();
    if (media) {
      media.addEventListener('change', apply);
      stopWatching = () => media.removeEventListener('change', apply);
    }
  };
  set(initial);
  return { set, destroy() { stopWatching?.(); stopWatching = undefined; } };
}
