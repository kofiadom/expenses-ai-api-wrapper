import { BedrockRuntimeClient, InvokeModelCommand, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { Anthropic } from '@llamaindex/anthropic';
import { Logger } from '@nestjs/common';

export interface BedrockConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  region?: string;
  modelId?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  message: {
    content: string;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  modelUsed?: string;
}

/**
 * AWS Bedrock LLM Service with Anthropic fallback
 * Provides a unified interface for Nova and Claude models via Bedrock or Anthropic API
 * - Nova models use Converse API
 * - Claude models use Invoke API
 */
export class BedrockLlmService {
  private readonly logger = new Logger(BedrockLlmService.name);
  private bedrockClient: BedrockRuntimeClient | null = null;
  private anthropicClient: Anthropic | null = null;
  private modelId: string;
  private fallbackEnabled: boolean = true;
  private lastUsedProvider: 'bedrock' | 'anthropic' | null = null;

  constructor(config?: BedrockConfig) {
    // Initialize Bedrock client with service-specific credentials
    try {
      const bedrockConfig = {
        region: config?.region || process.env.BEDROCK_AWS_REGION || 'eu-west-1',
        credentials: config?.accessKeyId && config?.secretAccessKey ? {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
          sessionToken: config?.sessionToken,
        } : {
          accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!,
          sessionToken: process.env.BEDROCK_AWS_SESSION_TOKEN,
        }
      };

      this.bedrockClient = new BedrockRuntimeClient(bedrockConfig);
      this.modelId = config?.modelId || process.env.BEDROCK_MODEL || 'eu.amazon.nova-pro-v1:0';
      this.logger.log(`✅ Bedrock client initialized with model: ${this.modelId}`);
    } catch (error) {
      this.logger.warn(`⚠️ Failed to initialize Bedrock client: ${error.message}`);
      this.bedrockClient = null;
    }

    // Initialize Anthropic fallback client
    try {
      const anthropicKey = process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
      if (anthropicKey) {
        this.anthropicClient = new Anthropic({
          apiKey: anthropicKey,
          model: 'claude-3-5-sonnet-20241022',
        });
        this.logger.log('✅ Anthropic fallback client initialized');
      } else {
        this.logger.warn('⚠️ No Anthropic API key found, fallback disabled');
        this.fallbackEnabled = false;
      }
    } catch (error) {
      this.logger.warn(`⚠️ Failed to initialize Anthropic fallback: ${error.message}`);
      this.anthropicClient = null;
      this.fallbackEnabled = false;
    }
  }

  /**
   * Detect if the current model is Nova or Claude
   */
  private isNovaModel(): boolean {
    return this.modelId.includes('amazon.nova');
  }

  /**
   * Chat with Nova/Claude model via Bedrock or Anthropic fallback
   */
  async chat(options: { messages: ChatMessage[] }): Promise<ChatResponse> {
    // Try Bedrock first
    if (this.bedrockClient) {
      try {
        if (this.isNovaModel()) {
          const result = await this.chatWithNova(options.messages);
          this.lastUsedProvider = 'bedrock';
          return result;
        } else {
          const result = await this.chatWithBedrock(options.messages);
          this.lastUsedProvider = 'bedrock';
          return result;
        }
      } catch (error) {
        this.logger.error(`❌ Bedrock chat failed: ${error.message}`);

        // Fall back to Anthropic if enabled
        if (this.fallbackEnabled && this.anthropicClient) {
          this.logger.log('🔄 Falling back to Anthropic API');
          const result = await this.chatWithAnthropic(options.messages);
          this.lastUsedProvider = 'anthropic';
          return result;
        }

        throw error;
      }
    }

    // Use Anthropic if Bedrock is not available
    if (this.anthropicClient) {
      this.logger.log('📡 Using Anthropic API (Bedrock not available)');
      const result = await this.chatWithAnthropic(options.messages);
      this.lastUsedProvider = 'anthropic';
      return result;
    }

    throw new Error('No LLM provider available (neither Bedrock nor Anthropic)');
  }

  /**
   * Chat using AWS Bedrock Nova models via Converse API
   */
  private async chatWithNova(messages: ChatMessage[]): Promise<ChatResponse> {
    // Convert messages to Nova format
    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const command = new ConverseCommand({
      modelId: this.modelId,
      messages: conversationMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant', // Nova only supports user/assistant in messages
        content: [{ text: msg.content }]
      })),
      system: systemMessage ? [{ text: systemMessage }] : undefined,
      inferenceConfig: {
        maxTokens: 4000,
        topP: 0.9,
        temperature: 0.7
      }
    });

    const response = await this.bedrockClient!.send(command);

    this.logger.log(`✅ Nova chat completed successfully using model: ${this.modelId}`);

    // Return same format as other providers for consistency
    return {
      message: {
        content: response.output?.message?.content?.[0]?.text || ''
      },
      usage: {
        input_tokens: response.usage?.inputTokens || 0,
        output_tokens: response.usage?.outputTokens || 0
      },
      modelUsed: this.modelId
    };
  }

  /**
   * Chat using AWS Bedrock Claude models via Invoke API
   */
  private async chatWithBedrock(messages: ChatMessage[]): Promise<ChatResponse> {
    // Convert messages to Claude format
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const requestBody = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4000,
      system: systemMessage,
      messages: conversationMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    };

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody)
    });

    const response = await this.bedrockClient!.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    this.logger.log(`✅ Bedrock chat completed successfully using model: ${this.modelId}`);

    // Return same format as Anthropic client for consistency
    return {
      message: {
        content: responseBody.content[0].text
      },
      usage: {
        input_tokens: responseBody.usage?.input_tokens || 0,
        output_tokens: responseBody.usage?.output_tokens || 0
      },
      modelUsed: this.modelId
    };
  }

  /**
   * Chat using Anthropic API as fallback
   */
  private async chatWithAnthropic(messages: ChatMessage[]): Promise<ChatResponse> {
    const response = await this.anthropicClient!.chat({ messages });

    // Handle different response formats from Anthropic client
    let content = '';
    if (typeof response === 'string') {
      content = response;
    } else if (response.message?.content) {
      // Handle MessageContent which can be string or array
      const messageContent = response.message.content;
      if (typeof messageContent === 'string') {
        content = messageContent;
      } else if (Array.isArray(messageContent)) {
        content = messageContent.map(item =>
          typeof item === 'string' ? item : (item as any).text || ''
        ).join('');
      }
    } else if ((response as any).content) {
      content = (response as any).content;
    }

    return {
      message: {
        content
      },
      usage: (response as any).usage ? {
        input_tokens: (response as any).usage.input_tokens || 0,
        output_tokens: (response as any).usage.output_tokens || 0
      } : undefined,
      modelUsed: 'claude-3-5-sonnet-20241022'
    };
  }

  /**
   * Get the current provider being used
   */
  getCurrentProvider(): 'bedrock' | 'anthropic' | 'none' {
    if (this.bedrockClient) return 'bedrock';
    if (this.anthropicClient) return 'anthropic';
    return 'none';
  }

  /**
   * Get the model name that was actually used in the last chat call
   */
  getCurrentModelName(): string {
    if (this.lastUsedProvider === 'bedrock') {
      return this.modelId;
    }
    if (this.lastUsedProvider === 'anthropic') {
      return 'claude-3-5-sonnet-20241022';
    }
    // Fallback to available provider if no chat has been made yet
    if (this.bedrockClient) {
      return this.modelId;
    }
    if (this.anthropicClient) {
      return 'claude-3-5-sonnet-20241022';
    }
    return 'unknown';
  }

  /**
   * Check if fallback is available
   */
  isFallbackAvailable(): boolean {
    return this.fallbackEnabled && this.anthropicClient !== null;
  }

  /**
   * Get the provider that was actually used in the last chat call
   */
  getLastUsedProvider(): 'bedrock' | 'anthropic' | null {
    return this.lastUsedProvider;
  }
}
