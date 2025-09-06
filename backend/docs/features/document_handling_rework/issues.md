- [ ] UploadDocumentSchema.detected_type must be of type AttachmentType | None. This wasn't clearly specified. I see that URLClassifierFunctionImpl.classify_url in ai_service is replicating functionality. This needs to be reworked to use the new implementation. api.documents.attachment_preview is doing its own mapping; that'll be done in other places also. Please rework this.

- [ ] Please remove the content_type parameter from create_file_attachment.

- [ ] Remove this text: # No longer process/convert images

- [ ] create_url_attachment needs to be completely reworked. Basically it only has to do a process_upload_url and then give the result to create_file_attachment (or preferably a shared common core between process_upload_url and create_file_attachment).

- [ ] get_attachment_thumbnail should use the result from get_preview_image as the source to get the thumbnail from.

- [ ] get_preview_image and _download_and_validate_image could return UploadDocumentContentSchema | None. Rename the schema to DocumentContentSchema.

- [ ] Remove DocumentService.attachment_has_image. It's unused.

- [ ] Simplify gif checking in _download_and_validate_image. Checking the mime type is enough.

- [ ] AIService._document_from_link is duplicating functionality from process_upload_url. Please have it call that method and rewrite this method. When this is done, the test_download_document_unsupported_content_type test shouldn't be necessary anymore. Do check though there is a separate test to test similar functionality of process_upload_url.

- [ ] get_attachment_file_data can be simplified. It should not fall back to the PDF icon. It really only has to check for the s3_key and return the content, or None otherwise.

- [ ] There are failing unit tests that broke because of the implementation.