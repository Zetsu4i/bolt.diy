import { BaseProvider } from '~/lib/modules/llm/base-provider';
import { getOpenAILikeModel } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { logger } from '~/utils/logger';

interface OpenAIModelsResponse {
  data: Array<{ id: string }>;
}

/**
 * IBM Granite provider.
 *
 * Granite models are exposed through OpenAI-compatible endpoints (IBM watsonx
 * gateway, vLLM, Ollama, OpenRouter, ...). Configure:
 * - GRANITE_API_BASE_URL : OpenAI-compatible base URL (e.g. https://gateway/v1)
 * - GRANITE_API_KEY      : Bearer token for that endpoint
 * - GRANITE_API_MODELS   : optional fallback model list ("name:limit;name2:limit")
 */
export default class GraniteProvider extends BaseProvider {
  name = 'Granite';
  getApiKeyLink = 'https://www.ibm.com/granite';
  labelForGetApiKey = 'Granite / watsonx access';
  icon = 'i-ph:brain';

  config = {
    baseUrlKey: 'GRANITE_API_BASE_URL',
    apiTokenKey: 'GRANITE_API_KEY',
    modelsKey: 'GRANITE_API_MODELS',
  };

  staticModels: ModelInfo[] = [
    {
      name: 'granite-4.0-h-small',
      label: 'Granite 4.0 H-Small',
      provider: 'Granite',
      maxTokenAllowed: 128000,
    },
    {
      name: 'granite-3.3-8b-instruct',
      label: 'Granite 3.3 8B Instruct',
      provider: 'Granite',
      maxTokenAllowed: 32000,
    },
    {
      name: 'granite-3.3-2b-instruct',
      label: 'Granite 3.3 2B Instruct',
      provider: 'Granite',
      maxTokenAllowed: 32000,
    },
    {
      name: 'granite-3.1-8b-instruct',
      label: 'Granite 3.1 8B Instruct',
      provider: 'Granite',
      maxTokenAllowed: 32000,
    },
    {
      name: 'ibm/granite-3.3-8b-instruct',
      label: 'Granite 3.3 8B (OpenRouter)',
      provider: 'Granite',
      maxTokenAllowed: 32000,
    },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv: Record<string, string> = {},
  ): Promise<ModelInfo[]> {
    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv,
      defaultBaseUrlKey: 'GRANITE_API_BASE_URL',
      defaultApiTokenKey: 'GRANITE_API_KEY',
    });

    if (!baseUrl || !apiKey) {
      return [];
    }

    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: this.createTimeoutSignal(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const res = (await response.json()) as OpenAIModelsResponse;

      return res.data
        .filter((model) => model.id.toLowerCase().includes('granite'))
        .map((model) => ({
          name: model.id,
          label: model.id,
          provider: this.name,
          maxTokenAllowed: 32000,
        }));
    } catch (error) {
      logger.info(`${this.name}: Could not fetch /models endpoint, checking fallback env`, error);

      const modelsEnv = serverEnv['GRANITE_API_MODELS'] || (settings as Record<string, string>)?.['GRANITE_API_MODELS'];

      if (modelsEnv) {
        return this._parseModelsFromEnv(modelsEnv);
      }

      return [];
    }
  }

  private _parseModelsFromEnv(modelsEnv: string): ModelInfo[] {
    const models: ModelInfo[] = [];

    for (const entry of modelsEnv.split(';')) {
      const trimmed = entry.trim();

      if (!trimmed) {
        continue;
      }

      const [modelPath, limitStr] = trimmed.split(':');

      if (!modelPath) {
        continue;
      }

      models.push({
        name: modelPath.trim(),
        label: modelPath.trim(),
        provider: this.name,
        maxTokenAllowed: limitStr ? parseInt(limitStr, 10) : 32000,
      });
    }

    return models;
  }

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;
    const envRecord = this.convertEnvToRecord(serverEnv);

    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: envRecord,
      defaultBaseUrlKey: 'GRANITE_API_BASE_URL',
      defaultApiTokenKey: 'GRANITE_API_KEY',
    });

    if (!baseUrl || !apiKey) {
      throw new Error(`Missing configuration for ${this.name} provider (GRANITE_API_BASE_URL / GRANITE_API_KEY)`);
    }

    return getOpenAILikeModel(baseUrl, apiKey, model);
  }
}
