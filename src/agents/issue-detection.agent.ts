import { Anthropic } from '@llamaindex/anthropic';
import { IssueDetectionResultSchema, type IssueDetectionResult } from '../schemas/expense-schemas';
import { LangfuseService } from '../services/langfuse.service';
import type { LangfuseTraceClient, LangfuseGenerationClient } from 'langfuse';
import * as fs from 'fs';
import * as path from 'path';
import { BedrockLlmService } from '../utils/bedrockLlm';
import { BaseAgent } from './base.agent';

export class IssueDetectionAgent extends BaseAgent {
  private llm: any;
  private expenseSchema: any;
  private currentProvider: 'bedrock' | 'anthropic';

  constructor(provider: 'bedrock' | 'anthropic' = 'bedrock', langfuseService?: LangfuseService) {
    super(langfuseService);
    this.currentProvider = provider;
    this.logger.log(`Initializing IssueDetectionAgent with provider: ${provider}`);

    if (provider === 'bedrock') {
      this.llm = new BedrockLlmService();
    } else {
      this.llm = new Anthropic({
        apiKey: process.env.ANTHROPIC_KEY,
        model: 'claude-3-5-sonnet-20241022',
      });
    }

    // Load expense schema
    this.loadExpenseSchema();
  }

  /**
   * Get the actual model name used, accounting for fallback scenarios
   */
  getActualModelUsed(): string {
    if (this.currentProvider === 'bedrock' && this.llm.getCurrentModelName) {
      // For BedrockLlmService, get the actual model name (handles fallback)
      return this.llm.getCurrentModelName();
    } else if (this.currentProvider === 'bedrock') {
      // Fallback for older BedrockLlmService without getCurrentModelName
      return process.env.BEDROCK_MODEL || 'eu.amazon.nova-pro-v1:0';
    } else {
      // Direct Anthropic usage
      return 'claude-3-5-sonnet-20241022';
    }
  }

  private loadExpenseSchema(): void {
    try {
      const schemaPath = path.join(process.cwd(), 'expense_file_schema.json');
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      this.expenseSchema = JSON.parse(schemaContent);
      this.logger.log('Expense schema loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load expense schema:', error);
      this.expenseSchema = null;
    }
  }

