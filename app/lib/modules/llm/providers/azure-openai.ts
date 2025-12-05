import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createAzure } from '@ai-sdk/azure';

export default class AzureOpenAIProvider extends BaseProvider {
  name = 'AzureOpenAI';
  getApiKeyLink = 'https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI';

  config = {
    apiTokenKey: 'AZURE_OPENAI_API_KEY',
    baseUrlKey: 'AZURE_OPENAI_ENDPOINT',
  };

  staticModels: ModelInfo[] = [
    /*
     * Azure OpenAI deployment models - users need to create deployments first
     * These are the common deployment names, but users can customize them
     * Note: Azure uses deployment names, not model names directly
     */
    {
      name: 'gpt-4o',
      label: 'GPT-4o (Azure)',
      provider: 'AzureOpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 4096,
    },
    {
      name: 'gpt-4o-mini',
      label: 'GPT-4o Mini (Azure)',
      provider: 'AzureOpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 4096,
    },
    {
      name: 'gpt-4-turbo',
      label: 'GPT-4 Turbo (Azure)',
      provider: 'AzureOpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 4096,
    },
    {
      name: 'gpt-4',
      label: 'GPT-4 (Azure)',
      provider: 'AzureOpenAI',
      maxTokenAllowed: 8192,
      maxCompletionTokens: 4096,
    },
    {
      name: 'gpt-35-turbo',
      label: 'GPT-3.5 Turbo (Azure)',
      provider: 'AzureOpenAI',
      maxTokenAllowed: 16000,
      maxCompletionTokens: 4096,
    },
    {
      name: 'o1-preview',
      label: 'o1-preview (Azure)',
      provider: 'AzureOpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 32000,
    },
    {
      name: 'o1-mini',
      label: 'o1-mini (Azure)',
      provider: 'AzureOpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 65000,
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
      defaultBaseUrlKey: 'AZURE_OPENAI_ENDPOINT',
      defaultApiTokenKey: 'AZURE_OPENAI_API_KEY',
    });

    if (!apiKey || !baseUrl) {
      return [];
    }

    try {
      // Azure OpenAI uses a different API structure for listing deployments
      // Format: https://{resource-name}.openai.azure.com/openai/deployments?api-version=2024-02-01
      const apiVersion = '2024-02-01';
      const endpoint = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      const deploymentsUrl = `${endpoint}/openai/deployments?api-version=${apiVersion}`;

      const response = await fetch(deploymentsUrl, {
        headers: {
          'api-key': apiKey,
        },
      });

      if (!response.ok) {
        console.error('Azure OpenAI: Failed to fetch deployments:', response.statusText);
        return [];
      }

      const res = (await response.json()) as any;
      const staticModelIds = this.staticModels.map((m) => m.name);

      // Azure returns deployments in data array
      const deployments = res.data || [];

      return deployments
        .filter((deployment: any) => {
          const modelName = deployment.model || deployment.id;
          return !staticModelIds.includes(deployment.id);
        })
        .map((deployment: any) => {
          const modelName = deployment.model || deployment.id;
          const deploymentId = deployment.id;

          // Determine context window based on model name
          let contextWindow = 32000; // default fallback

          if (modelName?.includes('gpt-4o')) {
            contextWindow = 128000;
          } else if (modelName?.includes('gpt-4-turbo') || modelName?.includes('gpt-4-1106')) {
            contextWindow = 128000;
          } else if (modelName?.includes('gpt-4')) {
            contextWindow = 8192;
          } else if (modelName?.includes('gpt-35-turbo') || modelName?.includes('gpt-3.5-turbo')) {
            contextWindow = 16385;
          } else if (modelName?.includes('o1')) {
            contextWindow = 128000;
          }

          // Determine completion token limits
          let maxCompletionTokens = 4096;

          if (modelName?.startsWith('o1-preview')) {
            maxCompletionTokens = 32000;
          } else if (modelName?.startsWith('o1-mini')) {
            maxCompletionTokens = 65000;
          } else if (modelName?.startsWith('o1')) {
            maxCompletionTokens = 32000;
          } else if (modelName?.includes('gpt-4')) {
            maxCompletionTokens = 4096;
          }

          return {
            name: deploymentId,
            label: `${deploymentId} (${Math.floor(contextWindow / 1000)}k context)`,
            provider: this.name,
            maxTokenAllowed: contextWindow,
            maxCompletionTokens,
          };
        });
    } catch (error) {
      console.error('Azure OpenAI: Error fetching dynamic models:', error);
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
      defaultBaseUrlKey: 'AZURE_OPENAI_ENDPOINT',
      defaultApiTokenKey: 'AZURE_OPENAI_API_KEY',
    });

    if (!apiKey || !baseUrl) {
      throw new Error(`Missing API key or endpoint for ${this.name} provider`);
    }

    // Extract resource name from endpoint URL
    const resourceName = baseUrl.match(/https:\/\/(.+?)\.openai\.azure\.com/)?.[1];

    if (!resourceName) {
      throw new Error('Invalid Azure OpenAI endpoint URL. Expected format: https://{resource}.openai.azure.com');
    }

    const azure = createAzure({
      apiKey,
      resourceName,
    });

    return azure(model);
  }
}
