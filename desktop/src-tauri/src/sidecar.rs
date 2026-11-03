use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

pub const SIDECAR_READY_MARKER_PREFIX: &str = "[APIDOT_SIDECAR_READY:";
pub const SIDECAR_READY_MARKER_SUFFIX: &str = "]";

/// Extrai o número da porta a partir de uma linha de stdout contendo `[APIDOT_SIDECAR_READY:<port>]`.
/// Retorna `Some(port)` caso uma porta numérica válida (1-65535) seja identificada, ou `None` caso contrário.
pub fn parse_sidecar_port(line: &str) -> Option<u16> {
    if let Some(start_idx) = line.find(SIDECAR_READY_MARKER_PREFIX) {
        let after_prefix = &line[start_idx + SIDECAR_READY_MARKER_PREFIX.len()..];
        if let Some(end_idx) = after_prefix.find(SIDECAR_READY_MARKER_SUFFIX) {
            let port_str = after_prefix[..end_idx].trim();
            if let Ok(port) = port_str.parse::<u16>() {
                if port > 0 {
                    return Some(port);
                }
            }
        }
    }
    None
}

/// Metadados de conexão do Sidecar local (porta alocada dinamicamente e segredo de autenticação efêmero).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct SidecarInfo {
    pub port: u16,
    pub secret: String,
}

/// Gerenciador de ciclo de vida do processo filho do Sidecar (.NET Native AOT).
pub struct SidecarManager {
    pub child: Option<tokio::process::Child>,
    pub info: Option<SidecarInfo>,
}

pub type SidecarState = SidecarManager;

impl SidecarManager {
    /// Cria uma nova instância de SidecarManager em estado inicial não inicializado.
    pub fn new() -> Self {
        Self {
            child: None,
            info: None,
        }
    }

    /// Cria uma instância pré-populada com metadados para cenários de teste ou simulação.
    pub fn with_info(port: u16, secret: String) -> Self {
        Self {
            child: None,
            info: Some(SidecarInfo { port, secret }),
        }
    }

    /// Verifica se o processo filho do sidecar está em execução ativa, limpando referências em caso de término.
    pub fn poll_active(&mut self) -> bool {
        if let Some(child) = &mut self.child {
            match child.try_wait() {
                Ok(Some(_status)) => {
                    self.child = None;
                    self.info = None;
                    false
                }
                Ok(None) => true,
                Err(_) => false,
            }
        } else {
            false
        }
    }

    /// Verifica se o processo filho do sidecar está ativo e os metadados de porta estão disponíveis.
    pub fn is_running(&mut self) -> bool {
        self.poll_active() && self.info.is_some()
    }

    /// Retorna uma cópia dos metadados de porta e segredo do sidecar, se disponível.
    pub fn get_info(&self) -> Option<SidecarInfo> {
        self.info.clone()
    }

