import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createVertex } from '@ai-sdk/google-vertex';
import { logger } from '~/utils/logger';

/**
 * Google Vertex AI provider.
 *
 * Authentication (server side) via service account credentials:
 * - GOOGLE_VERTEX_APPLICATION_CREDENTIALS_JSON : full service-account JSON (key) OR
 * - GOOGLE_VERTEX_API_KEY                      : (Express mode API key)
 * - GOOGLE_VERTEX_PROJECT                      : GCP project id
 * - GOOGLE_VERTEX_LOCATION                     : e.g. us-central1 (optional)
 *
 * The service-account JSON can be pasted into the API key field of this
 * provider in the Settings UI (it is treated as credentials, never logged).
 */
export default class GoogleVertexProvider extends BaseProvider {
  name = 'GoogleVertex';
  getApiKeyLink = 'https://console.cloud.google.com/iam-admin/serviceaccounts';
  labelForGetApiKey = 'Vertex AI service account JSON / API key';
  icon = 'i-ph:cloud';

  config = {
    apiTokenKey: 'GOOGLE_VERTEX_APPLICATION_CREDENTIALS_JSON',
  };

  staticModels: ModelInfo[] = [
    {
      name: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro (Vertex)',
      provider: 'GoogleVertex',
      maxTokenAllowed: 128000,
    },
    {
      name: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash (Vertex)',
      provider: 'GoogleVertex',
      maxTokenAllowed: 128000,
    },
    {
      name: 'gemini-2.0-flash',
      label: 'Gemini 2.0 Flash (Vertex)',
      provider: 'GoogleVertex',
      maxTokenAllowed: 128000,
    },
    {
      name: 'gemini-1.5-pro',
      label: 'Gemini 1.5 Pro (Vertex)',
      provider: 'GoogleVertex',
      maxTokenAllowed: 128000,
    },
    {
      name: 'gemini-1.5-flash',
      label: 'Gemini 1.5 Flash (Vertex)',
      provider: 'GoogleVertex',
      maxTokenAllowed: 128000,
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
    const settings = (providerSettings?.[this.name] || {}) as Record<string, string>;

    const credentialsJson =
      apiKeys?.[this.name] ||
      settings['GOOGLE_VERTEX_APPLICATION_CREDENTIALS_JSON'] ||
      envRecord['GOOGLE_VERTEX_APPLICATION_CREDENTIALS_JSON'] ||
      envRecord['GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON'] ||
      process?.env?.['GOOGLE_VERTEX_APPLICATION_CREDENTIALS_JSON'];
    const expressApiKey = envRecord['GOOGLE_VERTEX_API_KEY'] || process?.env?.['GOOGLE_VERTEX_API_KEY'];
    const project = settings['GOOGLE_VERTEX_PROJECT'] || envRecord['GOOGLE_VERTEX_PROJECT'];
    const location = settings['GOOGLE_VERTEX_LOCATION'] || envRecord['GOOGLE_VERTEX_LOCATION'] || 'us-central1';

    let vertexOptions: Record<string, unknown> = {};

    if (expressApiKey) {
      // Express mode: authenticate with an API key header instead of a
      // service account.
      vertexOptions = {
        project,
        location,
        headers: { 'x-goog-api-key': expressApiKey },
      };

      logger.info(`GoogleVertex model instance: ${model} (express mode, project=${project || 'auto'})`);
    } else if (credentialsJson) {
      let credentials: object;

      try {
        credentials = JSON.parse(credentialsJson);
      } catch {
        throw new Error(
          `Invalid ${this.name} configuration: the service account key must be the full JSON key file content`,
        );
      }

      vertexOptions = {
        project: project || (credentials as { project_id?: string }).project_id,
        location,
        googleAuthOptions: { credentials },
      };

      logger.info(`GoogleVertex model instance: ${model} (service account, project=${project || 'auto'})`);
    } else {
      // Fall back to ambient credentials (GOOGLE_APPLICATION_CREDENTIALS,
      // workload identity, ...) provided by the runtime.
      vertexOptions = { project, location };

      logger.info(`GoogleVertex model instance: ${model} (ambient credentials, project=${project || 'auto'})`);
    }

    return createVertex(vertexOptions as any)(model);
  }
}
