import { Injectable, Logger } from '@nestjs/common';
import { LangfuseService, type ExpenseDatasetItem } from './langfuse.service';
import * as fs from 'fs';
import * as path from 'path';

interface MarkdownFile {
  filename: string;
  content: string;
  metadata: {
    originalFile: string;
    documentReader: string;
    extractedAt: string;
    contentLength: number;
  };
}

interface ProcessingResult {
  filename: string;
  result: any;
  processingTime?: number;
  success: boolean;
}

@Injectable()
export class DatasetManagerService {
  private readonly logger = new Logger(DatasetManagerService.name);

  constructor(private langfuseService: LangfuseService) {}

  /**
   * Create datasets from existing markdown extractions and processing results
   */
  async createExpenseDatasets(): Promise<{
    classification: boolean;
    extraction: boolean;
    issue_detection: boolean;
    citation_generation: boolean;
    image_quality_assessment: boolean;
    complete_pipeline: boolean;
  }> {
    try {
      this.logger.log('Starting dataset creation from existing files...');

      // Read markdown files
      const markdownFiles = await this.readMarkdownExtractions();
      this.logger.log(`Found ${markdownFiles.length} markdown files`);

      // Read processing results
      const processingResults = await this.readProcessingResults();
      this.logger.log(`Found ${processingResults.length} processing results`);

      // Create datasets
      const results = {
        classification: await this.createClassificationDataset(markdownFiles, processingResults),
        extraction: await this.createExtractionDataset(markdownFiles, processingResults),
        issue_detection: await this.createIssueDetectionDataset(markdownFiles, processingResults),
        citation_generation: await this.createCitationGenerationDataset(markdownFiles, processingResults),
        image_quality_assessment: await this.createImageQualityAssessmentDataset(markdownFiles, processingResults),
        complete_pipeline: await this.createCompletePipelineDataset(markdownFiles, processingResults),
      };

      this.logger.log('Dataset creation completed:', results);
      return results;

    } catch (error) {
      this.logger.error('Failed to create datasets:', error);
      return {
        classification: false,
        extraction: false,
        issue_detection: false,
        citation_generation: false,
        image_quality_assessment: false,
        complete_pipeline: false,
      };
    }
  }