    /// Inicia o processo `apidot-agent sidecar --port 0 --secret <secret>`, captura a porta atribuída e armazena os metadados.
    pub async fn start_sidecar(&mut self) -> Result<SidecarInfo, String> {
        // Se já estiver em execução com metadados válidos, retorna as informações atuais
        if self.poll_active() {
            if let Some(info) = &self.info {
                return Ok(info.clone());
            }
        }

        // Garante a finalização de qualquer processo residual anterior
        let _ = self.stop_sidecar().await;

        let secret = uuid::Uuid::new_v4().to_string();
        let binary_path = resolve_sidecar_binary_path();

        let mut cmd = tokio::process::Command::new(&binary_path);
        cmd.arg("sidecar")
            .arg("--port")
            .arg("0")
            .arg("--secret")
            .arg(&secret)
            .env("APIDOT_SIDECAR_SECRET", &secret)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        let mut child = cmd.spawn().map_err(|err| {
            format!(
                "Failed to spawn sidecar binary at '{:?}': {}",
                binary_path, err
            )
        })?;

        let stdout = child.stdout.take().ok_or_else(|| {
            "Failed to capture standard output from sidecar process".to_string()
        })?;

        let stderr = child.stderr.take();

        // Tarefa em segundo plano para drenar e logar o stderr sem bloquear o pipe do sistema
        if let Some(err_stream) = stderr {
            tokio::spawn(async move {
                use tokio::io::AsyncBufReadExt;
                let mut reader = tokio::io::BufReader::new(err_stream);
                let mut line = String::new();
                while let Ok(n) = reader.read_line(&mut line).await {
                    if n == 0 {
                        break;
                    }
                    eprintln!("[sidecar:stderr] {}", line.trim_end());
                    line.clear();
                }
            });
        }

        // Leitura síncrona do stdout até a detecção do marcador de prontidão
        let mut reader = tokio::io::BufReader::new(stdout);
        let mut line = String::new();

        let ready_result = tokio::time::timeout(std::time::Duration::from_secs(15), async {
            use tokio::io::AsyncBufReadExt;
            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => break, // EOF reached
                    Ok(_) => {
                        if let Some(port) = parse_sidecar_port(&line) {
                            return Ok(port);
                        }
                    }
                    Err(e) => return Err(format!("Error reading stdout from sidecar: {}", e)),
                }
            }
            Err("Sidecar process terminated without reporting ready marker".to_string())
        })
        .await;

        let port = match ready_result {
            Ok(Ok(p)) => p,
            Ok(Err(e)) => {
                let _ = child.start_kill();
                let _ = child.wait().await;
                return Err(e);
            }
            Err(_) => {
                let _ = child.start_kill();
                let _ = child.wait().await;
                return Err("Timed out waiting for sidecar ready marker".to_string());
            }
        };

        // Drena o restante do stdout em segundo plano para evitar bloqueio de buffer do pipe
        tokio::spawn(async move {
            use tokio::io::AsyncBufReadExt;
            let mut drain_line = String::new();
            while let Ok(n) = reader.read_line(&mut drain_line).await {
                if n == 0 {
                    break;
                }
                drain_line.clear();
            }
        });

        let info = SidecarInfo { port, secret };
        self.child = Some(child);
        self.info = Some(info.clone());

        Ok(info)
    }

    /// Encerra graciosamente ou finaliza forçadamente o processo filho do sidecar (garantindo ZERO processos órfãos).
    pub async fn stop_sidecar(&mut self) -> Result<(), String> {
        self.info = None;
        if let Some(mut child) = self.child.take() {
            #[cfg(unix)]
            {
                if let Some(pid) = child.id() {
                    extern "C" {
                        fn kill(pid: i32, sig: i32) -> i32;
                    }
                    unsafe {
                        // Envia SIGTERM (15) para finalização graciosa
                        kill(pid as i32, 15);
                    }

                    // Aguarda até 500ms para encerramento limpo antes de forçar kill
                    let wait_timeout = tokio::time::timeout(
                        std::time::Duration::from_millis(500),
                        child.wait(),
                    )
                    .await;

                    if wait_timeout.is_ok() {
                        return Ok(());
                    }
                }
            }

            // Encerramento forçado caso o encerramento gracioso expire ou em outras plataformas (ex: Windows)
            let _ = child.start_kill();
            let _ = child.wait().await;
        }
        Ok(())
    }
}

impl Default for SidecarManager {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.start_kill();
        }
    }
}

/// Localiza o caminho para o binário do sidecar `apidot-agent`.
pub fn resolve_sidecar_binary_path() -> PathBuf {
    if let Ok(env_path) = std::env::var("APIDOT_SIDECAR_PATH") {
        let path = PathBuf::from(env_path);
        if path.exists() {
            return path;
        }
    }

    // Binários bundled relativos ao executável em execução (bundle de produção)
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let bundled_candidates = [
                exe_dir.join("binaries/apidot-agent"),
                exe_dir.join("binaries/apidot-agent.exe"),
                exe_dir.join("apidot-agent"),
                exe_dir.join("apidot-agent.exe"),
            ];
            for candidate in &bundled_candidates {
                if candidate.exists() {
                    return candidate.clone();
                }
            }
        }
    }

    // Caminhos padrão de desenvolvimento e build
    let dev_candidates = [
        "desktop/src-tauri/binaries/apidot-agent",
        "desktop/src-tauri/binaries/apidot-agent.exe",
        "src-tauri/binaries/apidot-agent",
        "src-tauri/binaries/apidot-agent.exe",
        "binaries/apidot-agent",
        "binaries/apidot-agent.exe",
        "backend/src/ApiDot.Agent/bin/Release/net9.0/publish/ApiDot.Agent",
        "backend/src/ApiDot.Agent/bin/Release/net9.0/publish/ApiDot.Agent.exe",
        "backend/src/ApiDot.Agent/bin/Debug/net9.0/ApiDot.Agent",
        "backend/src/ApiDot.Agent/bin/Debug/net9.0/ApiDot.Agent.exe",
        "apidot-agent",
        "apidot-agent.exe",
    ];

    for candidate in &dev_candidates {
        let path = PathBuf::from(candidate);
        if path.exists() {
            return path;
        }
    }

    PathBuf::from("apidot-agent")
}

/// Comando IPC Tauri para consultar metadados do sidecar (porta e segredo de autenticação efêmero).
#[tauri::command]
pub async fn get_sidecar_info(
    state: tauri::State<'_, Arc<Mutex<SidecarManager>>>,
) -> Result<SidecarInfo, String> {
    let mut manager = state.lock().await;
    if !manager.poll_active() {
        manager.start_sidecar().await
    } else {
        match &manager.info {
            Some(info) => Ok(info.clone()),
            None => {
                Err("Sidecar process is running but loopback endpoint is not ready".to_string())
            }
        }
    }
}
