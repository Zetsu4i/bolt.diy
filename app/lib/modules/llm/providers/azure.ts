import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createAzure } from '@ai-sdk/azure';
import { logger } from '~/utils/logger';

/**
 * Azure OpenAI provider.
 *
 * Configure one of the following (via Settings UI, cookies or env):
 * - AZURE_OPENAI_RESOURCE_NAME : your Azure OpenAI resource name (e.g. "my-res")
 * - AZURE_OPENAI_API_BASE_URL  : OR the full resource base URL (e.g. https://my-res.openai.azure.com)
 * - AZURE_OPENAI_API_KEY       : the Azure OpenAI API key
 * - AZURE_OPENAI_API_VERSION   : optional API version (defaults to the SDK default)
 *
 * Model names must match your Azure deployment names (e.g. "gpt-4o").
 */
export default class AzureOpenAIProvider extends BaseProvider {
  name = 'AzureOpenAI';
  getApiKeyLink = 'https://portal.azure.com/#view/Microsoft_Azure_AI/AIStudio/keysAndEndpoint';
  labelForGetApiKey = 'Azure OpenAI keys & endpoint';
  icon = 'i-ph:cloud';

  config = {
    baseUrlKey: 'AZURE_OPENAI_API_BASE_URL',
    apiTokenKey: 'AZURE_OPENAI_API_KEY',
  };

  staticModels: ModelInfo[] = [
    {
      name: 'gpt-4.1',
      label: 'GPT-4.1 (Azure)',
      provider: 'AzureOpenAI',
      maxTokenAllowed: 128000,
    },
    {
      name: 'gpt-4.1-mini',
      label: 'GPT-4.1 mini (Azure)',
      provider: 'AzureOpenAI',
      maxTokenAllowed: 128000,
    },
    {
      name: 'gpt-4o',
      label: 'GPT-4o (Azure)',
      provider: 'AzureOpenAI',
      maxTokenAllowed: 128000,
    },
    {
      name: 'gpt-4o-mini',
      label: 'GPT-4o mini (Azure)',
      provider: 'AzureOpenAI',
      maxTokenAllowed: 128000,
    },
    {
      name: 'gpt-35-turbo',
      label: 'GPT-3.5 Turbo (Azure)',
      provider: 'AzureOpenAI',
      maxTokenAllowed: 16000,
    },
  ];

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;
    const envRecord = this.convertEnvToRecord(serverEnv);
    const providerSetting = providerSettings?.[this.name];
    const extraSettings = (providerSetting || {}) as Record<string, string>;

    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSetting,
      serverEnv: envRecord,
      defaultBaseUrlKey: 'AZURE_OPENAI_API_BASE_URL',
      defaultApiTokenKey: 'AZURE_OPENAI_API_KEY',
    });

    const resourceName = extraSettings['AZURE_OPENAI_RESOURCE_NAME'] || envRecord['AZURE_OPENAI_RESOURCE_NAME'] || undefined;
    const apiVersion = extraSettings['AZURE_OPENAI_API_VERSION'] || envRecord['AZURE_OPENAI_API_VERSION'] || '2025-03-01-preview';

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider (AZURE_OPENAI_API_KEY)`);
    }

    if (!resourceName && !baseUrl) {
      throw new Error(
        `Missing configuration for ${this.name} provider: set AZURE_OPENAI_RESOURCE_NAME (e.g. "my-res") or AZURE_OPENAI_API_BASE_URL (e.g. https://my-res.openai.azure.com)`,
      );
    }

    logger.info(`AzureOpenAI model instance: ${model} (resource=${resourceName || baseUrl}, apiVersion=${apiVersion})`);

    return createAzure({
      ...(resourceName ? { resourceName } : { baseUrl }),
      apiKey,
      apiVersion,
    })(model);
  }
}
