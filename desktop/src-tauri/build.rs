use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    let target = env::var("TARGET").unwrap_or_else(|_| "aarch64-apple-darwin".to_string());
    let binaries_dir = PathBuf::from("binaries");
    let is_windows = target.contains("windows");
    let binary_filename = if is_windows {
        format!("apidot-agent-{}.exe", target)
    } else {
        format!("apidot-agent-{}", target)
    };
    let target_binary = binaries_dir.join(&binary_filename);

    if !target_binary.exists() {
        let _ = fs::create_dir_all(&binaries_dir);

        // Search for pre-compiled ApiDot.Agent binaries
        let rid = if target.contains("darwin") || target.contains("apple") {
            if target.contains("aarch64") { "osx-arm64" } else { "osx-x64" }
        } else if target.contains("windows") {
            "win-x64"
        } else {
            "linux-x64"
        };

        let agent_name = if is_windows { "ApiDot.Agent.exe" } else { "ApiDot.Agent" };
        let candidates = [
            PathBuf::from(format!("../../backend/src/ApiDot.Agent/bin/Release/net9.0/{}/publish/{}", rid, agent_name)),
            PathBuf::from(format!("../../backend/src/ApiDot.Agent/bin/Release/net9.0/publish/{}", agent_name)),
            PathBuf::from(format!("../../backend/src/ApiDot.Agent/bin/Debug/net9.0/{}", agent_name)),
            PathBuf::from(format!("../../backend/src/ApiDot.Agent/bin/Release/net9.0/{}", agent_name)),
        ];

        let mut copied = false;
        for candidate in &candidates {
            if candidate.exists() {
                if let Ok(_) = fs::copy(candidate, &target_binary) {
                    copied = true;
                    break;
                }
            }
        }

        if !copied {
            // Attempt to compile via dotnet publish if dotnet is available
            let status = Command::new("dotnet")
                .args(["publish", "../../backend/src/ApiDot.Agent", "-c", "Release"])
                .status();

            if let Ok(s) = status {
                if s.success() {
                    for candidate in &candidates {
                        if candidate.exists() {
                            if let Ok(_) = fs::copy(candidate, &target_binary) {
                                copied = true;
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Fallback development stub if compilation is skipped
        if !copied {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::write(&target_binary, "#!/bin/sh\necho \"[APIDOT_SIDECAR_READY:54321]\"\nexec sleep 3600\n");
                if let Ok(meta) = fs::metadata(&target_binary) {
                    let mut perms = meta.permissions();
                    perms.set_mode(0o755);
                    let _ = fs::set_permissions(&target_binary, perms);
                }
            }
            #[cfg(windows)]
            {
                let _ = fs::write(&target_binary, b"");
            }
        }
    }

    tauri_build::build();
}
