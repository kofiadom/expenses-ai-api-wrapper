/**
 * Interface for Langfuse prompt templates
 */
export interface PromptTemplate {
  /**
   * Compile the prompt with variables
   */
  compile(variables: Record<string, any>): string | any[];
  
  /**
   * Raw prompt content including {{variables}}
   */
  prompt: string | any[];
  
  /**
   * Optional configuration object
   */
  config?: any;
  
  /**
   * Prompt version from Langfuse
   */
  version?: number;
  
  /**
   * Prompt name
   */
  name?: string;
}

/**
 * Interface for prompt management operations
 */
export interface PromptManager {
  /**
   * Get a prompt from Langfuse with fallback support
   */
  getPrompt(name: string, fallback?: string): Promise<PromptTemplate>;
  
  /**
   * Link a prompt to a generation for metrics tracking
   */
  linkPromptToGeneration(prompt: PromptTemplate, generation: any): void;
}
