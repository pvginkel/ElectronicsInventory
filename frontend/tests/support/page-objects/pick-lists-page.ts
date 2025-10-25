import { type Locator, type Page } from '@playwright/test';
import { BasePage } from './base-page';

interface PickListDetailSearchParams {
  status?: string;
  search?: string;
  kitId?: number;
}

export class PickListsPage extends BasePage {
  readonly layout: Locator;
  readonly header: Locator;
  readonly content: Locator;
  readonly title: Locator;
  readonly statusBadge: Locator;
  readonly metadata: Locator;
  readonly availabilityError: Locator;
  readonly breadcrumbKitLink: Locator;

  constructor(page: Page) {
    super(page);
    this.layout = page.getByTestId('pick-lists.detail.layout');
    this.header = page.getByTestId('pick-lists.detail.header');
    this.content = page.getByTestId('pick-lists.detail.content');
    this.title = page.getByTestId('pick-lists.detail.title');
    this.statusBadge = page.getByTestId('pick-lists.detail.status');
    this.metadata = page.getByTestId('pick-lists.detail.metadata');
    this.availabilityError = page.getByTestId('pick-lists.detail.availability.error');
    this.breadcrumbKitLink = page.getByTestId('pick-lists.detail.breadcrumbs.kit');
  }

  async gotoDetail(pickListId: number, search?: PickListDetailSearchParams): Promise<void> {
    const params = new URLSearchParams();
    if (search?.status) {
      params.set('status', search.status);
    }
    if (search?.search) {
      params.set('search', search.search);
    }
    if (typeof search?.kitId === 'number') {
      params.set('kitId', String(search.kitId));
    }
    const query = params.toString();
    const path = `/pick-lists/${pickListId}${query ? `?${query}` : ''}`;
    await this.goto(path);
  }

  group(kitContentId: number): Locator {
    return this.page.getByTestId(`pick-lists.detail.group.${kitContentId}`);
  }

  groupMetrics(kitContentId: number): Locator {
    return this.page.getByTestId(`pick-lists.detail.group.${kitContentId}.metrics`);
  }

  line(lineId: number): Locator {
    return this.page.getByTestId(`pick-lists.detail.line.${lineId}`);
  }

  lineStatus(lineId: number): Locator {
    return this.page.getByTestId(`pick-lists.detail.line.${lineId}.status`);
  }

  lineActions(lineId: number): Locator {
    return this.page.getByTestId(`pick-lists.detail.line.${lineId}.actions`);
  }

  pickButton(lineId: number): Locator {
    return this.page.getByTestId(`pick-lists.detail.line.${lineId}.action.pick`);
  }

  undoButton(lineId: number): Locator {
    return this.page.getByTestId(`pick-lists.detail.line.${lineId}.action.undo`);
  }

  lineAvailability(lineId: number): Locator {
    return this.page.getByTestId(`pick-lists.detail.line.${lineId}.availability`);
  }

  lineShortfall(lineId: number): Locator {
    return this.page.getByTestId(`pick-lists.detail.line.${lineId}.shortfall`);
  }

  breadcrumbRoot(): Locator {
    return this.page.getByTestId('pick-lists.detail.breadcrumbs.root');
  }

  breadcrumbKit(): Locator {
    return this.breadcrumbKitLink;
  }

  breadcrumbCurrent(): Locator {
    return this.page.getByTestId('pick-lists.detail.breadcrumbs.current');
  }
}
