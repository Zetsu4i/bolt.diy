import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createVertex } from '@ai-sdk/google-vertex';

export default class VertexAIProvider extends BaseProvider {
  name = 'VertexAI';
  getApiKeyLink = 'https://console.cloud.google.com/vertex-ai';

  config = {
    apiTokenKey: 'GOOGLE_VERTEX_AI_CREDENTIALS',
    baseUrlKey: 'GOOGLE_VERTEX_AI_PROJECT',
  };

  staticModels: ModelInfo[] = [
    /*
     * Google Vertex AI models - Enterprise-grade Google AI models
     * Gemini Pro: 2M context, excellent for long-form content
     * Gemini Flash: 1M context, faster and more cost-effective
     */
    {
      name: 'gemini-2.0-flash-exp',
      label: 'Gemini 2.0 Flash (Experimental)',
      provider: 'VertexAI',
      maxTokenAllowed: 1048576, // 1M tokens
      maxCompletionTokens: 8192,
    },
    {
      name: 'gemini-1.5-pro-002',
      label: 'Gemini 1.5 Pro',
      provider: 'VertexAI',
      maxTokenAllowed: 2097152, // 2M tokens
      maxCompletionTokens: 8192,
    },
    {
      name: 'gemini-1.5-flash-002',
      label: 'Gemini 1.5 Flash',
      provider: 'VertexAI',
      maxTokenAllowed: 1048576, // 1M tokens
      maxCompletionTokens: 8192,
    },
    {
      name: 'gemini-1.5-flash-8b',
      label: 'Gemini 1.5 Flash 8B',
      provider: 'VertexAI',
      maxTokenAllowed: 1048576, // 1M tokens
      maxCompletionTokens: 8192,
    },
    {
      name: 'gemini-1.0-pro-002',
      label: 'Gemini 1.0 Pro',
      provider: 'VertexAI',
      maxTokenAllowed: 32768,
      maxCompletionTokens: 8192,
    },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: 'GOOGLE_VERTEX_AI_PROJECT',
      defaultApiTokenKey: 'GOOGLE_VERTEX_AI_CREDENTIALS',
    });

    if (!apiKey || !baseUrl) {
      return [];
    }

    try {
      // Vertex AI model discovery is more complex and requires service account authentication
      // For now, we'll rely on static models since dynamic discovery requires OAuth flow
      // Users can also specify custom model names directly
      return [];
    } catch (error) {
      console.error('Vertex AI: Error fetching dynamic models:', error);
      return [];
    }
  }

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { baseUrl: projectId, apiKey: credentials } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: 'GOOGLE_VERTEX_AI_PROJECT',
      defaultApiTokenKey: 'GOOGLE_VERTEX_AI_CREDENTIALS',
    });

    if (!credentials || !projectId) {
      throw new Error(`Missing credentials or project ID for ${this.name} provider`);
    }

    // Parse credentials JSON if it's a string
    let credentialsObj: any;

    try {
      credentialsObj = typeof credentials === 'string' ? JSON.parse(credentials) : credentials;
    } catch (error) {
      throw new Error('Invalid Google Vertex AI credentials format. Expected JSON.');
    }

    // Get location from credentials or use default
    const location = credentialsObj.location || 'us-central1';

    const vertex = createVertex({
      project: projectId,
      location,
      // googleAuthOptions can be configured here for service account auth
      googleAuthOptions: {
        credentials: credentialsObj,
      },
    });

    return vertex(model);
  }
}
