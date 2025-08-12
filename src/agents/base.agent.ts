import { Logger } from '@nestjs/common';
import { LangfuseService } from '../services/langfuse.service';
import { PromptTemplate } from '../interfaces/prompt-management.interface';

/**
 * Interface for storing prompt information for trace association
 */
interface PromptInfo {
  name: string;
  version?: number;
  config?: any;
  promptObject?: any; // Store the actual prompt object for linking
}

/**
 * Base class for all agents with prompt management capabilities
 */
export abstract class BaseAgent {
  protected readonly logger = new Logger(this.constructor.name);
  protected lastPromptInfo?: PromptInfo;

  constructor(
    protected readonly langfuseService?: LangfuseService
  ) {}

  /**
   * Get a prompt template from Langfuse - NO FALLBACKS
   * Complete migration to Langfuse prompt management
   */
  protected async getPromptTemplate(
    promptName: string,
    variables?: Record<string, any>
  ): Promise<string> {
    if (!this.langfuseService) {
      throw new Error('LangfuseService is required for prompt management');
    }

    try {
      // Get prompt from Langfuse (no fallback)
      const promptTemplate = await this.langfuseService.getPrompt(promptName);

      if (!promptTemplate) {
        throw new Error(`Prompt ${promptName} not found in Langfuse`);
      }

      // Debug logging for prompt retrieval
      this.logger.debug(`📋 Retrieved prompt from Langfuse: ${promptName}`);
      this.logger.debug(`📋 Prompt version: ${promptTemplate.version || 'unknown'}`);
      this.logger.debug(`📋 Prompt config: ${JSON.stringify(promptTemplate.config || {})}`);
      
      // Store prompt info for trace association including the prompt object
      this.lastPromptInfo = {
        name: promptName,
        version: promptTemplate.version,
        config: promptTemplate.config,
        promptObject: promptTemplate // Store the actual prompt object for linking
      };

      // Compile prompt with variables
      const compiled = promptTemplate.compile(variables || {});
      return typeof compiled === 'string' ? compiled : String(compiled);
    } catch (error) {
      this.logger.error(`Failed to get prompt ${promptName} from Langfuse: ${error.message}`);
      throw new Error(`Prompt ${promptName} is required but not available in Langfuse`);
    }
  }

  /**
   * Get the last used prompt object for linking to generations
   */
  protected getLastPromptObject(): any | undefined {
    return this.lastPromptInfo?.promptObject;
  }

  /**
   * Create a generation with prompt linking
   */
  protected createGenerationWithPrompt(
    trace: any,
    data: any,
    promptObject?: any
  ): any {
    if (!this.langfuseService) {
      return null;
    }

    // Use provided prompt object or the last used one
    const prompt = promptObject || this.getLastPromptObject();
    
    // Add prompt to generation data for linking
    const generationData = {
      ...data,
      prompt: prompt
    };

    return this.langfuseService.createGeneration(trace, generationData);
  }

  /**
   * Compile a fallback prompt with variables (for when Langfuse is unavailable)
   */
  private compileFallbackPrompt(prompt: string, variables: Record<string, any>): string {
    let compiledPrompt = prompt;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      compiledPrompt = compiledPrompt.replace(new RegExp(placeholder, 'g'), String(value));
    }
    return compiledPrompt;
  }

  /**
   * Get prompt metadata for trace association
   */
  protected getPromptMetadata(): Record<string, any> {
    if (!this.lastPromptInfo) {
      return {};
    }

    return {
      promptName: this.lastPromptInfo.name,
      promptVersion: this.lastPromptInfo.version || 'unknown',
      promptConfig: this.lastPromptInfo.config || {}
    };
  }

  /**
   * Generate prompt version tags for traces
   */
  protected getPromptVersionTags(): string[] {
    if (!this.lastPromptInfo) {
      return [];
    }

    const tags: string[] = [];
    const version = this.lastPromptInfo.version ? String(this.lastPromptInfo.version) : 'unknown';
    
    // Add prompt-specific version tag
    tags.push(`${this.lastPromptInfo.name}-v${version}`);
    
    // Add general version tag if version is known
    if (version !== 'unknown') {
      tags.push(`prompt-v${version}`);
    }

    return tags;
  }

  /**
   * Generate all prompt version tags from multiple prompts used in an agent
   */
  protected getAllPromptVersionTags(promptInfos: PromptInfo[]): string[] {
    const tags: string[] = [];
    const versions = new Set<string>();

    for (const promptInfo of promptInfos) {
      const version = promptInfo.version ? String(promptInfo.version) : 'unknown';
      
      // Add prompt-specific version tag
      tags.push(`${promptInfo.name}-v${version}`);
      
      // Collect unique versions
      if (version !== 'unknown') {
        versions.add(version);
      }
    }

    // Add general version tags for unique versions
    versions.forEach(version => {
      tags.push(`prompt-v${version}`);
    });

    return tags;
  }

  /**
   * Create a prompt template object for backward compatibility
   */
  protected createPromptTemplate(prompt: string): PromptTemplate {
    return {
      compile: (variables: Record<string, any>) => {
        return this.compileFallbackPrompt(prompt, variables);
      },
      prompt,
      config: {}
    };
  }
}
