import { createApiClient } from '../client';
import { getBackendUrl } from '../../support/backend-url';
import { makeUnique } from '../../support/helpers';
import type { components } from '../../../src/lib/api/generated/types';

type AttachmentResponse = components['schemas']['AttachmentResponseSchema.20ffa95'];
type AttachmentListItem = components['schemas']['AttachmentListSchemaList.a9993e3.AttachmentListSchema'];
type CoverResponse = components['schemas']['AttachmentSetCoverSchema.20ffa95'];

export interface CreateUrlAttachmentOptions {
  title?: string;
  url?: string;
  previewText?: string;
}

export interface CreateBinaryAttachmentOptions {
  title?: string;
  filename?: string;
  contentType?: string;
  fileContents?: Uint8Array | ArrayBuffer;
}

export class AttachmentTestFactory {
  private readonly client: ReturnType<typeof createApiClient>;
  private readonly backendUrl: string;

  constructor(
    client?: ReturnType<typeof createApiClient>,
    backendUrl?: string
  ) {
    if (client) {
      this.client = client;
    } else {
      this.client = createApiClient(
        backendUrl ? { baseUrl: backendUrl } : undefined
      );
    }
    this.backendUrl = backendUrl ?? getBackendUrl();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Part attachment methods (via part's attachment_set_id)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a URL-based attachment for a part. Defaults to using the deterministic
   * /api/testing/content/image?text=... helper so image previews stay stable.
   */
  async createUrl(
    partKey: string,
    options: CreateUrlAttachmentOptions = {}
  ): Promise<AttachmentResponse> {
    const attachmentSetId = await this.getPartAttachmentSetId(partKey);
    const title = options.title ?? makeUnique('Attachment');
    const defaultUrl = this.buildDeterministicImageUrl(options.previewText ?? title);
    const response = await fetch(this.buildUrl(`/api/attachment-sets/${attachmentSetId}/attachments`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        url: options.url ?? defaultUrl,
      }),
    });

    return this.parseAttachmentResponse(response);
  }

  /**
   * Create a binary attachment (e.g. PDF) by posting multipart FormData via the real API.
   */
  async createBinary(
    partKey: string,
    options: CreateBinaryAttachmentOptions = {}
  ): Promise<AttachmentResponse> {
    const attachmentSetId = await this.getPartAttachmentSetId(partKey);
    const title = options.title ?? makeUnique('Attachment');
    const filename = options.filename ?? this.sanitizeFilename(`${title}.pdf`);
    const contentType = options.contentType ?? 'application/pdf';
    const fileContents = options.fileContents ?? await this.fetchTestingPdfBytes();

    const formData = new FormData();
    formData.set('title', title);
    const normalizedArray = fileContents instanceof ArrayBuffer
      ? new Uint8Array(fileContents)
      : new Uint8Array(fileContents);
    formData.set('file', new Blob([normalizedArray.buffer], { type: contentType }), filename);

    const response = await fetch(this.buildUrl(`/api/attachment-sets/${attachmentSetId}/attachments`), {
      method: 'POST',
      body: formData,
    });

    return this.parseAttachmentResponse(response);
  }

  async list(partKey: string): Promise<AttachmentListItem[]> {
    const attachmentSetId = await this.getPartAttachmentSetId(partKey);
    const { data, error, response } = await this.client.GET('/api/attachment-sets/{set_id}/attachments', {
      params: { path: { set_id: attachmentSetId } },
    });

    await this.assertResponse(response, error);
    return data ?? [];
  }

  async get(partKey: string, attachmentId: number): Promise<AttachmentResponse> {
    const attachmentSetId = await this.getPartAttachmentSetId(partKey);
    const { data, error, response } = await this.client.GET('/api/attachment-sets/{set_id}/attachments/{attachment_id}', {
      params: { path: { set_id: attachmentSetId, attachment_id: attachmentId } },
    });

    await this.assertResponse(response, error);
    if (!data) {
      throw new Error('Attachment lookup succeeded but returned no payload');
    }
    return data;
  }

