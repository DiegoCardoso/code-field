/**
 * Dev server with theme switching, mirroring `vaadin/web-components`' own dev
 * pages so the two behave the same way (`W-1.4`).
 *
 * The switcher itself only writes `?theme=<theme>:<scheme>` and reloads; this is
 * what acts on it — setting `data-theme` on `<html>`, linking the theme's
 * stylesheet, and injecting the switcher element into every page.
 */

const DEFAULT_THEME = process.argv.join(' ').match(/--theme=([\w:]+)/u)?.[1] ?? 'base:light';

const THEME_STYLESHEETS = {
  lumo: '/node_modules/@vaadin/vaadin-lumo-styles/lumo.css',
  aura: '/node_modules/@vaadin/aura/aura.css',
};

/**
 * `base` is not a stylesheet: it is the component's own base styles with no
 * theme layered on top, which is what SPEC §9 says we ship. Being able to look
 * at it unthemed is the point — a token the themes happen to set can otherwise
 * hide a missing fallback.
 */
function enforceThemePlugin(defaultTheme) {
  return {
    name: 'enforce-theme',
    transform(context) {
      if (!context.response.is('html')) {
        return context.body;
      }

      let { body } = context;
      const theme = context.query.theme || defaultTheme;
      const [name] = theme.split(':');

      body = theme.endsWith('dark')
        ? body.replace('<html', `<html data-theme="${theme}" theme="dark"`)
        : body.replace('<html', `<html data-theme="${theme}"`);

      const stylesheet = THEME_STYLESHEETS[name];
      if (stylesheet) {
        body = body.replace('</title>', `</title><link rel="stylesheet" href="${stylesheet}" />`);
      }

      body = body.replace('</body>', '<theme-switcher></theme-switcher></body>');

      // Avoid a flash of unthemed content while the stylesheet loads.
      body = body.replace(
        '</body>',
        `<style>
           body:not(.resolved) { opacity: 0; }
           body { transition: opacity 0.2s; }
         </style>
         <script type="module">document.body.classList.add('resolved');</script>
         </body>`,
      );

      return body;
    },
  };
}

export default {
  nodeResolve: true,
  plugins: [enforceThemePlugin(DEFAULT_THEME)],
};
