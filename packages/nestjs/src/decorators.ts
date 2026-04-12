import 'reflect-metadata';
import { APIFORGE_METADATA } from './constants';

// ─── Helpers (matching @nestjs/swagger internal helpers) ─────

function pickByDefined(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

function getTypeIsArrayTuple(
  input: any,
  isArrayFlag?: boolean,
): [any, boolean | undefined] {
  if (!input) return [input, isArrayFlag];
  if (isArrayFlag) return [input, isArrayFlag];
  const isInputArray = Array.isArray(input);
  const type = isInputArray ? input[0] : input;
  return [type, isInputArray || undefined];
}

// ─── Class-Level Decorators ──────────────────────────────

/**
 * @ApiTags('pets', 'users') — same API as @nestjs/swagger
 * Stores tags array on descriptor.value (method) or target (class).
 */
export function ApiTags(...tags: string[]): ClassDecorator & MethodDecorator {
  return ((target: any, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      const previousMetadata =
        Reflect.getMetadata(APIFORGE_METADATA.API_TAGS, descriptor.value) || [];
      Reflect.defineMetadata(
        APIFORGE_METADATA.API_TAGS,
        [...previousMetadata, ...tags],
        descriptor.value,
      );
      return descriptor;
    }
    Reflect.defineMetadata(APIFORGE_METADATA.API_TAGS, tags, target);
    return target;
  }) as ClassDecorator & MethodDecorator;
}

/**
 * @ApiBearerAuth('JWT') — same API as @nestjs/swagger
 * Delegates to ApiSecurity(name) which stores [{name: []}] under API_SECURITY.
 */
export function ApiBearerAuth(name = 'bearer'): ClassDecorator & MethodDecorator {
  return ApiSecurity(name);
}

/**
 * @ApiSecurity(name, requirements) — same API as @nestjs/swagger
 */
export function ApiSecurity(
  name: string | Record<string, string[]>,
  requirements: string[] = [],
): ClassDecorator & MethodDecorator {
  let metadata: Array<Record<string, string[]>>;
  if (typeof name === 'string') {
    metadata = [{ [name]: requirements }];
  } else {
    metadata = [name];
  }

  return ((target: any, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      const existing =
        Reflect.getMetadata(APIFORGE_METADATA.API_SECURITY, descriptor.value) || [];
      Reflect.defineMetadata(
        APIFORGE_METADATA.API_SECURITY,
        [...existing, ...metadata],
        descriptor.value,
      );
      return descriptor;
    }
    const existing =
      Reflect.getMetadata(APIFORGE_METADATA.API_SECURITY, target) || [];
    Reflect.defineMetadata(
      APIFORGE_METADATA.API_SECURITY,
      [...existing, ...metadata],
      target,
    );
    return target;
  }) as ClassDecorator & MethodDecorator;
}

// ─── Method-Level Decorators ─────────────────────────────

export interface ApiOperationOptions {
  summary?: string;
  description?: string;
  operationId?: string;
  deprecated?: boolean;
}

/**
 * Stores operation metadata on descriptor.value with undefined values filtered out.
 */
export function ApiOperation(options: ApiOperationOptions): MethodDecorator {
  return (target, key, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(
      APIFORGE_METADATA.API_OPERATION,
      pickByDefined({ summary: '', ...options }),
      descriptor.value,
    );
    return descriptor;
  };
}

export interface ApiResponseOptions {
  status?: number | string;
  description?: string;
  type?: any;
  isArray?: boolean;
  schema?: any;
  content?: any;
}

/**
 * Matches @nestjs/swagger response format:
 * metadata is an object keyed by status code: { [status]: omit(options, 'status') }
 * Stored on descriptor.value (method) or target (class).
 */
