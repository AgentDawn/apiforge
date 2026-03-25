import 'reflect-metadata';
import { APIFORGE_METADATA } from './constants';

const NEST_PATH = 'path';
const NEST_METHOD = 'method';
const METHOD_MAP: Record<number, string> = {
  0: 'get', 1: 'post', 2: 'put', 3: 'delete', 4: 'patch',
  5: 'options', 6: 'head', 7: 'all',
};

export interface GeneratorConfig {
  title: string;
  description?: string;
  version?: string;
  servers?: Array<{ url: string; description?: string }>;
  bearerAuth?: { name: string; scheme?: string; bearerFormat?: string };
  tags?: Array<{ name: string; description?: string }>;
  include?: any[];
}

export class DocumentGenerator {
  static async fromApp(app: any, config: GeneratorConfig): Promise<any> {
    const modules = this.getModulesFromApp(app, config.include);
    const controllers = this.getControllersFromModules(modules);
    return this.generate(controllers, config);
  }

  static generate(controllers: any[], config: GeneratorConfig): any {
    const doc: any = {
      openapi: '3.0.0',
      info: { title: config.title, description: config.description || '', version: config.version || '1.0.0' },
      servers: config.servers || [],
      tags: config.tags || [],
      paths: {},
      components: { schemas: {}, securitySchemes: {} },
    };
    if (config.bearerAuth) {
      doc.components.securitySchemes[config.bearerAuth.name] = {
        type: 'http', scheme: config.bearerAuth.scheme || 'bearer',
        bearerFormat: config.bearerAuth.bearerFormat || 'JWT',
      };
    }
    const seenTags = new Set<string>(doc.tags.map((t: any) => t.name));
    for (const ctrl of controllers) this.processController(ctrl, doc, seenTags);
    return doc;
  }

