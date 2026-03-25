use crate::enricher;
use crate::models::*;
use crate::parser;
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::PathBuf;

pub struct SpecOptions {
    pub title: String,
    pub version: String,
    pub description: Option<String>,
    pub servers: Vec<String>,
}

pub fn build_spec(files: &[PathBuf], options: &SpecOptions) -> OpenApiSpec {
    // Phase 1: Build DTO registry from all files
    let mut all_dtos: Vec<DtoInfo> = Vec::new();
    let mut all_enums: Vec<EnumInfo> = Vec::new();
    let mut file_contents: Vec<(PathBuf, String)> = Vec::new();

    for file in files {
        let content = match fs::read_to_string(file) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let (dtos, enums) = parser::parse_dtos_and_enums(&content);
        all_dtos.extend(dtos);
        all_enums.extend(enums);
        file_contents.push((file.clone(), content));
    }

    // Build schema registry
    let mut schemas: BTreeMap<String, Schema> = BTreeMap::new();

    // Register enums
    for e in &all_enums {
        schemas.insert(
            e.name.clone(),
            Schema::Enum {
                schema_type: "string".to_string(),
                enum_values: e.values.clone(),
            },
        );
    }

    // Build a map from name -> DtoInfo for inheritance resolution
    let dto_map: BTreeMap<String, &DtoInfo> = all_dtos.iter().map(|d| (d.name.clone(), d)).collect();

    // Register DTOs (with inheritance)
    let mut resolved: HashSet<String> = HashSet::new();
    for dto in &all_dtos {
        resolve_dto(dto, &dto_map, &mut schemas, &mut resolved);
    }

    // Phase 2: Parse controllers and build paths
    let mut paths: BTreeMap<String, BTreeMap<String, Operation>> = BTreeMap::new();
    let mut security_schemes: BTreeMap<String, SecurityScheme> = BTreeMap::new();
    let mut referenced_schemas: HashSet<String> = HashSet::new();

    for (_file, content) in &file_contents {
        if !content.contains("@Controller") {
            continue;
        }

        let controllers = parser::parse_controllers(content);

        for controller in controllers {
            for endpoint in &controller.endpoints {
                // Build Operation
                let mut operation = Operation {
                    tags: endpoint.tags.clone(),
                    summary: endpoint.summary.clone(),
                    description: endpoint.description.clone(),
                    operation_id: endpoint.operation_id.clone(),
                    deprecated: if endpoint.deprecated {
                        Some(true)
                    } else {
                        None
                    },
                    parameters: if endpoint.parameters.is_empty() {
                        None
                    } else {
                        Some(endpoint.parameters.clone())
                    },
                    request_body: endpoint.request_body.clone(),
                    responses: endpoint.responses.clone(),
                    security: endpoint.security.clone(),
                };

                // Track security schemes
                if let Some(ref sec) = operation.security {
                    for sec_map in sec {
                        for name in sec_map.keys() {
                            security_schemes.entry(name.clone()).or_insert(SecurityScheme {
                                scheme_type: "http".to_string(),
                                scheme: "bearer".to_string(),
                                bearer_format: "JWT".to_string(),
                            });
                        }
                    }
                }

                // Track referenced schemas
                track_schema_refs(&operation, &mut referenced_schemas);

                // Phase 3: Enrich with throw statements
                let throws = enricher::find_throws(
                    content,
                    endpoint.method_body_start,
                    endpoint.method_body_end,
                );

                for throw_info in &throws {
                    let status_str = throw_info.status_code.to_string();
                    if !operation.responses.contains_key(&status_str) {
                        operation.responses.insert(
                            status_str,
                            Response {
                                description: throw_info.message.clone(),
                                content: None,
                            },
                        );
                    } else {
                        // Append message if different
                        let existing = &operation.responses[&throw_info.status_code.to_string()];
                        if !existing.description.contains(&throw_info.message) {
                            let new_desc =
                                format!("{} | {}", existing.description, throw_info.message);
                            operation.responses.insert(
                                throw_info.status_code.to_string(),
                                Response {
                                    description: new_desc,
                                    content: existing.content.clone(),
                                },
                            );
                        }
                    }
                }

                // Insert into paths — keep the richer version if duplicate
                let path_entry = paths
                    .entry(endpoint.full_path.clone())
                    .or_insert_with(BTreeMap::new);
                if let Some(existing) = path_entry.get(&endpoint.http_method) {
                    // Keep the one with more responses (richer spec)
                    if operation.responses.len() > existing.responses.len() {
                        path_entry.insert(endpoint.http_method.clone(), operation);
                    }
                } else {
                    path_entry.insert(endpoint.http_method.clone(), operation);
                }
            }
        }
    }

    // Resolve transitive schema references
    let mut to_resolve: Vec<String> = referenced_schemas.iter().cloned().collect();
    let mut all_resolved: HashSet<String> = HashSet::new();
    while let Some(name) = to_resolve.pop() {
        if all_resolved.contains(&name) {
            continue;
        }
        all_resolved.insert(name.clone());
        if let Some(schema) = schemas.get(&name) {
            // Check for nested references in schema properties
            if let Schema::Object { properties, .. } = schema {
                if let Some(props) = properties {
                    for prop in props.values() {
                        if let Some(ref ref_path) = prop.ref_path {
                            let ref_name = ref_path.replace("#/components/schemas/", "");
                            to_resolve.push(ref_name);
                        }
                        if let Some(ref items) = prop.items {
                            match items.as_ref() {
                                SchemaOrRef::Ref { ref_path } => {
                                    let ref_name = ref_path.replace("#/components/schemas/", "");
                                    to_resolve.push(ref_name);
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }

    // Build components
    let filtered_schemas: BTreeMap<String, Schema> = schemas
        .into_iter()
        .filter(|(name, _)| all_resolved.contains(name) || referenced_schemas.contains(name))
        .collect();

    let components = {
        let has_schemas = !filtered_schemas.is_empty();
        let has_security = !security_schemes.is_empty();
        if has_schemas || has_security {
            Some(Components {
                schemas: if has_schemas {
                    Some(filtered_schemas)
                } else {
                    None
                },
                security_schemes: if has_security {
                    Some(security_schemes)
                } else {
                    None
                },
            })
        } else {
            None
        }
    };

    let servers = if options.servers.is_empty() {
        None
    } else {
        Some(
            options
                .servers
                .iter()
                .map(|url| Server {
                    url: url.clone(),
                })
                .collect(),
        )
    };

    OpenApiSpec {
        openapi: "3.0.0".to_string(),
        info: Info {
            title: options.title.clone(),
            version: options.version.clone(),
            description: options.description.clone(),
        },
        servers,
        paths,
        components,
    }
}

fn resolve_dto(
    dto: &DtoInfo,
    dto_map: &BTreeMap<String, &DtoInfo>,
    schemas: &mut BTreeMap<String, Schema>,
    resolved: &mut HashSet<String>,
) {
    if resolved.contains(&dto.name) {
        return;
    }
    resolved.insert(dto.name.clone());

    let mut properties = BTreeMap::new();
    let mut required = Vec::new();

    // Resolve parent first
    if let Some(ref parent_name) = dto.extends {
        if let Some(parent) = dto_map.get(parent_name) {
            resolve_dto(parent, dto_map, schemas, resolved);
            // Copy parent properties
            if let Some(Schema::Object {
                properties: Some(ref parent_props),
                required: ref parent_req,
                ..
            }) = schemas.get(parent_name)
            {
                properties.extend(parent_props.clone());
                if let Some(req) = parent_req {
                    required.extend(req.clone());
                }
            }
        }
    }

    // Add own properties
    properties.extend(dto.properties.clone());
    required.extend(dto.required.clone());

    // Deduplicate required
    let req_set: Vec<String> = {
        let mut seen = HashSet::new();
        required
            .into_iter()
            .filter(|r| seen.insert(r.clone()))
            .collect()
    };

    schemas.insert(
        dto.name.clone(),
        Schema::Object {
            schema_type: "object".to_string(),
            properties: if properties.is_empty() {
                None
            } else {
                Some(properties)
            },
            required: if req_set.is_empty() {
                None
            } else {
                Some(req_set)
            },
        },
    );
}

fn track_schema_refs(operation: &Operation, refs: &mut HashSet<String>) {
    // Check request body
    if let Some(ref body) = operation.request_body {
        for media in body.content.values() {
            track_media_schema_refs(&media.schema, refs);
        }
    }

    // Check responses
    for resp in operation.responses.values() {
        if let Some(ref content) = resp.content {
            for media in content.values() {
                track_media_schema_refs(&media.schema, refs);
            }
        }
    }

    // Check parameters
    if let Some(ref params) = operation.parameters {
        for param in params {
            if let Some(ref schema) = param.schema {
                if let Some(ref ref_path) = schema.ref_path {
                    let name = ref_path.replace("#/components/schemas/", "");
                    refs.insert(name);
                }
            }
        }
    }
}

fn track_media_schema_refs(schema: &MediaTypeSchema, refs: &mut HashSet<String>) {
    match schema {
        MediaTypeSchema::Ref { ref_path } => {
            let name = ref_path.replace("#/components/schemas/", "");
            refs.insert(name);
        }
        MediaTypeSchema::Inline { items, .. } => {
            if let Some(ref inner) = items {
                track_media_schema_refs(inner, refs);
            }
        }
    }
}
