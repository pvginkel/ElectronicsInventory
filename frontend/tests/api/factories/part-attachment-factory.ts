import { createApiClient } from '../client';
import { getBackendUrl } from '../../support/backend-url';
import { generateRandomId } from '../../support/helpers';
import type { components } from '../../../src/lib/api/generated/types';

type AttachmentResponse = components['schemas']['PartAttachmentResponseSchema.f950e1b'];
type AttachmentListItem = components['schemas']['PartAttachmentListSchemaList.a9993e3.PartAttachmentListSchema'];
type CoverResponse = components['schemas']['CoverAttachmentResponseSchema.f950e1b'];

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

export class PartAttachmentTestFactory {
  private readonly client: ReturnType<typeof createApiClient>;
  private readonly backendUrl: string;

  constructor(client?: ReturnType<typeof createApiClient>) {
    this.client = client || createApiClient();
    this.backendUrl = getBackendUrl();
  }

  /**
   * Create a URL-based attachment for a part. Defaults to using the deterministic
   * /api/testing/content/image?text=... helper so image previews stay stable.
   */
  async createUrl(
    partKey: string,
    options: CreateUrlAttachmentOptions = {}
  ): Promise<AttachmentResponse> {
    const title = options.title ?? generateRandomId('Attachment');
    const defaultUrl = this.buildDeterministicImageUrl(options.previewText ?? title);
    const response = await fetch(this.buildUrl(`/api/parts/${encodeURIComponent(partKey)}/attachments`), {
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
    const title = options.title ?? generateRandomId('Attachment');
    const filename = options.filename ?? this.sanitizeFilename(`${title}.pdf`);
    const contentType = options.contentType ?? 'application/pdf';
    const fileContents = options.fileContents ?? this.defaultPdfBytes();

    const formData = new FormData();
    formData.set('title', title);
    const normalizedArray = fileContents instanceof ArrayBuffer
      ? new Uint8Array(fileContents)
      : new Uint8Array(fileContents);
    formData.set('file', new Blob([normalizedArray.buffer], { type: contentType }), filename);

    const response = await fetch(this.buildUrl(`/api/parts/${encodeURIComponent(partKey)}/attachments`), {
      method: 'POST',
      body: formData,
    });

    return this.parseAttachmentResponse(response);
  }

  async list(partKey: string): Promise<AttachmentListItem[]> {
    const { data, error, response } = await this.client.GET('/api/parts/{part_key}/attachments', {
      params: { path: { part_key: partKey } },
    });

    await this.assertResponse(response, error);
    return data ?? [];
  }

  async get(partKey: string, attachmentId: number): Promise<AttachmentResponse> {
    const { data, error, response } = await this.client.GET('/api/parts/{part_key}/attachments/{attachment_id}', {
      params: { path: { part_key: partKey, attachment_id: attachmentId } },
    });

    await this.assertResponse(response, error);
    if (!data) {
      throw new Error('Attachment lookup succeeded but returned no payload');
    }
    return data;
  }

  async delete(partKey: string, attachmentId: number): Promise<void> {
    const { error, response } = await this.client.DELETE('/api/parts/{part_key}/attachments/{attachment_id}', {
      params: { path: { part_key: partKey, attachment_id: attachmentId } },
    });

    await this.assertResponse(response, error);
  }

  async getCover(partKey: string): Promise<CoverResponse> {
    const { data, error, response } = await this.client.GET('/api/parts/{part_key}/cover', {
      params: { path: { part_key: partKey } },
    });

    await this.assertResponse(response, error);
    if (!data) {
      throw new Error('Cover lookup succeeded but returned no payload');
    }
    return data;
  }

  async setCover(partKey: string, attachmentId: number | null): Promise<CoverResponse> {
    const response = await fetch(this.buildUrl(`/api/parts/${encodeURIComponent(partKey)}/cover`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachment_id: attachmentId }),
    });

    return this.parseCoverResponse(response);
  }

  async clearCover(partKey: string): Promise<void> {
    const response = await fetch(this.buildUrl(`/api/parts/${encodeURIComponent(partKey)}/cover`), {
      method: 'DELETE',
    });

    await this.assertResponse(response);
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

  private sanitizeFilename(filename: string): string {
    return filename
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\-_.]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'attachment.pdf';
  }

  private defaultPdfBytes(): Uint8Array {
    const buffer = Buffer.from(
      'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlIC9DYXRhbG9nL1BhZ2VzIDIgMCBSID4+CmVuZG9iagoyIDAgb2JqCjw8L1R5cGUgL1BhZ2VzL0tpZHMgWyAzIDAgUiBdL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwvVHlwZSAvUGFnZS9NZWRpYUJveCBbMCAwIDYxMiA3OTJdL1BhcmVudCAyIDAgUiA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNzAgMDAwMDAgbiAKMDAwMDAwMDEyNiAwMDAwMCBuIAp0cmFpbGVyCjw8L1Jvb3QgMSAwIFIvSW5mbyA0IDAgUi9TaXplIDQgPj4Kc3RhcnR4cmVmCjE4NQolJUVPRgo=',
      'base64'
    );
    return new Uint8Array(buffer);
  }
}
