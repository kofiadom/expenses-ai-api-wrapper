import { Anthropic } from '@llamaindex/anthropic';
import { ImageQualityAssessmentSchema, type ImageQualityAssessment } from '../schemas/expense-schemas';
import { LangfuseService } from '../services/langfuse.service';
import type { LangfuseTraceClient, LangfuseGenerationClient } from 'langfuse';
import * as fs from 'fs';
import * as path from 'path';
import { BedrockLlmService } from '../utils/bedrockLlm';
import { BaseAgent } from './base.agent';

export class ImageQualityAssessmentAgent extends BaseAgent {
  private llm: any;
  private currentProvider: 'bedrock' | 'anthropic';

  constructor(provider: 'bedrock' | 'anthropic' = 'bedrock', langfuseService?: LangfuseService) {
    super(langfuseService);
    this.currentProvider = provider;

    if (provider === 'bedrock') {
      this.llm = new BedrockLlmService();
    } else {
      this.llm = new Anthropic({
        apiKey: process.env.ANTHROPIC_KEY,
        model: 'claude-3-5-sonnet-20241022',
      });
    }
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

  async assessImageQuality(imagePath: string, parentTrace?: LangfuseTraceClient): Promise<ImageQualityAssessment> {
    const startTime = new Date();
    let trace: LangfuseTraceClient | null = null;
    let generation: LangfuseGenerationClient | null = null;

    this.logger.log(`🤖 Starting LLM-based quality assessment for: ${path.basename(imagePath)}`);

    try {
      // Get image info for context
      const imageInfo = this.getImageInfo(imagePath);

      // Create Langfuse trace
      const traceInput = {
        imagePath: path.basename(imagePath),
        imageInfo,
        assessmentType: 'llm_simulation',
      };

      // Get the assessment prompt from Langfuse
      const assessmentPrompt = await this.getPromptTemplate('image-quality-assessment-prompt');
      const promptObject = this.getLastPromptObject();
      const promptInfo = { ...this.lastPromptInfo! };

      // Create the full user prompt that will be sent to the LLM
      const userPrompt = `Simulate a quality assessment for an expense document image. ${imageInfo}\n\n${assessmentPrompt}`;

      if (parentTrace) {
        // Create as a span within parent trace with prompt linking
        generation = this.createGenerationWithPrompt(parentTrace, {
          name: 'image-quality-assessment',
          input: traceInput,
          model: this.getActualModelUsed(),
          startTime,
          metadata: {
            agent: 'ImageQualityAssessmentAgent',
            provider: this.currentProvider,
            imagePath: path.basename(imagePath),
            assessmentType: 'llm_simulation',
            promptName: promptInfo.name,
            promptVersion: promptInfo.version || 'unknown',
          },
        }, promptObject) || null;
      } else {
        // Create standalone trace
        trace = this.langfuseService?.createTrace({
          name: 'image-quality-assessment',
          input: traceInput,
          metadata: {
            agent: 'ImageQualityAssessmentAgent',
            provider: this.currentProvider,
            imagePath: path.basename(imagePath),
            assessmentType: 'llm_simulation',
          },
          tags: ['image-quality-assessment', 'expense-processing'],
        }) || null;

        // Create generation within trace with prompt linking
        generation = this.createGenerationWithPrompt(trace, {
          name: 'quality-assessment-llm-call',
          input: traceInput,
          model: this.getActualModelUsed(),
          startTime,
          metadata: {
            agent: 'ImageQualityAssessmentAgent',
            provider: this.currentProvider,
            promptName: promptInfo.name,
            promptVersion: promptInfo.version || 'unknown',
          },
        }, promptObject) || null;
      }

      // Generate prompt version tags
      const promptVersionTags = this.getPromptVersionTags();

      const response = await this.llm.chat({
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      // Parse the JSON response manually - handle different response formats
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
      const result = ImageQualityAssessmentSchema.parse(parsedResult);

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      // Update Langfuse generation with results
      this.langfuseService?.updateGeneration(generation, {
        output: result,
        usage: {
          // Rough estimate: 4 chars per token
          promptTokens: Math.floor(userPrompt.length / 4),
          completionTokens: Math.floor(rawContent.length / 4),
          totalTokens: Math.floor((userPrompt.length + rawContent.length) / 4),
        },
        endTime,
        metadata: {
          duration_seconds: (duration / 1000).toFixed(1),
          success: true,
          overallQualityScore: result.overall_quality_score,
          suitableForExtraction: result.suitable_for_extraction,
          imagePath: path.basename(imagePath),
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
          assessment_result: result,
          processing_time_ms: duration,
          success: true,
        }, {
          duration_ms: duration,
          success: true,
          overallQualityScore: result.overall_quality_score,
          suitableForExtraction: result.suitable_for_extraction,
          promptVersionTags: promptVersionTags,
        });
      }

      this.logger.log(`Image quality assessment completed: Score ${result.overall_quality_score}/10, Suitable: ${result.suitable_for_extraction} in ${duration}ms`);
      return result;

    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.error(`Image quality assessment failed: ${error.message}`);

      // Update Langfuse with error
      this.langfuseService?.updateGeneration(generation, {
        output: null,
        endTime,
        metadata: {
          duration_ms: duration,
          success: false,
          error: error.message,
          imagePath: path.basename(imagePath),
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
        blur_detection: this.createFallbackIssue('Blur assessment failed'),
        contrast_assessment: this.createFallbackIssue('Contrast assessment failed'),
        glare_identification: this.createFallbackIssue('Glare assessment failed'),
        water_stains: this.createFallbackIssue('Water stain assessment failed'),
        tears_or_folds: this.createFallbackIssue('Tear/fold assessment failed'),
        cut_off_detection: this.createFallbackIssue('Cut-off assessment failed'),
        missing_sections: this.createFallbackIssue('Missing section assessment failed'),
        obstructions: this.createFallbackIssue('Obstruction assessment failed'),
        overall_quality_score: 5,
        suitable_for_extraction: true, // Default to true to not block processing
      };
    }
  }

  private createFallbackIssue(description: string) {
    return {
      detected: false,
      severity_level: 'low' as const,
      confidence_score: 0.5,
      quantitative_measure: 0.0,
      description,
      recommendation: 'Manual review recommended due to assessment failure',
    };
  }

  private getMimeType(imagePath: string): string {
    const ext = path.extname(imagePath).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.tiff':
      case '.tif':
        return 'image/tiff';
      default:
        return 'image/jpeg';
    }
  }

  private getImageInfo(imagePath: string): string {
    const stats = fs.statSync(imagePath);
    const sizeKB = Math.round(stats.size / 1024);
    const filename = path.basename(imagePath);

    return `Filename: ${filename}, Size: ${sizeKB}KB, Format: ${path.extname(imagePath)}`;
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

  formatAssessmentForWorkflow(assessment: ImageQualityAssessment, imagePath: string) {
    return {
      image_path: imagePath,
      assessment_method: 'LLM',
      model_used: this.getActualModelUsed(),
      timestamp: new Date().toISOString(),
      quality_score: assessment.overall_quality_score * 10, // Convert to 0-100 scale
      quality_level: this.getQualityLevel(assessment.overall_quality_score),
      suitable_for_extraction: assessment.suitable_for_extraction,
      ...assessment,
    };
  }

  private getQualityLevel(score: number): string {
    if (score >= 8) return 'excellent';
    if (score >= 6) return 'good';
    if (score >= 4) return 'fair';
    return 'poor';
  }
}
