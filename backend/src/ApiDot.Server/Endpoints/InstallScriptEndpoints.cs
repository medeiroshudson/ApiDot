using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;

namespace ApiDot.Server.Endpoints;

public static class InstallScriptEndpoints
{
    private static readonly Dictionary<string, string> ValidAssets = new(StringComparer.OrdinalIgnoreCase)
    {
        ["osx/arm64"] = "apidot-agent-osx-arm64",
        ["linux/x64"] = "apidot-agent-linux-x64",
        ["linux/arm64"] = "apidot-agent-linux-arm64",
        ["win/x64"] = "apidot-agent-win-x64.exe"
    };

    private static readonly char[] DangerousHostChars = ['"', '\'', '`', ';', '\r', '\n', '$', '\t', ' ', '\\', '&', '|', '<', '>', '(', ')', '{', '}', '!', ','];

    public static IEndpointRouteBuilder MapInstallScriptEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/install.sh", (
            HttpContext context,
            IConfiguration configuration,
            IWebHostEnvironment env) =>
        {
            var serverUrl = GetServerBaseUrl(context, configuration);
            var template = LoadScriptTemplate("install.sh", env);
            var script = template.Replace("__SERVER_URL__", serverUrl);

            return Results.Content(script, "text/x-shellscript; charset=utf-8", Encoding.UTF8);
        });

        app.MapGet("/install.ps1", (
            HttpContext context,
            IConfiguration configuration,
            IWebHostEnvironment env) =>
        {
            var serverUrl = GetServerBaseUrl(context, configuration);
            var template = LoadScriptTemplate("install.ps1", env);
            var script = template.Replace("__SERVER_URL__", serverUrl);

            return Results.Content(script, "text/plain; charset=utf-8", Encoding.UTF8);
        });

        app.MapGet("/api/agent/download/{os}/{arch}", (
            string os,
            string arch,
            IConfiguration configuration) =>
        {
            if (string.IsNullOrWhiteSpace(os) || string.IsNullOrWhiteSpace(arch))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid OS or Architecture",
                    detail: "OS and architecture parameters cannot be empty.");
            }

            var key = $"{os.Trim().ToLowerInvariant()}/{arch.Trim().ToLowerInvariant()}";
            if (!ValidAssets.TryGetValue(key, out var assetName))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid OS or Architecture",
                    detail: $"The combination of OS '{os}' and architecture '{arch}' is not supported. Supported combinations: osx/arm64, linux/x64, linux/arm64, win/x64.");
            }

            var version = configuration["AgentRelease:Version"] ?? "0.4.0";
            var normalizedVersion = version.StartsWith("v", StringComparison.OrdinalIgnoreCase)
                ? version
                : $"v{version}";

            var downloadBaseUrl = configuration["AgentRelease:BaseUrl"]
                ?? "https://github.com/medeiroshudson/ApiDot/releases/download";

            var redirectUrl = $"{downloadBaseUrl.TrimEnd('/')}/{normalizedVersion}/{assetName}";
            return Results.Redirect(redirectUrl, permanent: false);
        });

        return app;
    }

    private static string GetServerBaseUrl(HttpContext context, IConfiguration configuration)
    {
        var configuredUrl = configuration["Server:BaseUrl"];
        if (!string.IsNullOrWhiteSpace(configuredUrl) &&
            Uri.TryCreate(configuredUrl, UriKind.Absolute, out var configuredUri) &&
            (configuredUri.Scheme == Uri.UriSchemeHttp || configuredUri.Scheme == Uri.UriSchemeHttps))
        {
            return configuredUrl.TrimEnd('/');
        }

        var defaultBaseUrl = $"{context.Request.Scheme}://{context.Request.Host.Value}".TrimEnd('/');

        var proto = context.Request.Headers["X-Forwarded-Proto"].FirstOrDefault();
        var scheme = (!string.IsNullOrWhiteSpace(proto) &&
                      (string.Equals(proto, "http", StringComparison.OrdinalIgnoreCase) ||
                       string.Equals(proto, "https", StringComparison.OrdinalIgnoreCase)))
            ? proto.ToLowerInvariant()
            : context.Request.Scheme?.ToLowerInvariant();

        if (scheme != "http" && scheme != "https")
        {
            return defaultBaseUrl;
        }

        var candidateHost = context.Request.Headers["X-Forwarded-Host"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(candidateHost))
        {
            candidateHost = context.Request.Host.Value;
        }

        if (string.IsNullOrWhiteSpace(candidateHost))
        {
            return defaultBaseUrl;
        }

        candidateHost = candidateHost.Trim();

        // 1. Check for dangerous characters (quotes, semicolons, backticks, newlines, dollar signs, spaces, etc.)
        if (candidateHost.IndexOfAny(DangerousHostChars) >= 0)
        {
            return defaultBaseUrl;
        }

        // 2. Validate with Uri.TryCreate
        if (!Uri.TryCreate($"{scheme}://{candidateHost}", UriKind.Absolute, out var uri))
        {
            return defaultBaseUrl;
        }

        // 3. Scheme must be strictly http or https
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            return defaultBaseUrl;
        }

        // 4. Hostname type must not be Unknown
        if (Uri.CheckHostName(uri.DnsSafeHost) == UriHostNameType.Unknown)
        {
            return defaultBaseUrl;
        }

        return $"{scheme}://{candidateHost}".TrimEnd('/');
    }

    private static string LoadScriptTemplate(string fileName, IWebHostEnvironment env)
    {
        if (!string.IsNullOrEmpty(env.ContentRootPath))
        {
            var contentRootFile = Path.Combine(env.ContentRootPath, "Scripts", fileName);
            if (File.Exists(contentRootFile))
            {
                return File.ReadAllText(contentRootFile);
            }
        }

        var baseDirFile = Path.Combine(AppContext.BaseDirectory, "Scripts", fileName);
        if (File.Exists(baseDirFile))
        {
            return File.ReadAllText(baseDirFile);
        }

        var currentDirFile = Path.Combine(Directory.GetCurrentDirectory(), "Scripts", fileName);
        if (File.Exists(currentDirFile))
        {
            return File.ReadAllText(currentDirFile);
        }

        var repoRelativeFile = Path.Combine(Directory.GetCurrentDirectory(), "backend", "src", "ApiDot.Server", "Scripts", fileName);
        if (File.Exists(repoRelativeFile))
        {
            return File.ReadAllText(repoRelativeFile);
        }

        return fileName switch
        {
            "install.sh" => DefaultInstallSh,
            "install.ps1" => DefaultInstallPs1,
            _ => throw new FileNotFoundException($"Script template '{fileName}' was not found.")
        };
    }

    private const string DefaultInstallSh = """
        #!/usr/bin/env bash
        set -euo pipefail

        # ApiDot Agent Installation Script
        # Installs to ~/.apidot/bin
        # Injected server URL or override via environment variable
        SERVER_URL="${APIDOT_SERVER_URL:-__SERVER_URL__}"
        SERVER_URL="${SERVER_URL%/}"

        echo "==> Detecting operating system and architecture..."

        OS_RAW="$(uname -s)"
        case "${OS_RAW}" in
            Darwin)
                TARGET_OS="osx"
                ;;
            Linux)
                TARGET_OS="linux"
                ;;
            *)
                echo "Error: Unsupported operating system: ${OS_RAW}. ApiDot Agent supports macOS (Darwin) and Linux." >&2
                exit 1
                ;;
        esac

        ARCH_RAW="$(uname -m)"
        case "${ARCH_RAW}" in
            x86_64|amd64)
                TARGET_ARCH="x64"
                ;;
            arm64|aarch64)
                TARGET_ARCH="arm64"
                ;;
            *)
                echo "Error: Unsupported architecture: ${ARCH_RAW}. ApiDot Agent supports x64 and arm64." >&2
                exit 1
                ;;
        esac

        if [ "${TARGET_OS}" = "osx" ] && [ "${TARGET_ARCH}" != "arm64" ]; then
            echo "Error: macOS Intel (x64) is deprecated and no longer supported. ApiDot Agent requires Apple Silicon (arm64)." >&2
            exit 1
        fi

        DOWNLOAD_URL="${SERVER_URL}/api/agent/download/${TARGET_OS}/${TARGET_ARCH}"
        INSTALL_DIR="${HOME}/.apidot/bin"
        TARGET_FILE="${INSTALL_DIR}/apidot-agent"
        TMP_FILE="${TARGET_FILE}.tmp.$$"

        cleanup() {
            rm -f "${TMP_FILE}"
        }
        trap cleanup EXIT

        echo "==> Target platform: ${TARGET_OS}/${TARGET_ARCH}"
        echo "==> Downloading ApiDot Agent from: ${DOWNLOAD_URL}"

        mkdir -p "${INSTALL_DIR}"

        if command -v curl >/dev/null 2>&1; then
            curl -fsSL "${DOWNLOAD_URL}" -o "${TMP_FILE}"
        elif command -v wget >/dev/null 2>&1; then
            wget -qO "${TMP_FILE}" "${DOWNLOAD_URL}"
        else
            echo "Error: Neither curl nor wget was found. Please install curl or wget to continue." >&2
            exit 1
        fi

        chmod +x "${TMP_FILE}"
        mv -f "${TMP_FILE}" "${TARGET_FILE}"
        trap - EXIT

        echo ""
        echo "==> ApiDot Agent installed successfully to: ${TARGET_FILE}"
        echo ""
        echo "To connect your agent to ApiDot Server:"
        echo "  ${TARGET_FILE} connect --token <YOUR_DEVICE_TOKEN>"
        echo ""
        echo "To add apidot-agent to your PATH, add this line to your shell profile (~/.bashrc, ~/.zshrc):"
        echo "  export PATH=\"\$HOME/.apidot/bin:\$PATH\""
        echo ""
        """;

    private const string DefaultInstallPs1 = """
        # ApiDot Agent Installation Script for Windows
        # Injected server URL or override via environment variable
        $ErrorActionPreference = "Stop"

        $ServerUrl = $env:APIDOT_SERVER_URL
        if ([string]::IsNullOrWhiteSpace($ServerUrl)) {
            $ServerUrl = "__SERVER_URL__"
        }
        $ServerUrl = $ServerUrl.TrimEnd('/')

        Write-Host "==> Target platform: win/x64"

        $DownloadUrl = "$ServerUrl/api/agent/download/win/x64"
        $InstallDir = Join-Path $env:USERPROFILE ".apidot\bin"
        $TargetFile = Join-Path $InstallDir "apidot-agent.exe"

        Write-Host "==> Downloading ApiDot Agent from: $DownloadUrl"

        if (-not (Test-Path -Path $InstallDir)) {
            New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
        }

        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        } catch {
        }

        Invoke-WebRequest -Uri $DownloadUrl -OutFile $TargetFile -UseBasicParsing

        Write-Host ""
        Write-Host "==> ApiDot Agent installed successfully to: $TargetFile"
        Write-Host ""
        Write-Host "To connect your agent to ApiDot Server:"
        Write-Host "  & `"$TargetFile`" connect --token <YOUR_DEVICE_TOKEN>"
        Write-Host ""
        Write-Host "To add apidot-agent to your PATH permanently, run in PowerShell:"
        Write-Host "  `$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')"
        Write-Host "  [Environment]::SetEnvironmentVariable('Path', `"`$userPath;`$env:USERPROFILE\.apidot\bin`", 'User')"
        Write-Host ""
        """;
}
