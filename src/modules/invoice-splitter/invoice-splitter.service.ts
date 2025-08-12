import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { InvoiceSplitterAgent } from './agents/invoice-splitter.agent';
import { DocumentReaderFactory } from '../../utils/documentReaderFactory';
import {
  PageMarkdown,
  PageAnalysisResult,
  SplitPdfInfo,
  InvoiceGroup,
  SplitAnalysisResponse
} from './types/invoice-splitter.types';

@Injectable()
export class InvoiceSplitterService {
  private readonly logger = new Logger(InvoiceSplitterService.name);

  constructor(
    private readonly invoiceSplitterAgent: InvoiceSplitterAgent,
    private readonly configService: ConfigService,
  ) {}

  async analyzeAndSplitDocument(
    file: Express.Multer.File,
    options: { documentReader?: string }
  ): Promise<SplitAnalysisResponse> {
    let tempDir: string | null = null;
    
    try {
      this.logger.log(`Starting invoice splitter analysis for file: ${file.originalname}`);
      
      // 1. Create temporary directory
      tempDir = this.getTempDirectory();
      
      // 2. Save original file temporarily
      const originalFilePath = await this.saveFileTemporarily(file, tempDir);
      
      // 3. Extract full document as markdown using Textract (optimized approach)
      const fullMarkdown = await this.extractFullDocumentMarkdown(
        originalFilePath, 
        'textract' // Force Textract for page marker support
      );
      
      // 4. Parse markdown into page structure using page markers
      const pageMarkdowns = this.parseMarkdownPages(fullMarkdown);
      
      // 5. Analyze with LLM to determine page groupings
      const pageAnalysis = await this.invoiceSplitterAgent.analyzePages(pageMarkdowns);
      
      // 6. Create split PDF files based on LLM analysis
      const splitPdfs = await this.createSplitPdfFiles(originalFilePath, pageAnalysis, tempDir);
      
      // 7. Combine results
      const invoiceGroups = this.combineResultsWithPdfPaths(pageMarkdowns, pageAnalysis, splitPdfs);
      
      this.logger.log(`Invoice splitting completed: ${pageAnalysis.totalInvoices} invoices found`);
      
      return {
        success: true,
        data: {
          originalFileName: file.originalname,
          totalPages: pageMarkdowns.length,
          hasMultipleInvoices: pageAnalysis.totalInvoices > 1,
          totalInvoices: pageAnalysis.totalInvoices,
          invoices: invoiceGroups,
          tempDirectory: tempDir
        }
      };
    } catch (error) {
      this.logger.error(`Invoice splitting failed for ${file.originalname}:`, error);
      
      // Clean up temp directory on error
      if (tempDir) {
        await this.cleanupTempDirectory(tempDir);
      }
      
      throw error;
    }
  }

  private async extractFullDocumentMarkdown(
    pdfPath: string, 
    documentReader: string
  ): Promise<string> {
    this.logger.log(`Extracting full document as markdown using ${documentReader}`);
    
    try {
      const reader = DocumentReaderFactory.getDefaultReader(documentReader);
      
      const parseConfig = {
        // Textract specific config
        featureTypes: ['TABLES', 'FORMS'],
        outputFormat: 'markdown' as const,
        timeout: 120000, // Longer timeout for full document
      };
      
      const parseResult = await reader.parseDocument(pdfPath, parseConfig);
      
      if (parseResult.success && parseResult.data) {
        this.logger.log(`Successfully extracted full document (${parseResult.data.length} characters)`);
        return parseResult.data;
      } else {
        const errorMsg = 'error' in parseResult ? parseResult.error : 'Unknown error';
        this.logger.error(`Failed to parse document: ${pdfPath} - ${errorMsg}`);
        throw new Error(`Document parsing failed: ${errorMsg}`);
      }
    } catch (error) {
      this.logger.error(`Error parsing document ${pdfPath}:`, error);
      throw error;
    }
  }

  private parseMarkdownPages(fullMarkdown: string): PageMarkdown[] {
    this.logger.log('Parsing markdown content into page structures');
    
    const pages: PageMarkdown[] = [];
    
    // Split content by page markers (## Page X)
    const pageRegex = /^## Page (\d+)$/gm;
    const matches = [...fullMarkdown.matchAll(pageRegex)];
    
    if (matches.length === 0) {
      this.logger.warn('No page markers found in markdown, treating as single page');
      return [{
        pageNumber: 1,
        content: fullMarkdown,
        filePath: ''
      }];
    }
    
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const pageNumber = parseInt(match[1]);
      const startIndex = match.index! + match[0].length;
      
      // Find end of this page (start of next page or end of document)
      const nextMatch = matches[i + 1];
      const endIndex = nextMatch ? nextMatch.index! : fullMarkdown.length;
      
      // Extract page content
      const pageContent = fullMarkdown.substring(startIndex, endIndex).trim();
      
      if (pageContent.length > 0) {
        pages.push({
          pageNumber,
          content: pageContent,
          filePath: '' // Not needed for this approach
        });
        
        this.logger.debug(`Parsed page ${pageNumber} (${pageContent.length} characters)`);
      }
    }
    