  async analyzeCompliance(
    country: string,
    receiptType: string,
    icp: string,
    complianceData: any,
    extractedData: any,
    parentTrace?: LangfuseTraceClient
  ): Promise<IssueDetectionResult> {
    const startTime = new Date();
    let trace: LangfuseTraceClient | null = null;
    let generation: LangfuseGenerationClient | null = null;

    try {
      this.logger.log(`Starting compliance analysis for ${country}/${icp}`);

      // Create Langfuse trace with exact prompt inputs
      const traceInput = {
        expenseTaxonomyDescription: JSON.stringify(this.expenseSchema?.properties || {}, null, 2),
        country,
        receiptType,
        icp,
        complianceDataJson: JSON.stringify(complianceData, null, 2),
        extractedDataJson: JSON.stringify(extractedData, null, 2)
      };

      // Get the prompt first to have it available for linking
      const combinedPrompt = await this.getPromptTemplate('issue-detection-prompt', {
        expenseTaxonomyDescription: JSON.stringify(this.expenseSchema?.properties || {}, null, 2),
        country,
        receiptType,
        icp,
        complianceDataJson: JSON.stringify(complianceData, null, 2),
        extractedDataJson: JSON.stringify(extractedData, null, 2)
      });
      const promptObject = this.getLastPromptObject();
      const promptInfo = { ...this.lastPromptInfo! };

      if (parentTrace) {
        // Create as a span within parent trace with prompt linking
        generation = this.createGenerationWithPrompt(parentTrace, {
          name: 'issue-detection',
          input: traceInput,
          model: this.getActualModelUsed(),
          startTime,
          metadata: {
            agent: 'IssueDetectionAgent',
            provider: this.currentProvider,
            country,
            icp,
            receiptType,
            promptName: promptInfo.name,
            promptVersion: promptInfo.version || 'unknown',
          },
        }, promptObject) || null;
      } else {
        // Create standalone trace
        trace = this.langfuseService?.createTrace({
          name: 'issue-detection',
          input: traceInput,
          metadata: {
            agent: 'IssueDetectionAgent',
            provider: this.currentProvider,
            country,
            icp,
            receiptType,
          },
          tags: ['issue-detection', 'compliance-analysis', 'expense-processing'],
        }) || null;

        // Create generation within trace with prompt linking
        generation = this.createGenerationWithPrompt(trace, {
          name: 'compliance-analysis-llm-call',
          input: traceInput,
          model: this.getActualModelUsed(),
          startTime,
          metadata: {
            agent: 'IssueDetectionAgent',
            provider: this.currentProvider,
            promptName: promptInfo.name,
            promptVersion: promptInfo.version || 'unknown',
          },
        }, promptObject) || null;
      }

      // Generate prompt version tags (now just one prompt)
      const promptVersionTags = this.getPromptVersionTags();

      const response = await this.llm.chat({
        messages: [
          {
            role: 'user',
            content: combinedPrompt,
          },
        ],
      });

      // Parse the JSON response manually since structured output isn't working as expected
      let rawContent: string;

      // Parse the JSON response manually since structured output isn't working as expected
      if (typeof response.message.content === 'string') {
        rawContent = response.message.content;
      } else if (Array.isArray(response.message.content) && response.message.content.length > 0) {
        // Anthropic format: [{"type":"text","text":"actual JSON content"}]
        const firstItem = response.message.content[0];
        if (firstItem && firstItem.type === 'text' && firstItem.text) {
          rawContent = firstItem.text;
        } else {
          rawContent = JSON.stringify(response.message.content);
        }
      } else if (response.message.content && typeof response.message.content === 'object') {
        rawContent = JSON.stringify(response.message.content);
      } else {
        rawContent = String(response.message.content || '');
      }

      this.logger.debug(`Raw response type: ${typeof response.message.content}`);
      this.logger.debug(`Extracted content: ${rawContent.substring(0, 200)}...`);

      const parsedResult = this.parseJsonResponse(rawContent);
      const result = IssueDetectionResultSchema.parse(parsedResult);

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      // Update Langfuse generation with results
      this.langfuseService?.updateGeneration(generation, {
        output: result,
        usage: {
          // Rough estimate: 4 chars per token
          promptTokens: Math.floor(combinedPrompt.length / 4),
          completionTokens: Math.floor(rawContent.length / 4),
          totalTokens: Math.floor((combinedPrompt.length + rawContent.length) / 4),
        },
        endTime,
        metadata: {
          duration_seconds: (duration / 1000).toFixed(1),
          success: true,
          issuesCount: result.validation_result.issues_count,
          isValid: result.validation_result.is_valid,
          country,
          icp,
          modelUsed: this.getActualModelUsed(),
          provider: this.currentProvider,
          // Prompt is now linked directly to the generation
          promptLinked: true,
          promptName: promptInfo.name,
          promptVersion: promptInfo.version || 'unknown',
        },
      });

      // Finalize trace if it's a standalone trace
      if (trace && !parentTrace) {
        // Add prompt version tags to the trace
        this.langfuseService?.addTagsToTrace(trace, promptVersionTags);
        
        this.langfuseService?.finalizeTrace(trace, {
          compliance_result: result,
          processing_time_ms: duration,
          success: true,
        }, {
          duration_ms: duration,
          success: true,
          issuesCount: result.validation_result.issues_count,
          isValid: result.validation_result.is_valid,
          promptVersionTags: promptVersionTags,
        });
      }

      this.logger.log(`Compliance analysis completed: ${result.validation_result.issues_count} issues found in ${duration}ms`);

      return result;
    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.error('Compliance analysis failed:', error);

      // Update Langfuse with error
      this.langfuseService?.updateGeneration(generation, {
        output: null,
        endTime,
        metadata: {
          duration_ms: duration,
          success: false,
          error: error.message,
          country,
          icp,
        },
      });

      if (trace && !parentTrace) {
        this.langfuseService?.finalizeTrace(trace, null, {
          duration_ms: duration,
          success: false,
          error: error.message,
        });
      }

      // Return fallback result
      return {
        validation_result: {
          is_valid: false,
          issues_count: 1,
          issues: [
            {
              issue_type: 'Standards & Compliance | Fix Identified',
              field: 'system_error',
              description: `Compliance analysis failed: ${error.message}`,
              recommendation: 'Please retry the compliance analysis or contact support.',
              knowledge_base_reference: 'System error during analysis',
            },
          ],
          corrected_receipt: null,
          compliance_summary: 'Analysis failed due to system error',
        },
        technical_details: {
          content_type: 'expense_receipt',
          country: 'unknown',
          icp: 'unknown',
          receipt_type: 'unknown',
          issues_count: 1,
        },
      };
    }
  }


  private parseJsonResponse(content: string): any {
    try {
      // Remove markdown code blocks if present
      const cleanContent = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      return JSON.parse(cleanContent);
    } catch (error) {
      this.logger.error('Failed to parse JSON response:', error);
      throw new Error(`Invalid JSON response: ${error.message}`);
    }
  }
}
