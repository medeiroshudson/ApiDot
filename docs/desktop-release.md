# Desktop release and validation

## One-time: updater signing key

```bash
npm --prefix desktop install
cd desktop
npx tauri signer generate -w ~/.tauri/apidot.key
```

- Copy the **public** key printed by the command into `desktop/src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
- Store the **contents** of `~/.tauri/apidot.key` in the repository secret `TAURI_SIGNING_PRIVATE_KEY`, and its password in `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- The private key never enters the repository. While the pubkey is the `REPLACE_WITH…` placeholder, `desktop/validate-config.js` warns locally and **fails the release** (`APIDOT_REQUIRE_UPDATER_KEY=true`).

## Release flow

1. Push a `v*` tag or dispatch the workflow with `tag_name`.
2. The workflow publishes the AOT agent, builds the frontend static export (`npm --prefix frontend run build:desktop`), runs `prepare.js` (fails if `out/index.html` is missing or is the old `localhost:3000` redirect), validates the config (fails on a placeholder updater key), then `tauri-action` builds and signs.
3. Local builds: `npm --prefix desktop run build` now builds the export first, then `prepare.js`, then `tauri build`.

## R3 — validate an installed app (macOS)

```bash
npm --prefix frontend run build:desktop
node desktop/prepare.js
npm --prefix desktop run build
cp -R desktop/src-tauri/target/release/bundle/macos/ApiDot.app /Applications/
```

1. **Scheme registration.** `open "apidot://workspace/_"` brings the app to front. If nothing happens, re-register: `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f /Applications/ApiDot.app`.
2. **Deep link, app closed.** Quit, then `open "apidot://workspace/<ws>/request/<rid>"`. Sign in when prompted; the app must resume at that request (`pendingRoute`), not at the scratchpad.
3. **Deep link, app running.** Same command with the app open: the window focuses and navigates.
4. **Asset routing.** Open the app at `/`, go to the login screen and reload the webview (Cmd+R). The exported shell must load (no 404), and `/auth/desktop-success` must load too. A 404 here means the Tauri asset protocol is not resolving extensionless paths; fix with `trailingSlash: true` in the export or a protocol fallback.
5. **Unified auth.** Sign in: `~/.apidot/session.json` exists with mode 0600 and `userId`, `deviceId`, `deviceKey`, `accessToken`, `expiresAt`. The device appears in the list marked as the current device, `GET /api/agent/devices` carries no scope field, and the sidecar connects (device online).
6. **Service coexistence.** With the system service installed, restart the app: `/connect` must answer `{ connected: false, reason: "service-active" }` and only the service device is online. No second WebSocket.
7. **Revocation.** Revoke the desktop device from another session: the app must get 401, clear the session, disconnect the sidecar and land on `/login`.
8. **Logout.** The token fields are cleared, `deviceKey` survives, `IsRevoked` stays false, and the next login reuses the same device id.
9. **Updater.** Publish a test release, install the previous version and confirm the update downloads and passes signature verification.

`tauri dev` runs an unregistered binary, so steps 1–3 only work from an installed `.app`.