  /**
   * Read all markdown extraction files
   */
  private async readMarkdownExtractions(): Promise<MarkdownFile[]> {
    const markdownDir = path.join(process.cwd(), 'markdown_extractions');
    
    if (!fs.existsSync(markdownDir)) {
      this.logger.warn('Markdown extractions directory not found');
      return [];
    }

    const files = fs.readdirSync(markdownDir).filter(file => file.endsWith('.md'));
    const markdownFiles: MarkdownFile[] = [];

    for (const file of files) {
      try {
        const filePath = path.join(markdownDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Parse metadata from the markdown header
        const metadata = this.parseMarkdownMetadata(content);
        
        markdownFiles.push({
          filename: file,
          content,
          metadata: {
            originalFile: metadata.originalFile || file.replace('_textract.md', ''),
            documentReader: metadata.documentReader || 'textract',
            extractedAt: metadata.extractedAt || new Date().toISOString(),
            contentLength: content.length,
          },
        });
      } catch (error) {
        this.logger.warn(`Failed to read markdown file ${file}:`, error);
      }
    }

    return markdownFiles;
  }

  /**
   * Read all processing results
   */
  private async readProcessingResults(): Promise<ProcessingResult[]> {
    const resultsDir = path.join(process.cwd(), 'results');
    
    if (!fs.existsSync(resultsDir)) {
      this.logger.warn('Results directory not found');
      return [];
    }

    const files = fs.readdirSync(resultsDir).filter(file => file.endsWith('.json'));
    const results: ProcessingResult[] = [];

    for (const file of files) {
      try {
        const filePath = path.join(resultsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const result = JSON.parse(content);
        
        results.push({
          filename: file,
          result,
          processingTime: result.metadata?.processing_time,
          success: true,
        });
      } catch (error) {
        this.logger.warn(`Failed to read result file ${file}:`, error);
        results.push({
          filename: file,
          result: null,
          success: false,
        });
      }
    }

    return results;
  }

  /**
   * Create classification-specific dataset
   */
  private async createClassificationDataset(
    markdownFiles: MarkdownFile[],
    processingResults: ProcessingResult[]
  ): Promise<boolean> {
    const datasetName = 'expense-classification';
    
    // Create dataset
    const created = await this.langfuseService.createDataset(
      datasetName,
      'Dataset for file classification experiments - determines if document is an expense and classifies expense type'
    );

    if (!created) {
      return false;
    }

    // Add items to dataset
    let successCount = 0;
    for (const markdownFile of markdownFiles) {
      try {
        // Find corresponding processing result
        const matchingResult = processingResults.find(result => 
          this.normalizeFilename(result.filename) === this.normalizeFilename(markdownFile.filename)
        );

        if (!matchingResult?.result?.classification) {
          this.logger.warn(`No classification result found for ${markdownFile.filename}`);
          continue;
        }

        // Load expense schema (same as agent does)
        const expenseSchema = this.loadExpenseSchema();

        const item: ExpenseDatasetItem = {
          input: {
            schemaFieldsDescription: expenseSchema?.properties || {},
            markdownContent: this.extractContentFromMarkdown(markdownFile.content),
            expectedCountry: this.inferCountryFromFile(markdownFile.filename) || "Not specified"
          },
          expectedOutput: {
            classification: matchingResult.result.classification,
          },
          metadata: {
            filename: markdownFile.metadata.originalFile,
            processingComplexity: this.assessComplexity(markdownFile.content),
            language: matchingResult.result.classification?.language || 'unknown',
            documentReader: markdownFile.metadata.documentReader,
            processingTime: matchingResult.processingTime,
          },
        };

        const added = await this.langfuseService.addDatasetItem(datasetName, item);
        if (added) {
          successCount++;
        }
      } catch (error) {
        this.logger.error(`Failed to add classification item for ${markdownFile.filename}:`, error);
      }
    }

    this.logger.log(`Added ${successCount}/${markdownFiles.length} items to classification dataset`);
    return successCount > 0;
  }

  /**
   * Create extraction-specific dataset
   */
  private async createExtractionDataset(
    markdownFiles: MarkdownFile[],
    processingResults: ProcessingResult[]
  ): Promise<boolean> {
    const datasetName = 'expense-extraction';
    
    const created = await this.langfuseService.createDataset(
      datasetName,
      'Dataset for data extraction experiments - extracts structured data from expense documents'
    );

    if (!created) {
      return false;
    }

    let successCount = 0;
    for (const markdownFile of markdownFiles) {
      try {
        const matchingResult = processingResults.find(result => 
          this.normalizeFilename(result.filename) === this.normalizeFilename(markdownFile.filename)
        );

        if (!matchingResult?.result?.extraction) {
          continue;
        }

        const item: ExpenseDatasetItem = {
          input: {
            markdownContent: this.extractContentFromMarkdown(markdownFile.content)
          },
          expectedOutput: {
            extraction: matchingResult.result.extraction,
          },
          metadata: {
            filename: markdownFile.metadata.originalFile,
            processingComplexity: this.assessComplexity(markdownFile.content),
            language: matchingResult.result.classification?.language || 'unknown',
            documentReader: markdownFile.metadata.documentReader,
            processingTime: matchingResult.processingTime,
          },
        };

        const added = await this.langfuseService.addDatasetItem(datasetName, item);
        if (added) {
          successCount++;
        }
      } catch (error) {
        this.logger.error(`Failed to add extraction item for ${markdownFile.filename}:`, error);
      }
    }

    this.logger.log(`Added ${successCount}/${markdownFiles.length} items to extraction dataset`);
    return successCount > 0;
  }

  /**
   * Create issue detection dataset
   */
  private async createIssueDetectionDataset(
    markdownFiles: MarkdownFile[],
    processingResults: ProcessingResult[]
  ): Promise<boolean> {
    const datasetName = 'expense-issue-detection';
    
    const created = await this.langfuseService.createDataset(
      datasetName,
      'Dataset for issue detection experiments - analyzes compliance and identifies issues in expense documents'
    );

    if (!created) {
      return false;
    }

    let successCount = 0;
    for (const markdownFile of markdownFiles) {
      try {
        const matchingResult = processingResults.find(result => 
          this.normalizeFilename(result.filename) === this.normalizeFilename(markdownFile.filename)
        );

        if (!matchingResult?.result?.compliance) {
          continue;
        }

        // Load expense schema and compliance data (same as agent receives)
        const expenseSchema = this.loadExpenseSchema();
        const country = this.inferCountryFromFile(markdownFile.filename);
        const complianceData = await this.loadComplianceData(country);

        const item: ExpenseDatasetItem = {
          input: {
            expenseTaxonomyDescription: expenseSchema?.properties || {},
            country,
            receiptType: matchingResult.result.classification?.expense_type || 'unknown',
            icp: 'Global People',
            complianceData: complianceData,
            extractedData: matchingResult.result.extraction || {}
          },
          expectedOutput: {
            compliance: matchingResult.result.compliance,
          },
          metadata: {
            filename: markdownFile.metadata.originalFile,
            processingComplexity: this.assessComplexity(markdownFile.content),
            language: matchingResult.result.classification?.language || 'unknown',
            documentReader: markdownFile.metadata.documentReader,
            processingTime: matchingResult.processingTime,
          },
        };

        const added = await this.langfuseService.addDatasetItem(datasetName, item);
        if (added) {
          successCount++;
        }
      } catch (error) {
        this.logger.error(`Failed to add issue detection item for ${markdownFile.filename}:`, error);
      }
    }

    this.logger.log(`Added ${successCount}/${markdownFiles.length} items to issue detection dataset`);
    return successCount > 0;
  }

  /**
   * Create citation generation dataset
   */
  private async createCitationGenerationDataset(
    markdownFiles: MarkdownFile[],
    processingResults: ProcessingResult[]
  ): Promise<boolean> {
    const datasetName = 'expense-citation-generation';
    
    const created = await this.langfuseService.createDataset(
      datasetName,
      'Dataset for citation generation experiments - generates citations linking extracted data to source text'
    );

    if (!created) {
      return false;
    }

    let successCount = 0;
    for (const markdownFile of markdownFiles) {
      try {
        const matchingResult = processingResults.find(result => 
          this.normalizeFilename(result.filename) === this.normalizeFilename(markdownFile.filename)
        );

        if (!matchingResult?.result?.citations) {
          continue;
        }

        const item: ExpenseDatasetItem = {
          input: {
            extractedData: matchingResult.result.extraction || {},
            markdownContent: this.extractContentFromMarkdown(markdownFile.content)
          },
          expectedOutput: {
            citations: matchingResult.result.citations,
          },
          metadata: {
            filename: markdownFile.metadata.originalFile,
            processingComplexity: this.assessComplexity(markdownFile.content),
            language: matchingResult.result.classification?.language || 'unknown',
            documentReader: markdownFile.metadata.documentReader,
            processingTime: matchingResult.processingTime,
          },
        };

        const added = await this.langfuseService.addDatasetItem(datasetName, item);
        if (added) {
          successCount++;
        }
      } catch (error) {
        this.logger.error(`Failed to add citation generation item for ${markdownFile.filename}:`, error);
      }
    }

    this.logger.log(`Added ${successCount}/${markdownFiles.length} items to citation generation dataset`);
    return successCount > 0;
  }

  /**
   * Create image quality assessment dataset
   */
  private async createImageQualityAssessmentDataset(
    markdownFiles: MarkdownFile[],
    processingResults: ProcessingResult[]
  ): Promise<boolean> {
    const datasetName = 'expense-image-quality-assessment';
    
    const created = await this.langfuseService.createDataset(
      datasetName,
      'Dataset for image quality assessment experiments - evaluates document image quality for processing'
    );

    if (!created) {
      return false;
    }

    let successCount = 0;
    for (const markdownFile of markdownFiles) {
      try {
        const matchingResult = processingResults.find(result => 
          this.normalizeFilename(result.filename) === this.normalizeFilename(markdownFile.filename)
        );

        if (!matchingResult?.result?.image_quality_assessment) {
          continue;
        }

        const item: ExpenseDatasetItem = {
          input: {
            imagePath: markdownFile.metadata.originalFile,
            imageInfo: `Filename: ${markdownFile.metadata.originalFile}, Size: ${Math.round(markdownFile.content.length / 1024)}KB, Format: .pdf`,
            assessmentType: 'llm_simulation',
          },
          expectedOutput: {
            image_quality_assessment: matchingResult.result.image_quality_assessment,
          },
          metadata: {
            filename: markdownFile.metadata.originalFile,
            processingComplexity: this.assessComplexity(markdownFile.content),
            language: matchingResult.result.classification?.language || 'unknown',
            documentReader: markdownFile.metadata.documentReader,
            processingTime: matchingResult.processingTime,
          },
        };

        const added = await this.langfuseService.addDatasetItem(datasetName, item);
        if (added) {
          successCount++;
        }
      } catch (error) {
        this.logger.error(`Failed to add image quality assessment item for ${markdownFile.filename}:`, error);
      }
    }

    this.logger.log(`Added ${successCount}/${markdownFiles.length} items to image quality assessment dataset`);
    return successCount > 0;
  }

  /**
   * Create complete pipeline dataset
   */
  private async createCompletePipelineDataset(
    markdownFiles: MarkdownFile[],
    processingResults: ProcessingResult[]
  ): Promise<boolean> {
    const datasetName = 'expense-complete-pipeline';
    
    const created = await this.langfuseService.createDataset(
      datasetName,
      'Dataset for complete expense processing pipeline experiments - end-to-end processing'
    );

    if (!created) {
      return false;
    }

    let successCount = 0;
    for (const markdownFile of markdownFiles) {
      try {
        const matchingResult = processingResults.find(result => 
          this.normalizeFilename(result.filename) === this.normalizeFilename(markdownFile.filename)
        );

        if (!matchingResult?.result) {
          continue;
        }

        // Load expense schema
        const expenseSchema = this.loadExpenseSchema();
        const country = this.inferCountryFromFile(markdownFile.filename);
        const markdownContent = this.extractContentFromMarkdown(markdownFile.content);

        const item: ExpenseDatasetItem = {
          input: {
            markdownContent,
            country,
            filename: markdownFile.metadata.originalFile,
          },
          expectedOutput: {
            classification: matchingResult.result.classification,
            extraction: matchingResult.result.extraction,
            compliance: matchingResult.result.compliance,
            citations: matchingResult.result.citations,
          },
          metadata: {
            filename: markdownFile.metadata.originalFile,
            processingComplexity: this.assessComplexity(markdownFile.content),
            language: matchingResult.result.classification?.language || 'unknown',
            documentReader: markdownFile.metadata.documentReader,
            processingTime: matchingResult.processingTime,
          },
        };

        const added = await this.langfuseService.addDatasetItem(datasetName, item);
        if (added) {
          successCount++;
        }
      } catch (error) {
        this.logger.error(`Failed to add complete pipeline item for ${markdownFile.filename}:`, error);
      }
    }

    this.logger.log(`Added ${successCount}/${markdownFiles.length} items to complete pipeline dataset`);
    return successCount > 0;
  }

  /**
   * Parse metadata from markdown file header
   */
  private parseMarkdownMetadata(content: string): Record<string, string> {
    const metadata: Record<string, string> = {};
    const lines = content.split('\n');
    
    let inMetadata = false;
    for (const line of lines) {
      if (line.trim() === '---') {
        if (inMetadata) break; // End of metadata
        inMetadata = true;
        continue;
      }
      
      if (inMetadata && line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        const cleanKey = key.replace('**', '').replace('-', '').trim();
        metadata[cleanKey] = value;
      }
    }
    
    return metadata;
  }

  /**
   * Extract actual content from markdown (remove metadata header)
   */
  private extractContentFromMarkdown(content: string): string {
    const lines = content.split('\n');
    let startIndex = 0;
    let metadataEnded = false;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        if (metadataEnded) {
          startIndex = i + 1;
          break;
        }
        metadataEnded = true;
      }
    }
    
    return lines.slice(startIndex).join('\n').trim();
  }

