use apidot_desktop::sidecar::{parse_sidecar_port, SidecarInfo, SidecarManager};

#[test]
fn test_parse_sidecar_ready_line() {
    let output = "[APIDOT_SIDECAR_READY:54321]\n";
    let port = parse_sidecar_port(output).expect("Deveria extrair a porta");
    assert_eq!(port, 54321);
}

#[test]
fn test_parse_sidecar_ready_with_surrounding_output() {
    let output = "info: Application started. [APIDOT_SIDECAR_READY:49152] loopback active\r\n";
    let port = parse_sidecar_port(output).expect("Deveria extrair a porta com texto ao redor");
    assert_eq!(port, 49152);
}

#[test]
fn test_parse_sidecar_ready_trimmed_whitespace() {
    let output = "[APIDOT_SIDECAR_READY: 51234 ]\n";
    let port = parse_sidecar_port(output).expect("Deveria extrair a porta com espaços internos");
    assert_eq!(port, 51234);
}

#[test]
fn test_parse_sidecar_boundary_ports() {
    assert_eq!(parse_sidecar_port("[APIDOT_SIDECAR_READY:1]"), Some(1));
    assert_eq!(parse_sidecar_port("[APIDOT_SIDECAR_READY:65535]"), Some(65535));
}

#[test]
fn test_parse_sidecar_invalid_lines() {
    assert_eq!(parse_sidecar_port("[APIDOT_SIDECAR_READY:0]"), None); // Porta 0 não é válida para escuta
    assert_eq!(parse_sidecar_port("[APIDOT_SIDECAR_READY:65536]"), None); // Overflow de u16
    assert_eq!(parse_sidecar_port("[APIDOT_SIDECAR_READY:-1]"), None); // Negativo
    assert_eq!(parse_sidecar_port("[APIDOT_SIDECAR_READY:not_a_number]"), None); // Texto
    assert_eq!(parse_sidecar_port("[APIDOT_SIDECAR_READY:]"), None); // Vazio
    assert_eq!(parse_sidecar_port("[APIDOT_SIDECAR_READY:54321"), None); // Sem colchete de fechamento
    assert_eq!(parse_sidecar_port(""), None); // Linha vazia
    assert_eq!(parse_sidecar_port("info: Starting Kestrel server..."), None); // Linha de log comum
}

#[test]
fn test_sidecar_info_serialization_roundtrip() {
    let info = SidecarInfo {
        port: 54321,
        secret: "f47ac10b-58cc-4372-a567-0e02b2c3d479".to_string(),
    };

    let json = serde_json::to_string(&info).expect("Deveria serializar SidecarInfo");
    assert!(json.contains("\"port\":54321"));
    assert!(json.contains("\"secret\":\"f47ac10b-58cc-4372-a567-0e02b2c3d479\""));

    let deserialized: SidecarInfo =
        serde_json::from_str(&json).expect("Deveria desserializar SidecarInfo");
    assert_eq!(deserialized, info);
}

#[tokio::test]
async fn test_sidecar_manager_lifecycle_state() {
    let mut manager = SidecarManager::new();
    assert!(!manager.is_running());
    assert_eq!(manager.get_info(), None);

    // Parar um sidecar não iniciado deve ser uma operação segura e retornar Ok
    let stop_result = manager.stop_sidecar().await;
    assert!(stop_result.is_ok());

    let preset_manager = SidecarManager::with_info(54321, "secret-token-123".to_string());
    assert_eq!(
        preset_manager.get_info(),
        Some(SidecarInfo {
            port: 54321,
            secret: "secret-token-123".to_string(),
        })
    );
}