function createResponseDecorator(defaultStatus: number | string) {
  return (options: ApiResponseOptions = {}): ClassDecorator & MethodDecorator => {
    return ((target: any, key?: string | symbol, descriptor?: PropertyDescriptor) => {
      const [type, isArray] = getTypeIsArrayTuple(options.type, options.isArray);
      const opts = {
        ...options,
        type,
        isArray,
        description: options.description || '',
      };

      const status = opts.status || defaultStatus;
      // omit 'status' from the value, keyed by status code
      const { status: _s, ...rest } = opts;
      const groupedMetadata = { [status]: rest };

      if (descriptor) {
        const responses =
          Reflect.getMetadata(APIFORGE_METADATA.API_RESPONSES, descriptor.value) || {};
        Reflect.defineMetadata(
          APIFORGE_METADATA.API_RESPONSES,
          { ...responses, ...groupedMetadata },
          descriptor.value,
        );
        return descriptor;
      }
      const responses =
        Reflect.getMetadata(APIFORGE_METADATA.API_RESPONSES, target) || {};
      Reflect.defineMetadata(
        APIFORGE_METADATA.API_RESPONSES,
        { ...responses, ...groupedMetadata },
        target,
      );
      return target;
    }) as ClassDecorator & MethodDecorator;
  };
}

export const ApiOkResponse = createResponseDecorator(200);
export const ApiCreatedResponse = createResponseDecorator(201);
export const ApiResponse = createResponseDecorator('default');
export const ApiNotFoundResponse = createResponseDecorator(404);
export const ApiUnauthorizedResponse = createResponseDecorator(401);
export const ApiBadRequestResponse = createResponseDecorator(400);
export const ApiForbiddenResponse = createResponseDecorator(403);
export const ApiNoContentResponse = createResponseDecorator(204);
export const ApiConflictResponse = createResponseDecorator(409);

export interface ApiParamOptions {
  name: string;
  description?: string;
  type?: any;
  required?: boolean;
  enum?: any;
  example?: any;
}

/**
 * Stores parameters as array under API_PARAMETERS on descriptor.value.
 * Matches @nestjs/swagger createParamDecorator format.
 */
export function ApiParam(options: ApiParamOptions): MethodDecorator {
  const { enum: enumVal, ...rest } = options;
  const param: any = {
    name: options.name || '',
    in: 'path',
    ...rest,
  };
  if (enumVal) {
    param.schema = param.schema || {};
    const enumValues = Object.values(enumVal).filter(
      (v) => typeof v === 'string' || typeof v === 'number',
    );
    param.schema.type = typeof enumValues[0] === 'number' ? 'number' : 'string';
    param.schema.enum = enumValues;
  }
  const defaultParamOptions = { name: '', required: true };

  return (target, key, descriptor: PropertyDescriptor) => {
    const parameters =
      Reflect.getMetadata(APIFORGE_METADATA.API_PARAMS, descriptor.value) || [];
    Reflect.defineMetadata(
      APIFORGE_METADATA.API_PARAMS,
      [...parameters, { ...defaultParamOptions, ...pickByDefined(param) }],
      descriptor.value,
    );
    return descriptor;
  };
}

export interface ApiQueryOptions {
  name: string;
  description?: string;
  type?: any;
  required?: boolean;
  enum?: any;
  example?: any;
  isArray?: boolean;
}

/**
 * Stores query parameters under API_PARAMETERS on descriptor.value.
 */
export function ApiQuery(options: ApiQueryOptions): MethodDecorator {
  const { enum: enumVal, ...rest } = options;
  const [type, isArray] = getTypeIsArrayTuple(rest.type, rest.isArray);
  const param: any = {
    name: options.name || '',
    in: 'query',
    ...rest,
    type,
  };
  if (isArray) {
    param.isArray = isArray;
  }
  if (enumVal) {
    param.schema = param.schema || {};
    const enumValues = Object.values(enumVal).filter(
      (v) => typeof v === 'string' || typeof v === 'number',
    );
    param.schema.type = typeof enumValues[0] === 'number' ? 'number' : 'string';
    param.schema.enum = enumValues;
  }
  const defaultQueryOptions = { name: '', required: true };

  return (target, key, descriptor: PropertyDescriptor) => {
    const parameters =
      Reflect.getMetadata(APIFORGE_METADATA.API_QUERIES, descriptor.value) || [];
    Reflect.defineMetadata(
      APIFORGE_METADATA.API_QUERIES,
      [...parameters, { ...defaultQueryOptions, ...pickByDefined(param) }],
      descriptor.value,
    );
    return descriptor;
  };
}

// ─── Property Decorators (DTO) ───────────────────────────

