export class IngestionError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'IngestionError';
  }
}

export class UnsupportedFileTypeError extends IngestionError {
  constructor(name: string) {
    super(
      `Unsupported file type: ${name}. Supported: documents, PDFs, DOCX/DOC, images, Markdown, YAML/JSON/text, and code files.`,
      'UNSUPPORTED_FILE_TYPE'
    );
  }
}

export class FileTooLargeError extends IngestionError {
  constructor(name: string, maxBytes: number) {
    super(`File ${name} is too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)}MB.`, 'FILE_TOO_LARGE');
  }
}

export class ImageCodecUnsupportedError extends IngestionError {
  constructor(name: string) {
    super(`Image codec unsupported for file: ${name}.`, 'IMAGE_CODEC_UNSUPPORTED');
  }
}

export class PdfExtractionError extends IngestionError {
  constructor(name: string, details: string) {
    super(`Failed to extract text from PDF ${name}: ${details}`, 'PDF_EXTRACTION_ERROR');
  }
}

export class DocxExtractionError extends IngestionError {
  constructor(name: string, details: string) {
    super(`Failed to extract text from DOCX ${name}: ${details}`, 'DOCX_EXTRACTION_ERROR');
  }
}
