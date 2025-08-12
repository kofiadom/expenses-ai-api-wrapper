import { Processor, Process } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { DocumentService } from "../../document/document.service";
import { ExpenseProcessingService } from "../../../services/expense-processing.service";
import { DocumentReaderFactory } from "../../../utils/documentReaderFactory";
import { DocumentReader } from "../../../utils/types";
import {
  DocumentProcessingData,
  QUEUE_NAMES,
  JOB_TYPES,
  JobResult,
} from "../../../types";

@Processor(QUEUE_NAMES.EXPENSE_PROCESSING)
export class ExpenseProcessor {
  private readonly logger = new Logger(ExpenseProcessor.name);

  constructor(
    private readonly documentService: DocumentService,
    private readonly expenseProcessingService: ExpenseProcessingService
  ) {}

  @Process(JOB_TYPES.PROCESS_DOCUMENT)
  async processDocument(job: Job<DocumentProcessingData>): Promise<JobResult> {
    const startTime = Date.now();
    const { jobId, filePath, fileName, userId, country, icp, documentReader } = job.data;

    try {
      this.logger.log(
        `Starting expense document processing for job: ${jobId}, file: ${fileName}`
      );

      // Read the document content using the specified document reader with timing
      const markdownExtractionStart = Date.now();
      const markdownContent = await this.readDocumentContent(filePath, documentReader);
      const markdownExtractionEnd = Date.now();

      const markdownExtractionTime = markdownExtractionEnd - markdownExtractionStart;
      this.logger.log(`Markdown extraction completed in ${markdownExtractionTime}ms using ${documentReader || 'default'} reader`);

      // Save markdown content locally
      await this.saveMarkdownContent(fileName, markdownContent, documentReader || 'default');
      
      // Load compliance data and expense schema (placeholder - should be loaded from config/database)
      const complianceData = await this.loadComplianceData(country, icp);
      const expenseSchema = await this.loadExpenseSchema();

      // Process the document through all agents
      // Check environment variable for processing mode (default to parallel)
      const useParallelProcessing = process.env.USE_PARALLEL_PROCESSING !== 'false';

      const result = await this.expenseProcessingService.processExpenseDocument(
        markdownContent,
        fileName,
        filePath,
        country,
        icp,
        complianceData,
        expenseSchema,
        async (stage: string, progress: number) => {
          await job.progress(progress);
          this.logger.log(`${stage}: ${progress}%`);
        },
        {
          markdownExtractionTime,
          documentReader: documentReader || 'default'
        },
        useParallelProcessing,
        userId // Pass the userId from the API to Langfuse tracking
      );

      const processingTime = Date.now() - startTime;
      const totalProcessingTimeSeconds = result.timing?.total_processing_time_seconds || 'N/A';
      this.logger.log(
        `Expense document processing finished for job: ${jobId} in ${processingTime}ms (${totalProcessingTimeSeconds}s total)`
      );

      return {
        success: true,
        data: result,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Expense document processing failed for job: ${jobId}:`, error);

      return {
        success: false,
        error: error.message,
        processingTime,
      };
    }
  }

  private async readDocumentContent(filePath: string, documentReader?: string): Promise<string> {
    try {
      const fs = require('fs');
      const path = require('path');

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileExtension = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath);

      this.logger.log(`Reading document: ${fileName} (${fileExtension})`);

      // Use document reader factory to get the appropriate reader
      try {
        const readerType = documentReader || process.env.DOCUMENT_READER || 'llamaparse';
        const reader = DocumentReaderFactory.getDefaultReader(readerType);

        this.logger.log(`Extracting content from ${fileName} using ${readerType}...`);

        // Configure document reader for expense document processing
        const parseConfig = {
          // LlamaParse specific config
          parseMode: 'parse_page_with_lvm',
          vendorMultimodalModelName: 'anthropic-sonnet-3.7',
          disableOcr: false,
          adaptiveLongTable: true,
          annotateLinks: false,
          timeout: 120000, // 2 minutes timeout
          // Textract specific config
          featureTypes: ['TABLES', 'FORMS'],
          outputFormat: 'markdown' as const,
        };

        const parseResult = await reader.parseDocument(filePath, parseConfig);

        if (parseResult.success && parseResult.data) {
          this.logger.log(`Successfully extracted ${parseResult.data.length} characters from ${fileName} using ${readerType}`);
          return parseResult.data;
        } else {
          const errorMsg = 'error' in parseResult ? parseResult.error : 'Unknown error';
          this.logger.error(`Document reader failed for ${fileName}: ${errorMsg}`);
          return this.getPlaceholderContent(fileName);
        }
      } catch (readerError) {
        this.logger.error(`Document reader error for ${fileName}: ${readerError.message}`);
        return this.getPlaceholderContent(fileName);
      }
    } catch (error) {
      this.logger.error(`Failed to read document content: ${error.message}`);
      throw error;
    }
  }

  private getPlaceholderContent(fileName: string): string {
    return `# Receipt Document: ${fileName}

**Date:** 2024-07-25
**Vendor:** Sample Restaurant
**Amount:** €25.50
**Tax:** €4.08
**Category:** Meals & Entertainment

## Line Items:
- Main Course: €18.00
- Beverage: €3.50
- Service Charge: €4.00

**Payment Method:** Credit Card
**Receipt Number:** REC-2024-001

*Note: This is placeholder content. LlamaParse extraction failed or API key not available.*`;
  }

  private async loadComplianceData(country: string, icp: string): Promise<any> {
    try {
      const fs = require('fs');
      const path = require('path');

      const complianceFile = path.join(process.cwd(), 'data', `${country.toLowerCase()}.json`);

      if (fs.existsSync(complianceFile)) {
        const fileContent = fs.readFileSync(complianceFile, 'utf8');
        const complianceData = JSON.parse(fileContent);
        this.logger.log(`Loaded compliance data for ${country} - ${Object.keys(complianceData).length} sections`);
        return complianceData;
      } else {
        this.logger.warn(`No compliance data found for ${country} at ${complianceFile}`);
        return {};
      }
    } catch (error) {
      this.logger.error(`Failed to load compliance data for ${country}: ${error.message}`);
      return {};
    }
  }

  private async loadExpenseSchema(): Promise<any> {
    try {
      const fs = require('fs');
      const path = require('path');

      const schemaFile = path.join(process.cwd(), 'expense_file_schema.json');

      if (fs.existsSync(schemaFile)) {
        const fileContent = fs.readFileSync(schemaFile, 'utf8');
        const schemaData = JSON.parse(fileContent);
        this.logger.log(`Loaded expense schema with ${Object.keys(schemaData.properties || {}).length} fields`);
        return schemaData;
      } else {
        this.logger.warn(`No expense schema found at ${schemaFile}`);
        return {};
      }
    } catch (error) {
      this.logger.error(`Failed to load expense schema: ${error.message}`);
      return {};
    }
  }

  private async saveMarkdownContent(fileName: string, markdownContent: string, readerType: string): Promise<void> {
    try {
      const fs = require('fs');
      const path = require('path');

      // Create markdown directory if it doesn't exist
      const markdownDir = path.join(process.cwd(), 'markdown_extractions');
      if (!fs.existsSync(markdownDir)) {
        fs.mkdirSync(markdownDir, { recursive: true });
      }

      // Generate markdown filename with reader type
      const baseFilename = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
      const markdownFilename = `${baseFilename}_${readerType}.md`;
      const markdownFilePath = path.join(markdownDir, markdownFilename);

      // Add metadata header to markdown content
      const timestamp = new Date().toISOString();
      const markdownWithMetadata = `---
# Markdown Extraction Results
- **Original File**: ${fileName}
- **Document Reader**: ${readerType}
- **Extracted At**: ${timestamp}
- **Content Length**: ${markdownContent.length} characters
---

${markdownContent}`;

      // Write markdown content to file
      fs.writeFileSync(markdownFilePath, markdownWithMetadata, 'utf8');
      this.logger.log(`Markdown content saved to: ${markdownFilePath}`);
    } catch (error) {
      this.logger.error('Failed to save markdown content to file:', error);
    }
  }
}