  private static processController(controller: any, doc: any, seenTags: Set<string>) {
    const basePath = Reflect.getMetadata(NEST_PATH, controller) || '';
    const tags = Reflect.getMetadata(APIFORGE_METADATA.API_TAGS, controller) || [];
    // Class-level security (ApiBearerAuth on class stores under API_SECURITY on target)
    const classSecurity = Reflect.getMetadata(APIFORGE_METADATA.API_SECURITY, controller) || [];
    for (const tag of tags) {
      if (!seenTags.has(tag)) { doc.tags.push({ name: tag }); seenTags.add(tag); }
    }
    const proto = controller.prototype;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const fn = proto[name];
      const routePath = Reflect.getMetadata(NEST_PATH, fn);
      const reqMethod = Reflect.getMetadata(NEST_METHOD, fn);
      if (routePath === undefined || reqMethod === undefined) continue;
      const httpMethod = METHOD_MAP[reqMethod];
      if (!httpMethod || httpMethod === 'all') continue;
      const fullPath = this.buildPath(basePath, routePath);
      if (!doc.paths[fullPath]) doc.paths[fullPath] = {};
      doc.paths[fullPath][httpMethod] = this.buildOperation(proto, name, tags, classSecurity, doc);
    }
  }

  private static buildOperation(proto: any, methodName: string, ctrlTags: string[], classSecurity: any[], doc: any): any {
    const fn = proto[methodName];
    // Read metadata from descriptor.value (the function) — @nestjs/swagger format
    const opMeta = Reflect.getMetadata(APIFORGE_METADATA.API_OPERATION, fn) || {};
    const responsesObj = Reflect.getMetadata(APIFORGE_METADATA.API_RESPONSES, fn) || {};
    const parameters = Reflect.getMetadata(APIFORGE_METADATA.API_PARAMS, fn) || [];
    const methodSec = Reflect.getMetadata(APIFORGE_METADATA.API_SECURITY, fn) || [];
    const methodTags = Reflect.getMetadata(APIFORGE_METADATA.API_TAGS, fn) || [];

    const op: any = {
      operationId: opMeta.operationId || methodName,
      summary: opMeta.summary || '',
      description: opMeta.description || '',
      tags: [...ctrlTags, ...methodTags],
      parameters: [],
      responses: {},
    };
    if (opMeta.deprecated) op.deprecated = true;
    if (classSecurity.length > 0 || methodSec.length > 0) {
      op.security = methodSec.length > 0 ? methodSec : classSecurity;
    }

    // Parameters (params, queries, body are all under API_PARAMETERS)
    for (const p of parameters) {
      if (p.in === 'body') continue; // body handled separately
      op.parameters.push({
        name: p.name, in: p.in,
        required: p.required ?? (p.in === 'path'),
        description: p.description || '',
        schema: this.resolveType(p.type, p.enum),
      });
    }

    // Request body from parameters with in:'body' or from design:paramtypes
    const bodyParams = parameters.filter((p: any) => p.in === 'body');
    if (bodyParams.length > 0) {
      const bp = bodyParams[0];
      if (bp.type && this.isDto(bp.type)) {
        this.registerSchema(bp.type, doc);
        op.requestBody = { required: bp.required !== false, content: { 'application/json': { schema: { $ref: '#/components/schemas/' + bp.type.name } } } };
      }
    } else {
      const paramTypes = Reflect.getMetadata('design:paramtypes', proto, methodName) || [];
      for (const pt of paramTypes) {
        if (pt && this.isDto(pt)) {
          this.registerSchema(pt, doc);
          op.requestBody = { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/' + pt.name } } } };
          break;
        }
      }
    }

    // Responses — now stored as object { [status]: { description, type, ... } }
    const statusKeys = Object.keys(responsesObj);
    if (statusKeys.length === 0) {
      op.responses = { '200': { description: 'Success' } };
    } else {
      for (const status of statusKeys) {
        const r = responsesObj[status];
        const s = String(status);
        const rObj: any = { description: r.description || '' };
        if (r.type) {
          this.registerSchema(r.type, doc);
          const schema: any = { $ref: '#/components/schemas/' + r.type.name };
          if (r.isArray) {
            rObj.content = { 'application/json': { schema: { type: 'array', items: schema } } };
          } else {
            rObj.content = { 'application/json': { schema } };
          }
        }
        op.responses[s] = rObj;
      }
    }
    return op;
  }

  private static registerSchema(dtoClass: any, doc: any) {
    const name = dtoClass.name;
    if (doc.components.schemas[name]) return;
    // Mark as registered early to avoid infinite recursion
    doc.components.schemas[name] = { type: 'object', properties: {} };

    const proto = dtoClass.prototype;
    // Read from API_MODEL_PROPERTIES_ARRAY to get list of properties
    const propsArray: string[] = Reflect.getMetadata(APIFORGE_METADATA.API_PROPERTY_ARRAY, proto) || [];
    const schema: any = { type: 'object', properties: {}, required: [] };

    for (const entry of propsArray) {
      const key = entry.startsWith(':') ? entry.slice(1) : entry;
      const opts = Reflect.getMetadata(APIFORGE_METADATA.API_PROPERTY, proto, key) || {};
      const prop: any = {};

      if (opts.type) {
        if (opts.isArray || Array.isArray(opts.type)) {
          const itemType = Array.isArray(opts.type) ? opts.type[0] : opts.type;
          prop.type = 'array';
          if (typeof itemType === 'function' && this.isDto(itemType)) {
            this.registerSchema(itemType, doc);
            prop.items = { $ref: '#/components/schemas/' + itemType.name };
          } else {
            prop.items = this.resolveType(itemType);
          }
        } else if (typeof opts.type === 'function' && this.isDto(opts.type)) {
          this.registerSchema(opts.type, doc);
          Object.assign(prop, { $ref: '#/components/schemas/' + opts.type.name });
        } else {
          Object.assign(prop, this.resolveType(opts.type));
        }
      } else {
        const dt = Reflect.getMetadata('design:type', proto, key);
        if (dt) Object.assign(prop, this.resolveType(dt));
      }
      if (opts.description) prop.description = opts.description;
      if (opts.example !== undefined) prop.example = opts.example;
      if (opts.enum) prop.enum = opts.enum;
      if (opts.minLength !== undefined) prop.minLength = opts.minLength;
      if (opts.minimum !== undefined) prop.minimum = opts.minimum;
      if (opts.nullable) prop.nullable = true;
      schema.properties[key] = prop;
      if (opts.required !== false) schema.required.push(key);
    }
    if (schema.required.length === 0) delete schema.required;
    doc.components.schemas[name] = schema;
  }

  private static resolveType(type: any, enumVals?: any[]): any {
    if (!type) return { type: 'string' };
    if (type === String) return enumVals ? { type: 'string', enum: enumVals } : { type: 'string' };
    if (type === Number) return { type: 'number' };
    if (type === Boolean) return { type: 'boolean' };
    if (type === Array) return { type: 'array', items: { type: 'string' } };
    if (typeof type === 'string') return { type: type === 'integer' ? 'integer' : 'string' };
    return { type: 'string' };
  }

  private static isDto(type: any): boolean {
    if (!type || typeof type !== 'function') return false;
    return !['String', 'Number', 'Boolean', 'Array', 'Object', 'Promise', 'Observable'].includes(type.name);
  }

  private static buildPath(base: string, route: string): string {
    const parts = [base, route].filter(Boolean);
    let path = '/' + parts.join('/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
    path = path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
    return path;
  }

  private static getModulesFromApp(app: any, include?: any[]): any[] {
    try {
      const container = (app as any).container;
      if (!container) return [];
      const modulesMap = container.getModules();
      const modules: any[] = [];
      for (const [, ref] of modulesMap) {
        if (include && include.length > 0) {
          if (include.includes(ref.metatype)) modules.push(ref);
        } else {
          modules.push(ref);
        }
      }
      return modules;
    } catch { return []; }
  }

  private static getControllersFromModules(modules: any[]): any[] {
    const ctrls: any[] = [];
    for (const mod of modules) {
      try {
        if (mod.controllers) {
          for (const [ctrl] of mod.controllers) ctrls.push(ctrl);
        }
      } catch {}
    }
    return ctrls;
  }
}