  async delete(partKey: string, attachmentId: number): Promise<void> {
    const attachmentSetId = await this.getPartAttachmentSetId(partKey);
    const { error, response } = await this.client.DELETE('/api/attachment-sets/{set_id}/attachments/{attachment_id}', {
      params: { path: { set_id: attachmentSetId, attachment_id: attachmentId } },
    });

    await this.assertResponse(response, error);
  }

  async getCover(partKey: string): Promise<CoverResponse> {
    const attachmentSetId = await this.getPartAttachmentSetId(partKey);
    const { data, error, response } = await this.client.GET('/api/attachment-sets/{set_id}/cover', {
      params: { path: { set_id: attachmentSetId } },
    });

    await this.assertResponse(response, error);
    if (!data) {
      throw new Error('Cover lookup succeeded but returned no payload');
    }
    return data;
  }

  async setCover(partKey: string, attachmentId: number | null): Promise<CoverResponse> {
    const attachmentSetId = await this.getPartAttachmentSetId(partKey);
    const response = await fetch(this.buildUrl(`/api/attachment-sets/${attachmentSetId}/cover`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachment_id: attachmentId }),
    });

    return this.parseCoverResponse(response);
  }

  async clearCover(partKey: string): Promise<void> {
    const attachmentSetId = await this.getPartAttachmentSetId(partKey);
    const response = await fetch(this.buildUrl(`/api/attachment-sets/${attachmentSetId}/cover`), {
      method: 'DELETE',
    });

    await this.assertResponse(response);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Kit attachment methods (via kit's attachment_set_id)
  // ─────────────────────────────────────────────────────────────────────────────

  async createUrlForKit(
    kitId: number,
    options: CreateUrlAttachmentOptions = {}
  ): Promise<AttachmentResponse> {
    const attachmentSetId = await this.getKitAttachmentSetId(kitId);
    const title = options.title ?? makeUnique('Attachment');
    const defaultUrl = this.buildDeterministicImageUrl(options.previewText ?? title);
    const response = await fetch(this.buildUrl(`/api/attachment-sets/${attachmentSetId}/attachments`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        url: options.url ?? defaultUrl,
      }),
    });

    return this.parseAttachmentResponse(response);
  }

  async createBinaryForKit(
    kitId: number,
    options: CreateBinaryAttachmentOptions = {}
  ): Promise<AttachmentResponse> {
    const attachmentSetId = await this.getKitAttachmentSetId(kitId);
    const title = options.title ?? makeUnique('Attachment');
    const filename = options.filename ?? this.sanitizeFilename(`${title}.pdf`);
    const contentType = options.contentType ?? 'application/pdf';
    const fileContents = options.fileContents ?? await this.fetchTestingPdfBytes();

    const formData = new FormData();
    formData.set('title', title);
    const normalizedArray = fileContents instanceof ArrayBuffer
      ? new Uint8Array(fileContents)
      : new Uint8Array(fileContents);
    formData.set('file', new Blob([normalizedArray.buffer], { type: contentType }), filename);

    const response = await fetch(this.buildUrl(`/api/attachment-sets/${attachmentSetId}/attachments`), {
      method: 'POST',
      body: formData,
    });

    return this.parseAttachmentResponse(response);
  }

  async listForKit(kitId: number): Promise<AttachmentListItem[]> {
    const attachmentSetId = await this.getKitAttachmentSetId(kitId);
    const { data, error, response } = await this.client.GET('/api/attachment-sets/{set_id}/attachments', {
      params: { path: { set_id: attachmentSetId } },
    });

    await this.assertResponse(response, error);
    return data ?? [];
  }

  async getForKit(kitId: number, attachmentId: number): Promise<AttachmentResponse> {
    const attachmentSetId = await this.getKitAttachmentSetId(kitId);
    const { data, error, response } = await this.client.GET('/api/attachment-sets/{set_id}/attachments/{attachment_id}', {
      params: { path: { set_id: attachmentSetId, attachment_id: attachmentId } },
    });

    await this.assertResponse(response, error);
    if (!data) {
      throw new Error('Attachment lookup succeeded but returned no payload');
    }
    return data;
  }

  async deleteForKit(kitId: number, attachmentId: number): Promise<void> {
    const attachmentSetId = await this.getKitAttachmentSetId(kitId);
    const { error, response } = await this.client.DELETE('/api/attachment-sets/{set_id}/attachments/{attachment_id}', {
      params: { path: { set_id: attachmentSetId, attachment_id: attachmentId } },
    });

    await this.assertResponse(response, error);
  }

  async getCoverForKit(kitId: number): Promise<CoverResponse> {
    const attachmentSetId = await this.getKitAttachmentSetId(kitId);
    const { data, error, response } = await this.client.GET('/api/attachment-sets/{set_id}/cover', {
      params: { path: { set_id: attachmentSetId } },
    });

    await this.assertResponse(response, error);
    if (!data) {
      throw new Error('Cover lookup succeeded but returned no payload');
    }
    return data;
  }

  async setCoverForKit(kitId: number, attachmentId: number | null): Promise<CoverResponse> {
    const attachmentSetId = await this.getKitAttachmentSetId(kitId);
    const response = await fetch(this.buildUrl(`/api/attachment-sets/${attachmentSetId}/cover`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachment_id: attachmentId }),
    });

    return this.parseCoverResponse(response);
  }

  async clearCoverForKit(kitId: number): Promise<void> {
    const attachmentSetId = await this.getKitAttachmentSetId(kitId);
    const response = await fetch(this.buildUrl(`/api/attachment-sets/${attachmentSetId}/cover`), {
      method: 'DELETE',
    });

    await this.assertResponse(response);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper methods
  // ─────────────────────────────────────────────────────────────────────────────

  private async getPartAttachmentSetId(partKey: string): Promise<number> {
    const { data, error, response } = await this.client.GET('/api/parts/{part_key}', {
      params: { path: { part_key: partKey } },
    });

    await this.assertResponse(response, error);
    if (!data) {
      throw new Error(`Part ${partKey} not found`);
    }
    return data.attachment_set_id;
  }

  private async getKitAttachmentSetId(kitId: number): Promise<number> {
    // The kit detail endpoint (GET /api/kits/{kit_id}) returns KitDetailResponseSchema
    // which doesn't include attachment_set_id. We use PATCH with empty body to get
    // KitResponseSchema which includes attachment_set_id.
    const { data, error, response } = await this.client.PATCH('/api/kits/{kit_id}', {
      params: { path: { kit_id: kitId } },
      body: { build_target: null, description: null, name: null },
    });

    await this.assertResponse(response, error);
    if (!data) {
      throw new Error(`Kit ${kitId} not found`);
    }
    return data.attachment_set_id;
  }

  private async parseAttachmentResponse(response: Response): Promise<AttachmentResponse> {
    await this.assertResponse(response);
    return response.json() as Promise<AttachmentResponse>;
  }

  private async parseCoverResponse(response: Response): Promise<CoverResponse> {
    await this.assertResponse(response);
    return response.json() as Promise<CoverResponse>;
  }

  private async assertResponse(response: Response, error?: unknown): Promise<void> {
    if (error || !response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch {
        detail = '';
      }

      const errorText = detail ? ` - ${detail}` : '';
      const errorMessage = error instanceof Error ? ` (${error.message})` : '';
      throw new Error(`Request failed: ${response.status} ${response.statusText}${errorText}${errorMessage}`);
    }
  }

  private buildUrl(path: string): string {
    return `${this.backendUrl}${path}`;
  }

  /**
   * /api/testing/content/image remains deterministic for tests. We resolve the host to 127.0.0.1
   * because backend validators reject bare localhost URLs when downloading attachments.
   */
  private buildDeterministicImageUrl(text: string): string {
    const base = new URL('/api/testing/content/image', this.backendUrl);
    base.hostname = '127.0.0.1';
    base.searchParams.set('text', text);
    return base.toString();
  }

  private buildDeterministicPdfUrl(): string {
    const base = new URL('/api/testing/content/pdf', this.backendUrl);
    base.hostname = '127.0.0.1';
    return base.toString();
  }

  private async fetchTestingPdfBytes(): Promise<Uint8Array> {
    const response = await fetch(this.buildDeterministicPdfUrl());
    await this.assertResponse(response);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\-_.]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'attachment.pdf';
  }
}
