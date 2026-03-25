use anyhow::{Result, bail};
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtoService {
    pub name: String,
    pub methods: Vec<ProtoMethod>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtoMethod {
    pub name: String,
    pub input_type: String,
    pub output_type: String,
    pub client_streaming: bool,
    pub server_streaming: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceInfo {
    pub name: String,
    pub method_count: usize,
    pub methods: Vec<String>,
}

/// Parse a .proto file content to extract services and methods.
/// Uses regex-based parsing similar to the web proto parser.
pub fn parse_proto(content: &str) -> Vec<ProtoService> {
    let service_re = Regex::new(r"service\s+(\w+)\s*\{([^}]*)\}").unwrap();
    let method_re = Regex::new(
        r"rpc\s+(\w+)\s*\(\s*(stream\s+)?(\w+)\s*\)\s+returns\s*\(\s*(stream\s+)?(\w+)\s*\)"
    ).unwrap();

    let mut services = Vec::new();

    for service_cap in service_re.captures_iter(content) {
        let name = service_cap[1].to_string();
        let body = &service_cap[2];

        let mut methods = Vec::new();
        for method_cap in method_re.captures_iter(body) {
            methods.push(ProtoMethod {
                name: method_cap[1].to_string(),
                input_type: method_cap[3].to_string(),
                output_type: method_cap[5].to_string(),
                client_streaming: method_cap.get(2).is_some(),
                server_streaming: method_cap.get(4).is_some(),
            });
        }

        services.push(ProtoService { name, methods });
    }

    services
}

/// List all services found in a .proto file.
pub fn list_services(proto_path: &str) -> Result<Vec<ServiceInfo>> {
    let content = std::fs::read_to_string(proto_path)?;
    let services = parse_proto(&content);

    Ok(services
        .into_iter()
        .map(|s| {
            let method_names: Vec<String> = s.methods.iter().map(|m| m.name.clone()).collect();
            ServiceInfo {
                name: s.name,
                method_count: method_names.len(),
                methods: method_names,
            }
        })
        .collect())
}

/// Make a gRPC call to the specified address.
/// TODO: Full gRPC calls require tonic-generated code from .proto files.
/// This is a stub that validates inputs and returns an error directing users
/// to use grpcurl or wait for full tonic codegen support.
pub async fn call_grpc(
    address: &str,
    service: &str,
    method: &str,
    data: &str,
) -> Result<String> {
    // Validate the JSON data
    let _: serde_json::Value = serde_json::from_str(data)
        .map_err(|e| anyhow::anyhow!("Invalid JSON data: {}", e))?;

    bail!(
        "Direct gRPC calls are not yet supported in the Rust CLI.\n\
         Service: {}.{} at {}\n\
         \n\
         For now, use grpcurl:\n\
         grpcurl -plaintext -d '{}' {} {}.{}",
        service, method, address,
        data, address, service, method
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_proto() {
        let proto = r#"
syntax = "proto3";

service Greeter {
    rpc SayHello (HelloRequest) returns (HelloReply);
    rpc SayHelloStream (stream HelloRequest) returns (stream HelloReply);
}

service UserService {
    rpc GetUser (GetUserRequest) returns (User);
}
"#;
        let services = parse_proto(proto);
        assert_eq!(services.len(), 2);
        assert_eq!(services[0].name, "Greeter");
        assert_eq!(services[0].methods.len(), 2);
        assert_eq!(services[0].methods[0].name, "SayHello");
        assert!(!services[0].methods[0].client_streaming);
        assert!(services[0].methods[1].client_streaming);
        assert!(services[0].methods[1].server_streaming);
        assert_eq!(services[1].name, "UserService");
        assert_eq!(services[1].methods.len(), 1);
    }
}
