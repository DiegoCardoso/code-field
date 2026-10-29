import { setCustomElementsManifest } from '@storybook/web-components-vite';
import auraUrl from '@vaadin/aura/aura.css?url';
import lumoUrl from '@vaadin/vaadin-lumo-styles/lumo.css?url';
import manifest from '../custom-elements.json';

// Controls and the docs page read the manifest: it carries the API inherited
// from `@vaadin/field-base`. `npm run storybook` writes it first, as it is not
// committed. Storybook 11 moves this to `framework.options` in main.js.
setCustomElementsManifest(manifest);

/**
 * The same themes as the dev pages (`web-dev-server.config.js`): `base` is the
 * component's own styles with no theme on top, which is what SPEC §9 says we
 * ship. `ThemeDetectionMixin` sees the stylesheet change and restamps
 * `data-application-theme`, so switching needs no reload.
 */
const THEME_STYLESHEETS = { lumo: lumoUrl, aura: auraUrl };

function applyTheme(name, scheme) {
  const root = document.documentElement;

  // The dev pages' `data-theme` value. Storybook keeps two globals instead,
  // because `:` separates key and value in its `?globals=` URL parameter.
  root.dataset.theme = `${name}:${scheme}`;
  if (scheme === 'dark') {
    root.setAttribute('theme', 'dark');
  } else {
    root.removeAttribute('theme');
  }
  root.style.colorScheme = scheme;

  let link = document.getElementById('storybook-vaadin-theme');
  const href = THEME_STYLESHEETS[name];
  if (!href) {
    link?.remove();
    return;
  }
  if (!link) {
    link = Object.assign(document.createElement('link'), { id: 'storybook-vaadin-theme', rel: 'stylesheet' });
    document.head.append(link);
  }
  if (link.getAttribute('href') !== href) link.href = href;
}

export default {
  globalTypes: {
    theme: {
      description: 'Vaadin theme',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: ['base', 'lumo', 'aura'],
        dynamicTitle: true,
      },
    },
    colorScheme: {
      description: 'Colour scheme',
      toolbar: {
        title: 'Scheme',
        icon: 'mirror',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'base',
    colorScheme: 'light',
  },
  decorators: [
    (story, { globals }) => {
      applyTheme(globals.theme, globals.colorScheme);
      return story();
    },
  ],
  parameters: {
    controls: { expanded: true },
    a11y: {
      // Fail the a11y check in the test panel, not only report it.
      test: 'error',
    },
  },
  tags: ['autodocs'],
};