    this.logger.log(`Successfully parsed ${pages.length} pages from markdown`);
    return pages;
  }

  private async createSplitPdfFiles(
    originalPdfPath: string, 
    analysis: PageAnalysisResult,
    outputDir: string
  ): Promise<SplitPdfInfo[]> {
    this.logger.log(`Creating ${analysis.totalInvoices} split PDF files`);
    
    // Load original PDF
    const pdfBuffer = await fs.readFile(originalPdfPath);
    const originalPdf = await PDFDocument.load(pdfBuffer);
    
    const splitPdfs: SplitPdfInfo[] = [];
    
    // Create split PDF for each invoice group
    for (const group of analysis.pageGroups) {
      try {
        const newPdf = await PDFDocument.create();
        
        // Copy pages for this invoice (convert from 1-based to 0-based indexing)
        const pageIndices = group.pages.map(pageNum => pageNum - 1);
        const copiedPages = await newPdf.copyPages(originalPdf, pageIndices);
        
        // Add copied pages to new PDF
        copiedPages.forEach(page => newPdf.addPage(page));
        
        // Save split PDF
        const outputFileName = `invoice_${group.invoiceNumber}.pdf`;
        const outputPath = path.join(outputDir, outputFileName);
        const pdfBytes = await newPdf.save();
        await fs.writeFile(outputPath, pdfBytes);
        
        splitPdfs.push({
          invoiceNumber: group.invoiceNumber,
          pages: group.pages,
          pdfPath: outputPath,
          fileName: outputFileName,
          fileSize: pdfBytes.length
        });
        
        this.logger.log(`Created split PDF: ${outputPath} (${group.pages.length} pages, ${pdfBytes.length} bytes)`);
      } catch (error) {
        this.logger.error(`Failed to create split PDF for invoice ${group.invoiceNumber}:`, error);
        
        // Add placeholder entry
        splitPdfs.push({
          invoiceNumber: group.invoiceNumber,
          pages: group.pages,
          pdfPath: '',
          fileName: '',
          fileSize: 0
        });
      }
    }
    
    return splitPdfs;
  }

  private combineResultsWithPdfPaths(
    pageMarkdowns: PageMarkdown[],
    analysis: PageAnalysisResult, 
    splitPdfs: SplitPdfInfo[]
  ): InvoiceGroup[] {
    
    return analysis.pageGroups.map(group => {
      // Find corresponding split PDF
      const splitPdf = splitPdfs.find(pdf => pdf.invoiceNumber === group.invoiceNumber);
      
      // Combine markdown content from all pages in this group
      const combinedMarkdown = group.pages
        .map(pageNum => {
          const page = pageMarkdowns.find(p => p.pageNumber === pageNum);
          return page ? `# Page ${pageNum}\n\n${page.content}` : '';
        })
        .filter(content => content.length > 0)
        .join('\n\n---\n\n');
      
      return {
        invoiceNumber: group.invoiceNumber,
        pages: group.pages,
        content: combinedMarkdown,
        confidence: group.confidence,
        reasoning: group.reasoning,
        totalPages: group.pages.length,
        // PDF file information
        pdfPath: splitPdf?.pdfPath || null,
        fileName: splitPdf?.fileName || null,
        fileSize: splitPdf?.fileSize || null
      };
    });
  }

  private getTempDirectory(): string {
    const tempDir = path.join(
      this.configService.get('UPLOAD_PATH', './uploads'), 
      'invoice-splits', 
      Date.now().toString()
    );
    
    // Create directory synchronously to ensure it exists immediately
    const fsSync = require('fs');
    if (!fsSync.existsSync(tempDir)) {
      fsSync.mkdirSync(tempDir, { recursive: true });
    }
    
    return tempDir;
  }

  private async saveFileTemporarily(file: Express.Multer.File, tempDir: string): Promise<string> {
    const filePath = path.join(tempDir, `original_${file.originalname}`);
    await fs.writeFile(filePath, file.buffer);
    
    this.logger.debug(`Saved temporary file: ${filePath}`);
    return filePath;
  }

  private async cleanupTempDirectory(tempDir: string): Promise<void> {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      this.logger.debug(`Cleaned up temp directory: ${tempDir}`);
    } catch (error) {
      this.logger.warn(`Failed to cleanup temp directory ${tempDir}:`, error);
    }
  }

  // Public method to cleanup temp files (can be called by controller or scheduled job)
  async cleanupTempFiles(tempDirectory: string): Promise<void> {
    await this.cleanupTempDirectory(tempDirectory);
  }
}
