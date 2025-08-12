import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LangfuseService } from '../../services/langfuse.service';
import { DatasetManagerService } from '../../services/dataset-manager.service';

@ApiTags('langfuse')
@Controller('langfuse')
export class LangfuseController {
  constructor(
    private readonly langfuseService: LangfuseService,
    private readonly datasetManagerService: DatasetManagerService
  ) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get Langfuse integration status',
    description: 'Returns the current status of Langfuse integration including connection and configuration'
  })
  @ApiResponse({
    status: 200,
    description: 'Langfuse status retrieved successfully',
  })
  async getStatus(): Promise<{
    enabled: boolean;
    connected: boolean;
    version: string;
    config?: {
      baseUrl?: string;
      hasCredentials: boolean;
    };
  }> {
    const healthStatus = this.langfuseService.getHealthStatus();
    
    return {
      enabled: healthStatus.enabled,
      connected: healthStatus.connected,
      version: '1.0.0',
      config: healthStatus.enabled ? {
        baseUrl: process.env.LANGFUSE_BASE_URL || 'http://35.159.125.182:3000/',
        hasCredentials: !!(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY),
      } : undefined,
    };
  }

  @Get('datasets/stats')
  @ApiOperation({
    summary: 'Get dataset statistics',
    description: 'Returns statistics about available datasets that can be created from existing markdown files'
  })
  @ApiResponse({
    status: 200,
    description: 'Dataset statistics retrieved successfully',
  })
  async getDatasetStats(): Promise<Record<string, any>> {
    return this.datasetManagerService.getDatasetStats();
  }

  @Post('datasets/create')
  @ApiOperation({
    summary: 'Create Langfuse datasets from existing data',
    description: `
      Creates structured datasets in Langfuse from existing markdown extractions and processing results.
      This will create three datasets:
      - expense-classification: For file classification experiments
      - expense-extraction: For data extraction experiments  
      - expense-complete-pipeline: For end-to-end processing experiments
    `
  })
  @ApiResponse({
    status: 200,
    description: 'Datasets created successfully',
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to create datasets',
  })
  async createDatasets(): Promise<{
    success: boolean;
    datasets: {
      classification: boolean;
      extraction: boolean;
      complete_pipeline: boolean;
    };
    message: string;
  }> {
    try {
      const results = await this.datasetManagerService.createExpenseDatasets();
      const success = Object.values(results).some(result => result === true);
      
      return {
        success,
        datasets: results,
        message: success 
          ? 'Datasets created successfully' 
          : 'Failed to create any datasets. Check logs for details.',
      };
    } catch (error) {
      return {
        success: false,
        datasets: {
          classification: false,
          extraction: false,
          complete_pipeline: false,
        },
        message: `Failed to create datasets: ${error.message}`,
      };
    }
  }

  @Post('datasets/create-sample')
  @ApiOperation({
    summary: 'Create a sample dataset for testing',
    description: 'Creates a small sample dataset for testing Langfuse integration'
  })
  @ApiResponse({
    status: 200,
    description: 'Sample dataset created successfully',
  })
  async createSampleDataset(): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const datasetName = 'expense-sample-test';
      
      // Create sample dataset
      const created = await this.langfuseService.createDataset(
        datasetName,
        'Sample dataset for testing Langfuse integration'
      );

      if (!created) {
        return {
          success: false,
          message: 'Failed to create sample dataset',
        };
      }

      // Add a sample item
      const sampleItem = {
        input: {
          markdownContent: 'Sample receipt content...',
          country: 'Germany',
          filename: 'sample_receipt.png',
        },
        expectedOutput: {
          classification: {
            is_expense: true,
            expense_type: 'meals',
            language: 'german',
            classification_confidence: 95,
          },
        },
        metadata: {
          filename: 'sample_receipt.png',
          processingComplexity: 'simple' as const,
          language: 'german',
          documentReader: 'textract',
        },
      };

      const added = await this.langfuseService.addDatasetItem(datasetName, sampleItem);

      return {
        success: added,
        message: added 
          ? 'Sample dataset created successfully' 
          : 'Dataset created but failed to add sample item',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create sample dataset: ${error.message}`,
      };
    }
  }

  @Post('flush')
  @ApiOperation({
    summary: 'Flush pending Langfuse data',
    description: 'Forces Langfuse to flush any pending traces and generations to the server'
  })
  @ApiResponse({
    status: 200,
    description: 'Langfuse data flushed successfully',
  })
  async flushData(): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.langfuseService.flush();
      return {
        success: true,
        message: 'Langfuse data flushed successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to flush Langfuse data: ${error.message}`,
      };
    }
  }

  @Get('experiments/templates')
  @ApiOperation({
    summary: 'Get experiment templates',
    description: 'Returns available experiment templates for different use cases'
  })
  @ApiResponse({
    status: 200,
    description: 'Experiment templates retrieved successfully',
  })
  async getExperimentTemplates(): Promise<{
    templates: Array<{
      name: string;
      description: string;
      type: 'classification' | 'extraction' | 'pipeline';
      datasetName: string;
      promptVersions: string[];
      evaluationMetrics: string[];
    }>;
  }> {
    return {
      templates: [
        {
          name: 'Classification Prompt Optimization',
          description: 'Test different prompts for expense classification accuracy',
          type: 'classification',
          datasetName: 'expense-classification',
          promptVersions: ['v1-basic', 'v2-detailed', 'v3-schema-focused'],
          evaluationMetrics: ['accuracy', 'precision', 'recall', 'f1-score'],
        },
        {
          name: 'Extraction Field Coverage',
          description: 'Optimize data extraction completeness across different document types',
          type: 'extraction',
          datasetName: 'expense-extraction',
          promptVersions: ['v1-general', 'v2-field-specific', 'v3-country-aware'],
          evaluationMetrics: ['field_coverage', 'extraction_accuracy', 'currency_accuracy'],
        },
        {
          name: 'Multi-Language Performance',
          description: 'Compare performance across different languages and countries',
          type: 'pipeline',
          datasetName: 'expense-complete-pipeline',
          promptVersions: ['v1-english', 'v2-multilingual', 'v3-localized'],
          evaluationMetrics: ['language_detection', 'classification_accuracy', 'extraction_completeness'],
        },
        {
          name: 'Model Provider Comparison',
          description: 'Compare Anthropic vs OpenAI performance',
          type: 'pipeline',
          datasetName: 'expense-complete-pipeline',
          promptVersions: ['anthropic-claude', 'openai-gpt4'],
          evaluationMetrics: ['accuracy', 'latency', 'cost_efficiency', 'consistency'],
        },
      ],
    };
  }
}