export interface ApiPropertyOptions {
  description?: string;
  type?: any;
  example?: any;
  examples?: any;
  enum?: any;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  default?: any;
  isArray?: boolean;
  nullable?: boolean;
  deprecated?: boolean;
  format?: string;
  oneOf?: any[];
  items?: any;
  properties?: any;
  readOnly?: boolean;
  [key: string]: any;
}

/**
 * Matches @nestjs/swagger createPropertyDecorator:
 * 1. Maintains API_MODEL_PROPERTIES_ARRAY on target (prototype) as [':prop1', ':prop2', ...]
 * 2. Stores individual property metadata under API_MODEL_PROPERTIES on target with propertyKey
 */
export function ApiProperty(options: ApiPropertyOptions = {}): PropertyDecorator {
  const [type, isArray] = getTypeIsArrayTuple(options.type, options.isArray);
  const metadata = pickByDefined({ ...options, type, isArray });

  return (target, propertyKey) => {
    // Step 1: Maintain the properties array (same as @nestjs/swagger)
    const properties =
      Reflect.getMetadata(APIFORGE_METADATA.API_PROPERTY_ARRAY, target) || [];
    const key = `:${String(propertyKey)}`;
    if (!properties.includes(key)) {
      Reflect.defineMetadata(
        APIFORGE_METADATA.API_PROPERTY_ARRAY,
        [...properties, key],
        target,
      );
    }

    // Step 2: Store individual property metadata (same as @nestjs/swagger)
    const existingMetadata = Reflect.getMetadata(
      APIFORGE_METADATA.API_PROPERTY,
      target,
      propertyKey,
    );
    if (existingMetadata) {
      Reflect.defineMetadata(
        APIFORGE_METADATA.API_PROPERTY,
        { ...existingMetadata, ...metadata },
        target,
        propertyKey,
      );
    } else {
      const designType = Reflect.getMetadata('design:type', target, propertyKey);
      Reflect.defineMetadata(
        APIFORGE_METADATA.API_PROPERTY,
        { type: designType, ...metadata },
        target,
        propertyKey,
      );
    }
  };
}

export function ApiPropertyOptional(options: ApiPropertyOptions = {}): PropertyDecorator {
  return ApiProperty({ ...options, required: false });
}

// ─── Body / Exclude / ExtraModels / Produces / Consumes ─────

export interface ApiBodyOptions {
  description?: string;
  type?: any;
  required?: boolean;
  isArray?: boolean;
  schema?: any;
  examples?: any;
}

/**
 * Stores body as parameter entry under API_PARAMETERS on descriptor.value.
 * Matches @nestjs/swagger createParamDecorator format with in:'body'.
 */
export function ApiBody(options: ApiBodyOptions = {}): MethodDecorator {
  const [type, isArray] = getTypeIsArrayTuple(options.type, options.isArray);
  const param: any = {
    in: 'body',
    ...options,
    type,
    isArray,
  };
  const defaultBodyMetadata = { type: String, required: true };

  return (target, key, descriptor: PropertyDescriptor) => {
    const parameters =
      Reflect.getMetadata(APIFORGE_METADATA.API_BODY, descriptor.value) || [];
    Reflect.defineMetadata(
      APIFORGE_METADATA.API_BODY,
      [...parameters, { ...defaultBodyMetadata, ...pickByDefined(param) }],
      descriptor.value,
    );
    return descriptor;
  };
}

/**
 * Stores { disable } on descriptor.value matching @nestjs/swagger format.
 */
export function ApiExcludeEndpoint(disable = true): MethodDecorator {
  return (target, key, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(
      APIFORGE_METADATA.API_EXCLUDE,
      { disable },
      descriptor.value,
    );
    return descriptor;
  };
}

/**
 * Stores extra models array on descriptor.value (method) or target (class).
 */
export function ApiExtraModels(...models: any[]): ClassDecorator & MethodDecorator {
  return ((target: any, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      const existing =
        Reflect.getMetadata(APIFORGE_METADATA.API_EXTRA_MODELS, descriptor.value) || [];
      Reflect.defineMetadata(
        APIFORGE_METADATA.API_EXTRA_MODELS,
        [...existing, ...models],
        descriptor.value,
      );
      return descriptor;
    }
    const existing =
      Reflect.getMetadata(APIFORGE_METADATA.API_EXTRA_MODELS, target) || [];
    Reflect.defineMetadata(
      APIFORGE_METADATA.API_EXTRA_MODELS,
      [...existing, ...models],
      target,
    );
    return target;
  }) as ClassDecorator & MethodDecorator;
}

