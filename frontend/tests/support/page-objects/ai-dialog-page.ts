import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base-page';

export class AIDialogPage extends BasePage {
  readonly dialog: Locator;
  readonly inputStep: Locator;
  readonly inputField: Locator;
  readonly inputSubmit: Locator;
  readonly progressStep: Locator;
  readonly progressMessage: Locator;
  readonly progressError: Locator;
  readonly progressErrorMessage: Locator;
  readonly retryButton: Locator;
  readonly reviewStep: Locator;
  readonly reviewSubmit: Locator;
  readonly warningBar: Locator;
  readonly warningMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.dialog = page.getByTestId('parts.ai.dialog');
    this.inputStep = page.getByTestId('parts.ai.input-step');
    this.inputField = page.getByTestId('parts.ai.input');
    this.inputSubmit = page.getByTestId('parts.ai.input.submit');
    this.progressStep = page.getByTestId('parts.ai.progress-step');
    this.progressMessage = page.getByTestId('parts.ai.progress-message');
    this.progressError = page.getByTestId('parts.ai.progress-error');
    this.progressErrorMessage = page.getByTestId('parts.ai.progress-error-message');
    this.retryButton = page.getByRole('button', { name: /retry analysis/i });
    this.reviewStep = page.getByTestId('parts.ai.review-step');
    this.reviewSubmit = page.getByTestId('parts.ai.review.submit');
    this.warningBar = page.getByTestId('parts.ai.review.warning-bar');
    this.warningMessage = page.getByTestId('parts.ai.review.warning-message');
  }

  async waitForOpen(): Promise<void> {
    await expect(this.dialog).toBeVisible();
    await expect(this.inputStep).toBeVisible();
  }

  async submitPrompt(text: string): Promise<void> {
    await this.inputField.fill(text);
    await this.inputSubmit.click();
  }

  async waitForProgress(message?: string | RegExp): Promise<void> {
    await expect(this.progressStep).toBeVisible();
    if (message) {
      await expect(this.progressMessage).toContainText(message);
    }
  }

  async waitForReview(): Promise<void> {
    await expect(this.reviewStep).toBeVisible();
  }

  async submitReview(): Promise<void> {
    await this.reviewSubmit.click();
  }

  async waitForError(message?: string | RegExp): Promise<void> {
    await expect(this.progressStep).toBeVisible();
    await expect(this.progressStep).toHaveAttribute('data-state', 'error');
    await expect(this.progressError).toBeVisible();
    if (message) {
      await expect(this.progressErrorMessage).toContainText(message);
    }
  }

  async retry(): Promise<void> {
    await this.retryButton.click();
    await expect(this.inputStep).toBeVisible();
  }

  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.dialog).toBeHidden();
  }
}
