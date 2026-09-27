export type CapturedBlockType =
  | "heading"
  | "paragraph"
  | "list-item"
  | "button"
  | "link"
  | "other";

export interface CapturedTextBlock {
  reference: string;
  originalText: string;
  location: string;
  type: CapturedBlockType;
}

export interface PageCapture {
  version: string;
  finalUrl: string;
  snapshotHtml: string;
  extractedText: string;
  blocks: CapturedTextBlock[];
}
