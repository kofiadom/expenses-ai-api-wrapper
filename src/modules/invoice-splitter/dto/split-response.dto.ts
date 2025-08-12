import { ApiProperty } from '@nestjs/swagger';

export class InvoiceBoundaryDto {
  @ApiProperty({ description: 'Invoice number/identifier' })
  invoiceNumber: number;

  @ApiProperty({ description: 'Page numbers belonging to this invoice', type: [Number] })
  pages: number[];

  @ApiProperty({ description: 'Confidence score for this grouping', minimum: 0, maximum: 1 })
  confidence: number;

  @ApiProperty({ description: 'Reasoning for this grouping' })
  reasoning: string;
}

export class InvoiceGroupDto {
  @ApiProperty({ description: 'Invoice number/identifier' })
  invoiceNumber: number;

  @ApiProperty({ description: 'Page numbers belonging to this invoice', type: [Number] })
  pages: number[];

  @ApiProperty({ description: 'Combined markdown content for this invoice' })
  content: string;

  @ApiProperty({ description: 'Confidence score for this grouping', minimum: 0, maximum: 1 })
  confidence: number;

  @ApiProperty({ description: 'Reasoning for this grouping' })
  reasoning: string;

  @ApiProperty({ description: 'Total number of pages in this invoice' })
  totalPages: number;

  @ApiProperty({ description: 'Path to split PDF file', nullable: true })
  pdfPath: string | null;

  @ApiProperty({ description: 'Split PDF filename', nullable: true })
  fileName: string | null;

  @ApiProperty({ description: 'Split PDF file size in bytes', nullable: true })
  fileSize: number | null;
}

export class SplitAnalysisDataDto {
  @ApiProperty({ description: 'Original filename' })
  originalFileName: string;

  @ApiProperty({ description: 'Total number of pages in original document' })
  totalPages: number;

  @ApiProperty({ description: 'Whether multiple invoices were detected' })
  hasMultipleInvoices: boolean;

  @ApiProperty({ description: 'Total number of invoices found' })
  totalInvoices: number;

  @ApiProperty({ description: 'Invoice groups with content and PDF paths', type: [InvoiceGroupDto] })
  invoices: InvoiceGroupDto[];

  @ApiProperty({ description: 'Temporary directory containing split files' })
  tempDirectory: string;
}

export class SplitAnalysisResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Analysis results', type: SplitAnalysisDataDto })
  data: SplitAnalysisDataDto;
}
