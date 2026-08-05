/**
 * i18n/translate.ts - the typed `t()` helper.
 *
 * `TranslationKey` is derived from the catalog's own shape (a mapped,
 * recursive dot-path type), so an invalid or renamed key is a compile error
 * instead of a runtime-only miss. A node shaped `{ one: string; other:
 * string }` is treated as a terminal, "pluralizable" key - `t()` picks
 * `one`/`other` from `params.count` - rather than recursing into it, so
 * `t('someCountedThing', { count })` type-checks against the parent key,
 * not `someCountedThing.other`.
 *
 * English only needs the two CLDR categories used here. A Polish catalog
 * needs more (`few`, `many`) - when that lands, this resolver's plural
 * branch grows a locale-aware category picker, but `t()`'s signature and
 * every call site stay exactly as they are today.
 */
import { en } from './catalogs/en';

type Catalog = typeof en;

type PluralNode = { readonly one: string; readonly other: string };

type LeafPaths<T, Prefix extends string = ''> = T extends string
  ? Prefix
  : T extends PluralNode
    ? Prefix
    : {
        [K in keyof T & string]: LeafPaths<T[K], `${Prefix}${Prefix extends '' ? '' : '.'}${K}`>;
      }[keyof T & string];

export type TranslationKey = LeafPaths<Catalog>;

export interface TranslateParams {
  count?: number;
  [placeholder: string]: string | number | undefined;
}

function resolvePath(catalog: Catalog, path: string): string | PluralNode | undefined {
  const segments = path.split('.');
  let node: unknown = catalog;
  for (const segment of segments) {
    if (node !== null && typeof node === 'object' && segment in node) {
      node = (node as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return node as string | PluralNode | undefined;
}

function isPluralNode(node: unknown): node is PluralNode {
  return (
    node !== null &&
    typeof node === 'object' &&
    typeof (node as Record<string, unknown>).one === 'string' &&
    typeof (node as Record<string, unknown>).other === 'string'
  );
}

function interpolate(template: string, params: TranslateParams | undefined): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (match, token: string) => {
    const value = params[token];
    return value === undefined ? match : String(value);
  });
}

/** Typed translation lookup. English-only catalog for v1 (D-11). */
export function t(key: TranslationKey, params?: TranslateParams): string {
  const node = resolvePath(en, key);

  if (typeof node === 'string') {
    return interpolate(node, params);
  }

  if (isPluralNode(node)) {
    const template = params?.count === 1 ? node.one : node.other;
    return interpolate(template, params);
  }

  // Unreachable for any key accepted by the `TranslationKey` type - kept as
  // a safe fallback instead of throwing, since a UI string helper should
  // never crash the render it's called from.
  return key;
}
