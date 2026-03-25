/** Metadata keys matching @nestjs/swagger exactly for compatibility */
export const APIFORGE_METADATA = {
  API_TAGS: 'swagger/apiUseTags',
  API_OPERATION: 'swagger/apiOperation',
  API_RESPONSES: 'swagger/apiResponse',
  API_PARAMS: 'swagger/apiParameters',
  API_QUERIES: 'swagger/apiParameters',
  API_BODY: 'swagger/apiParameters',
  API_BEARER_AUTH: 'swagger/apiSecurity',
  API_PROPERTY: 'swagger/apiModelProperties',
  API_PROPERTY_ARRAY: 'swagger/apiModelPropertiesArray',
  API_EXTRA_MODELS: 'swagger/apiExtraModels',
  API_SECURITY: 'swagger/apiSecurity',
  API_EXCLUDE: 'swagger/apiExcludeEndpoint',
  API_PRODUCES: 'swagger/apiProduces',
  API_CONSUMES: 'swagger/apiConsumes',
};
