use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;

pub const SIDECAR_READY_MARKER_PREFIX: &str = "[APIDOT_SIDECAR_READY:";
pub const SIDECAR_READY_MARKER_SUFFIX: &str = "]";

/// Extracts the port number from a stdout line containing `[APIDOT_SIDECAR_READY:<port>]`.
/// Returns `Some(port)` if a valid numeric port (1-65535) is found, otherwise `None`.
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

/// Connection metadata for the local Sidecar (dynamically allocated loopback port and ephemeral secret).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct SidecarInfo {
    pub port: u16,
    pub secret: String,
}

/// Lifecycle manager for the .NET Native AOT Sidecar child process.
pub struct SidecarManager {
    pub child: Option<tokio::process::Child>,
    pub info: Option<SidecarInfo>,
}

pub type SidecarState = SidecarManager;

/// Builds the sidecar child-process command.
///
/// The ephemeral secret is passed only through the `APIDOT_SIDECAR_SECRET`
/// environment variable. Command-line arguments are visible to every local
/// user through process listings, so the secret must not appear there.
pub fn build_sidecar_command(binary_path: &Path, secret: &str) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(binary_path);
    cmd.arg("sidecar")
        .arg("--port")
        .arg("0")
        .env("APIDOT_SIDECAR_SECRET", secret)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    cmd
}

impl SidecarManager {
    /// Creates a new uninitialized SidecarManager instance.
    pub fn new() -> Self {
        Self {
            child: None,
            info: None,
        }
    }

    /// Creates a pre-populated SidecarManager instance for testing or simulation.
    pub fn with_info(port: u16, secret: String) -> Self {
        Self {
            child: None,
            info: Some(SidecarInfo { port, secret }),
        }
    }

    /// Verifies if the sidecar child process is actively running, clearing references if it terminated.
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

    /// Checks whether the sidecar child process is running and loopback endpoint metadata is ready.
    pub fn is_running(&mut self) -> bool {
        self.poll_active() && self.info.is_some()
    }

    /// Returns a copy of the sidecar port and secret metadata, if available.
    pub fn get_info(&self) -> Option<SidecarInfo> {
        self.info.clone()
    }

    /// Starts the `apidot-agent sidecar --port 0` process with the secret in the
    /// environment, captures the bound port, and stores metadata.
    pub async fn start_sidecar(&mut self) -> Result<SidecarInfo, String> {
        // Return existing info if already running
        if self.poll_active() {
            if let Some(info) = &self.info {
                return Ok(info.clone());
            }
        }

        // Ensure any residual process is cleanly terminated
        let _ = self.stop_sidecar().await;

        let secret = uuid::Uuid::new_v4().to_string();
        let binary_path = resolve_sidecar_binary_path();

        let mut cmd = build_sidecar_command(&binary_path, &secret);

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

        // Background task to drain and log stderr without blocking system pipe buffer
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

        // Read stdout line-by-line until ready marker is detected
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

        // Drain remaining stdout in the background to prevent pipe buffer deadlock
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

    /// Gracefully stops or terminates the sidecar child process (guaranteeing zero orphan processes).
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
                        // Send SIGTERM (15) for graceful shutdown
                        kill(pid as i32, 15);
                    }

                    // Wait up to 500ms for clean termination before forcing kill
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

            // Force kill if graceful termination timed out or on other platforms (e.g. Windows)
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

/// Locates the path to the `apidot-agent` sidecar binary.
pub fn resolve_sidecar_binary_path() -> PathBuf {
    if let Ok(env_path) = std::env::var("APIDOT_SIDECAR_PATH") {
        let path = PathBuf::from(env_path);
        if path.exists() {
            return path;
        }
    }

    // Bundled binaries relative to current executable (production bundle)
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

    // Default development and build candidate paths
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

/// Tauri IPC command to retrieve sidecar metadata (port and ephemeral secret).
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
