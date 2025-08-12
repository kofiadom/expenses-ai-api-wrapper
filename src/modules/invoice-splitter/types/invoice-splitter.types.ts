export interface PageMarkdown {
  pageNumber: number;
  content: string;
  filePath: string;
}

export interface PageGroup {
  invoiceNumber: number;
  pages: number[];
  confidence: number;
  reasoning: string;
}

export interface PageAnalysisResult {
  totalInvoices: number;
  pageGroups: PageGroup[];
}

export interface SplitPdfInfo {
  invoiceNumber: number;
  pages: number[];
  pdfPath: string;
  fileName: string;
  fileSize: number;
}

export interface InvoiceGroup {
  invoiceNumber: number;
  pages: number[];
  content: string; // Combined markdown content
  confidence: number;
  reasoning: string;
  totalPages: number;
  // PDF file info
  pdfPath: string | null;
  fileName: string | null;
  fileSize: number | null;
}

export interface SplitAnalysisResponse {
  success: boolean;
  data: {
    originalFileName: string;
    totalPages: number;
    hasMultipleInvoices: boolean;
    totalInvoices: number;
    invoices: InvoiceGroup[];
    tempDirectory: string;
  };
}