  /**
   * Infer country from filename
   */
  private inferCountryFromFile(filename: string): string {
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.includes('german')) return 'Germany';
    if (lowerFilename.includes('austria')) return 'Austria';
    if (lowerFilename.includes('italy')) return 'Italy';
    if (lowerFilename.includes('swiss')) return 'Switzerland';
    return 'Germany'; // Default
  }

  /**
   * Assess processing complexity based on content
   */
  private assessComplexity(content: string): 'simple' | 'medium' | 'complex' {
    const length = content.length;
    const lines = content.split('\n').length;
    
    if (length < 500 || lines < 20) return 'simple';
    if (length < 1500 || lines < 50) return 'medium';
    return 'complex';
  }

  /**
   * Normalize filename for matching
   */
  private normalizeFilename(filename: string): string {
    return filename
      .replace('_textract.md', '')
      .replace('_result.json', '')
      .replace('_processed.json', '')
      .toLowerCase();
  }

  /**
   * Load expense schema (same as IssueDetectionAgent does)
   */
  private loadExpenseSchema(): any {
    try {
      const schemaPath = path.join(process.cwd(), 'expense_file_schema.json');
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      return JSON.parse(schemaContent);
    } catch (error) {
      this.logger.error('Failed to load expense schema:', error);
      return null;
    }
  }

  /**
   * Load compliance data (same as ExpenseProcessor does)
   */
  private async loadComplianceData(country: string): Promise<any> {
    try {
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

  /**
   * Get dataset statistics
   */
  async getDatasetStats(): Promise<Record<string, any>> {
    try {
      const markdownFiles = await this.readMarkdownExtractions();
      const processingResults = await this.readProcessingResults();

      return {
        markdown_files: markdownFiles.length,
        processing_results: processingResults.length,
        languages: [...new Set(markdownFiles.map(f => this.inferCountryFromFile(f.filename)))],
        complexity_distribution: {
          simple: markdownFiles.filter(f => this.assessComplexity(f.content) === 'simple').length,
          medium: markdownFiles.filter(f => this.assessComplexity(f.content) === 'medium').length,
          complex: markdownFiles.filter(f => this.assessComplexity(f.content) === 'complex').length,
        },
        avg_content_length: Math.round(markdownFiles.reduce((sum, f) => sum + f.content.length, 0) / markdownFiles.length),
      };
    } catch (error) {
      this.logger.error('Failed to get dataset stats:', error);
      return {};
    }
  }
}
