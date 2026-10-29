import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Custom elements manifest for `<dc-code-field>`, written to
 * `custom-elements.json` by `npm run analyze`.
 *
 * Vaadin generates its own manifests with the same analyzer and four plugins
 * (`manifest/` in vaadin/web-components). Those resolve inheritance across
 * their monorepo's sources. This package has one element and reads the
 * inherited API from the manifests the `@vaadin/*` packages already ship, so
 * one plugin does the work of their inheritance and public-api plugins.
 */

const require = createRequire(import.meta.url);

// The array fields of a declaration that inherit. Slots, parts and CSS
// properties are documented on the element class, as Vaadin does.
const ITEM_FIELDS = ['attributes', 'members', 'events'];

// Static getters that configure the element and are not its API.
const ignoredStaticMembers = ['is', 'properties', 'observers', 'styles', 'constraints', 'delegateProps'];

// Inherited, but not this element's API. SPEC §6.1 drops the clear button, so
// `clearButtonVisible` would document an affordance that never renders.
const ignoredMembers = ['clearButtonVisible'];

const primitiveTypes = ['string', 'number', 'boolean'];

const camelToDash = (str) => str.replace(/([a-z])([A-Z])/gu, '$1-$2').toLowerCase();

const byName = (a, b) => a.name.localeCompare(b.name);

const isPublic = (item) =>
  item.privacy !== 'private' &&
  item.privacy !== 'protected' &&
  !item.name.startsWith('_') &&
  !item.name.startsWith('#');

/**
 * Finds a mixin's declaration in the manifest of the package that ships it.
 * @param {{ name: string, package?: string }} reference e.g. `@vaadin/field-base/src/input-field-mixin.js`
 * @return {{ declaration: object, packageName: string } | undefined} undefined for a relative
 *   import or a package without a manifest
 */
function shippedDeclaration(reference) {
  if (!reference.package) return undefined;
  const segments = reference.package.split('/');
  const packageName = segments.slice(0, reference.package.startsWith('@') ? 2 : 1).join('/');
  const modulePath = reference.package.slice(packageName.length + 1);

  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const { customElements } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  if (!customElements) return undefined;

  const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(packageJsonPath), customElements), 'utf-8'));
  const declaration = manifest.modules
    .find((module) => module.path === modulePath)
    ?.declarations?.find((candidate) => candidate.name === reference.name);
  return declaration && { declaration, packageName };
}

/**
 * Where an inherited item comes from, as a package path. A `module` in a
 * shipped manifest is relative to that package; here it would point into ours.
 */
function packageReference(item, mixin, packageName) {
  const { inheritedFrom } = item;
  if (!inheritedFrom) return { name: mixin.name, package: mixin.package };
  if (inheritedFrom.package) return inheritedFrom;
  return { name: inheritedFrom.name, package: `${packageName}/${inheritedFrom.module}` };
}

/**
 * Adds the items of each shipped mixin, nearest first. An item the element
 * declares itself wins, and takes the fields it leaves out — such as the
 * description of an override without JSDoc — from the inherited one.
 */
function applyInheritance(declaration) {
  for (const mixin of declaration.mixins || []) {
    const shipped = shippedDeclaration(mixin);
    if (!shipped) continue;
    const { declaration: ancestor, packageName } = shipped;

    for (const field of ITEM_FIELDS) {
      const items = (declaration[field] ??= []);
      for (const item of ancestor[field] || []) {
        const own = items.find((existing) => existing.name === item.name);
        if (own) {
          for (const [key, value] of Object.entries(item)) {
            if (key !== 'inheritedFrom') own[key] ??= value;
          }
        } else {
          items.push({ ...item, inheritedFrom: packageReference(item, mixin, packageName) });
        }
      }
    }
  }
}

/**
 * Keeps the public API only. An attribute stays when HTML can set it: its
 * field is public and not read-only, and its type is primitive. Polylit
 * derives attribute names in dash-case, so the manifest does too.
 */
function keepPublicApi(declaration) {
  const members = (declaration.members || [])
    .filter(isPublic)
    .filter((member) => !(member.static && ignoredStaticMembers.includes(member.name)))
    .filter((member) => !ignoredMembers.includes(member.name));
  const memberNames = new Set(members.map((member) => member.name));
  const readonlyNames = new Set(members.filter((member) => member.readonly).map((member) => member.name));

  const attributes = (declaration.attributes || [])
    .filter((attr) => !attr.fieldName || (memberNames.has(attr.fieldName) && !readonlyNames.has(attr.fieldName)))
    .filter((attr) => !attr.type || primitiveTypes.includes(attr.type.text))
    .map((attr) => ({ ...attr, name: camelToDash(attr.name) }));
  const attributeNames = new Set(attributes.map((attr) => attr.name));

  declaration.members = members
    .map((member) => {
      if (!member.attribute) return member;
      const attribute = camelToDash(member.attribute);
      if (attributeNames.has(attribute)) return { ...member, attribute };
      const rest = { ...member };
      delete rest.attribute;
      delete rest.reflects;
      return rest;
    })
    .sort(byName);
  declaration.attributes = attributes.sort(byName);
  declaration.events = (declaration.events || []).sort(byName);
}

function codeFieldPlugin() {
  return {
    name: 'code-field',

    packageLinkPhase({ customElementsManifest }) {
      for (const module of customElementsManifest.modules) {
        for (const declaration of module.declarations || []) {
          if (!declaration.customElement) continue;
          applyInheritance(declaration);
          keepPublicApi(declaration);
          // `defineCustomElement` registers the element, so the analyzer never
          // sees a `customElements.define` call and omits this export.
          (module.exports ??= []).push({
            kind: 'custom-element-definition',
            name: declaration.tagName,
            declaration: { name: declaration.name, module: module.path },
          });
        }
      }
    },
  };
}

export default {
  globs: ['src/code-field.js'],
  outdir: '.',
  litelement: true,
  plugins: [codeFieldPlugin()],
};
