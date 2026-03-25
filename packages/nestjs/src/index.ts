// @apiforge/nestjs - Drop-in replacement for @nestjs/swagger decorators
// with built-in OpenAPI JSON generation

export {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiConflictResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiExcludeEndpoint,
  ApiExtraModels,
  ApiProduces,
  ApiConsumes,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
  PickType,
} from './decorators';

export type {
  ApiOperationOptions,
  ApiResponseOptions,
  ApiParamOptions,
  ApiQueryOptions,
  ApiPropertyOptions,
  ApiBodyOptions,
} from './decorators';

export { DocumentGenerator } from './generator';
export type { GeneratorConfig } from './generator';
