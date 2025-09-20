/**
 * Centralized data-test selector patterns for type-safe test selectors
 */

export type SelectorPattern = {
  page: string;
  list: {
    table: string;
    item: (id: string) => string;
    empty: string;
  };
  form: {
    field: (name: string) => string;
    submit: string;
    cancel: string;
    error: string;
  };
  dialog: {
    container: string;
    title: string;
    close: string;
  };
  button: {
    primary: string;
    secondary: string;
    danger: string;
  };
  navigation: {
    link: (path: string) => string;
    breadcrumb: string;
  };
};

/**
 * Builds a data-testid selector
 */
export function testId(id: string): string {
  return `[data-testid="${id}"]`;
}

/**
 * Common selector patterns by domain
 */
export const selectors = {
  // Parts page selectors
  parts: {
    page: testId('parts.page'),
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
  },

  // Types page selectors
  types: {
    page: testId('types.page'),
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
  },

  // Boxes page selectors
  boxes: {
    page: testId('boxes.page'),
    list: {
      table: testId('boxes.list.table'),
      item: (id: string) => testId(`boxes.list.item.${id}`),
      empty: testId('boxes.list.empty'),
    },
    form: {
      field: (name: string) => testId(`boxes.form.field.${name}`),
      submit: testId('boxes.form.submit'),
      cancel: testId('boxes.form.cancel'),
      error: testId('boxes.form.error'),
    },
  },

  // Dashboard selectors
  dashboard: {
    page: testId('dashboard.page'),
    cards: {
      parts: testId('dashboard.cards.parts'),
      types: testId('dashboard.cards.types'),
      boxes: testId('dashboard.cards.boxes'),
    },
    charts: {
      container: testId('dashboard.charts.container'),
    },
  },

  // Common UI selectors
  common: {
    loading: testId('loading'),
    error: testId('error'),
    toast: testId('toast'),
    search: testId('search'),
    pagination: {
      container: testId('pagination'),
      prev: testId('pagination.prev'),
      next: testId('pagination.next'),
      page: (num: number) => testId(`pagination.page.${num}`),
    },
  },
};

/**
 * Helper to build custom selectors following the pattern
 */
export function buildSelector(domain: string, section: string, element: string, id?: string): string {
  const parts = [domain, section, element];
  if (id) parts.push(id);
  return testId(parts.join('.'));
}