export function ApiProduces(...mimeTypes: string[]): MethodDecorator {
  return (target, key, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(APIFORGE_METADATA.API_PRODUCES, mimeTypes, descriptor.value);
    return descriptor;
  };
}

export function ApiConsumes(...mimeTypes: string[]): MethodDecorator {
  return (target, key, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(APIFORGE_METADATA.API_CONSUMES, mimeTypes, descriptor.value);
    return descriptor;
  };
}

// ─── Mapped Types ───────────────────────────────────────

export function getSchemaPath(model: string | Function): string {
  const modelName = typeof model === 'string' ? model : model.name;
  return `#/components/schemas/${modelName}`;
}

export function PickType<T, K extends keyof T>(
  classRef: new (...args: any[]) => T,
  keys: readonly K[],
): new () => Pick<T, K> {
  class PickTypeClass {
    constructor() {
      try {
        const instance = new (classRef as any)();
        for (const key of keys) {
          if ((instance as any)[key] !== undefined) {
            (this as any)[key] = (instance as any)[key];
          }
        }
      } catch {
        // Constructor may require arguments; skip default value copying
      }
    }
  }

  // Copy metadata in @nestjs/swagger format
  const sourcePrototype = classRef.prototype;

  // Copy API_MODEL_PROPERTIES_ARRAY entries for selected keys
  const sourcePropsArray: string[] =
    Reflect.getMetadata(APIFORGE_METADATA.API_PROPERTY_ARRAY, sourcePrototype) || [];
  const pickedPropsArray = sourcePropsArray.filter((entry) => {
    const propName = entry.startsWith(':') ? entry.slice(1) : entry;
    return (keys as readonly string[]).includes(propName);
  });
  Reflect.defineMetadata(
    APIFORGE_METADATA.API_PROPERTY_ARRAY,
    pickedPropsArray,
    PickTypeClass.prototype,
  );

  // Copy individual property metadata
  for (const key of keys) {
    const propMeta = Reflect.getMetadata(
      APIFORGE_METADATA.API_PROPERTY,
      sourcePrototype,
      key as string | symbol,
    );
    if (propMeta) {
      Reflect.defineMetadata(
        APIFORGE_METADATA.API_PROPERTY,
        propMeta,
        PickTypeClass.prototype,
        key as string | symbol,
      );
    }
  }

  return PickTypeClass as any;
}

export function OmitType<T, K extends keyof T>(
  classRef: new (...args: any[]) => T,
  keys: readonly K[],
): new () => Omit<T, K> {
  class OmitTypeClass {
    constructor() {
      try {
        const instance = new (classRef as any)();
        for (const prop of Object.keys(instance)) {
          if (!(keys as readonly string[]).includes(prop)) {
            (this as any)[prop] = (instance as any)[prop];
          }
        }
      } catch {
        // Constructor may require arguments; skip default value copying
      }
    }
  }

  const sourcePrototype = classRef.prototype;
  const sourcePropsArray: string[] =
    Reflect.getMetadata(APIFORGE_METADATA.API_PROPERTY_ARRAY, sourcePrototype) || [];
  const omittedPropsArray = sourcePropsArray.filter((entry) => {
    const propName = entry.startsWith(':') ? entry.slice(1) : entry;
    return !(keys as readonly string[]).includes(propName);
  });
  Reflect.defineMetadata(
    APIFORGE_METADATA.API_PROPERTY_ARRAY,
    omittedPropsArray,
    OmitTypeClass.prototype,
  );

  for (const entry of omittedPropsArray) {
    const key = entry.startsWith(':') ? entry.slice(1) : entry;
    const propMeta = Reflect.getMetadata(
      APIFORGE_METADATA.API_PROPERTY,
      sourcePrototype,
      key,
    );
    if (propMeta) {
      Reflect.defineMetadata(
        APIFORGE_METADATA.API_PROPERTY,
        propMeta,
        OmitTypeClass.prototype,
        key,
      );
    }
  }

  return OmitTypeClass as any;
}
