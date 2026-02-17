/**
 * Domain-specific test selectors for Electronics Inventory.
 * App-owned — contains selector patterns for parts, types, boxes, and sellers.
 *
 * Generic helpers (testId in test-id.ts; buildSelector, selectors.common in selectors.ts).
 */

import { testId } from './test-id';

// Parts page selectors
export const partsSelectors = {
  page: testId('parts.page'),
  overview: testId('parts.overview'),
  header: testId('parts.overview.header'),
  content: testId('parts.overview.content'),
  list: {
    table: testId('parts.list.table'),
    item: (id: string) => testId(`parts.list.item.${id}`),
    empty: testId('parts.list.empty'),
  },
  form: {
    field: (name: string) => testId(`parts.form.field.${name}`),
    submit: testId('parts.form.submit'),
    cancel: testId('parts.form.cancel'),
    error: testId('parts.form.error'),
  },
  dialog: {
    container: testId('parts.dialog.container'),
    title: testId('parts.dialog.title'),
    close: testId('parts.dialog.close'),
  },
  button: {
    primary: testId('parts.button.primary'),
    secondary: testId('parts.button.secondary'),
    danger: testId('parts.button.danger'),
  },
  navigation: {
    link: (path: string) => testId(`parts.nav.${path}`),
    breadcrumb: testId('parts.breadcrumb'),
  },
  selector: {
    root: testId('parts.selector'),
    input: testId('parts.selector.input'),
    selected: testId('parts.selector.selected'),
    harness: {
      page: testId('parts.selector.harness'),
      submission: testId('parts.selector.harness.submission'),
      form: testId('partselectorharness_submit.form'),
      submit: testId('partselectorharness_submit.submit'),
    },
  },
};

// Types page selectors
export const typesSelectors = {
  page: testId('types.overview'),
  header: testId('types.overview.header'),
  content: testId('types.overview.content'),
  list: {
    table: testId('types.list.table'),
    item: (id: string) => testId(`types.list.item.${id}`),
    empty: testId('types.list.empty'),
  },
  form: {
    field: (name: string) => testId(`types.form.field.${name}`),
    submit: testId('types.form.submit'),
    cancel: testId('types.form.cancel'),
    error: testId('types.form.error'),
  },
  dialog: {
    container: testId('types.dialog.container'),
    title: testId('types.dialog.title'),
    close: testId('types.dialog.close'),
  },
};

// Boxes page selectors
export const boxesSelectors = {
  page: testId('boxes.overview'),
  header: testId('boxes.overview.header'),
  content: testId('boxes.overview.content'),
  list: {
    table: testId('boxes.list.table'),
    item: (id: string | number) => testId(`boxes.list.item.${id}`),
    empty: testId('boxes.list.empty'),
    noResults: testId('boxes.list.no-results'),
    summary: testId('boxes.list.summary'),
    loading: testId('boxes.list.loading'),
    error: testId('boxes.list.error'),
  },
  search: {
    input: testId('boxes.list.search'),
    clear: testId('boxes.list.search.clear'),
  },
  actions: {
    add: testId('boxes.list.add'),
    emptyCta: testId('boxes.list.empty.cta'),
  },
  detail: {
    root: testId('boxes.detail'),
    loading: testId('boxes.detail.loading'),
    error: testId('boxes.detail.error'),
    summary: testId('boxes.detail.summary'),
    locations: testId('boxes.detail.locations'),
    locationsError: testId('boxes.detail.locations.error'),
    locationsEmpty: testId('boxes.detail.locations.empty'),
    locationItem: (id: string | number) => testId(`boxes.detail.locations.item.${id}`),
  },
  form: {
    dialog: (id: string) => testId(`${id}.dialog`),
    field: (id: string, name: string) => testId(`${id}.field.${name}`),
    submit: (id: string) => testId(`${id}.submit`),
  },
};

// Sellers page selectors
export const sellersSelectors = {
  page: testId('sellers.overview'),
  header: testId('sellers.overview.header'),
  content: testId('sellers.overview.content'),
  list: {
    table: testId('sellers.list.table'),
    item: (id: string | number) => testId(`sellers.list.item.${id}`),
    empty: testId('sellers.list.empty'),
    noResults: testId('sellers.list.no-results'),
    summary: testId('sellers.list.summary'),
    loading: testId('sellers.list.loading'),
    error: testId('sellers.list.error'),
  },
  search: {
    input: testId('sellers.list.search'),
    clear: testId('sellers.list.search.clear'),
  },
  actions: {
    add: testId('sellers.list.add'),
    emptyCta: testId('sellers.list.empty.cta'),
  },
  selector: {
    root: testId('sellers.selector'),
    input: testId('sellers.selector.input'),
    selected: testId('sellers.selector.selected'),
    inlineForm: {
      dialog: testId('sellers.selector.create.dialog'),
      name: testId('sellers.selector.create.field.name'),
      website: testId('sellers.selector.create.field.website'),
      submit: testId('sellers.selector.create.submit'),
    },
  },
  form: {
    dialog: (id: string) => testId(`${id}.dialog`),
    field: (id: string, name: string) => testId(`${id}.field.${name}`),
    submit: (id: string) => testId(`${id}.submit`),
  },
};
