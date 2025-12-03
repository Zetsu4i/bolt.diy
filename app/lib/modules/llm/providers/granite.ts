import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export default class GraniteProvider extends BaseProvider {
  name = 'Granite';
  getApiKeyLink = 'https://www.ibm.com/products/watsonx-ai';

  config = {
    apiTokenKey: 'GRANITE_API_KEY',
    baseUrlKey: 'GRANITE_BASE_URL',
  };

  staticModels: ModelInfo[] = [
    /*
     * IBM Granite models - Enterprise-focused code and language models
     * Granite 3.1: Latest generation with improved code generation
     * Granite 3.0: Stable models for production use
     */
    {
      name: 'granite-3.1-8b-instruct',
      label: 'Granite 3.1 8B Instruct',
      provider: 'Granite',
      maxTokenAllowed: 8192,
      maxCompletionTokens: 4096,
    },
    {
      name: 'granite-3.1-2b-instruct',
      label: 'Granite 3.1 2B Instruct',
      provider: 'Granite',
      maxTokenAllowed: 8192,
      maxCompletionTokens: 4096,
    },
    {
      name: 'granite-3.0-8b-instruct',
      label: 'Granite 3.0 8B Instruct',
      provider: 'Granite',
      maxTokenAllowed: 8192,
      maxCompletionTokens: 4096,
    },
    {
      name: 'granite-3.0-2b-instruct',
      label: 'Granite 3.0 2B Instruct',
      provider: 'Granite',
      maxTokenAllowed: 8192,
      maxCompletionTokens: 4096,
    },
    {
      name: 'granite-20b-code-instruct',
      label: 'Granite 20B Code Instruct',
      provider: 'Granite',
      maxTokenAllowed: 8192,
      maxCompletionTokens: 4096,
    },
    {
      name: 'granite-34b-code-instruct',
      label: 'Granite 34B Code Instruct',
      provider: 'Granite',
      maxTokenAllowed: 8192,
      maxCompletionTokens: 4096,
    },
    {
      name: 'granite-guardian-3.1-8b',
      label: 'Granite Guardian 3.1 8B',
      provider: 'Granite',
      maxTokenAllowed: 8192,
      maxCompletionTokens: 4096,
    },
    {
      name: 'granite-guardian-3.1-2b',
      label: 'Granite Guardian 3.1 2B',
      provider: 'Granite',
      maxTokenAllowed: 8192,
      maxCompletionTokens: 4096,
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
      defaultBaseUrlKey: 'GRANITE_BASE_URL',
      defaultApiTokenKey: 'GRANITE_API_KEY',
    });

    if (!apiKey || !baseUrl) {
      return [];
    }

    try {
      // IBM Granite/watsonx.ai uses OpenAI-compatible API
      // The models endpoint follows the OpenAI format
      const modelsUrl = `${baseUrl}/models`;

      const response = await fetch(modelsUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('Granite: Failed to fetch models:', response.statusText);
        return [];
      }

      const res = (await response.json()) as any;
      const staticModelIds = this.staticModels.map((m) => m.name);

      // Filter for granite models not already in static list
      const data = (res.data || []).filter(
        (model: any) =>
          model.id &&
          (model.id.includes('granite') || model.id.includes('watsonx')) &&
          !staticModelIds.includes(model.id),
      );

      return data.map((m: any) => {
        // Determine context window based on model name
        let contextWindow = 8192; // default for most Granite models

        if (m.id?.includes('granite-3')) {
          contextWindow = 8192; // Granite 3.x models
        } else if (m.id?.includes('granite-20b') || m.id?.includes('granite-34b')) {
          contextWindow = 8192; // Code models
        }

        // Completion tokens
        const maxCompletionTokens = 4096;

        return {
          name: m.id,
          label: `${m.id} (${Math.floor(contextWindow / 1000)}k context)`,
          provider: this.name,
          maxTokenAllowed: contextWindow,
          maxCompletionTokens,
        };
      });
    } catch (error) {
      console.error('Granite: Error fetching dynamic models:', error);
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

    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: 'GRANITE_BASE_URL',
      defaultApiTokenKey: 'GRANITE_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    // IBM Granite uses OpenAI-compatible API
    // Default to watsonx.ai endpoint if not specified
    const effectiveBaseUrl = baseUrl || 'https://us-south.ml.cloud.ibm.com/ml/v1';

    const granite = createOpenAI({
      apiKey,
      baseURL: effectiveBaseUrl,
    });

    return granite(model);
  }
}
