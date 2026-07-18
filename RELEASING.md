# Releasing Sutra

A release is cut by pushing a version tag. The
[`release.yml`](.github/workflows/release.yml) workflow then builds the web
bundle and native installers for all four desktop targets and drafts a GitHub
Release with the artifacts attached.

```bash
git tag v2.0.0-beta.1 && git push origin v2.0.0-beta.1
```

Installers build **unsigned by default** — that works today with no setup. The
sections below are only needed to produce **signed + notarized** installers
(required before a public `v2.0.0`, so users aren't blocked by Gatekeeper /
SmartScreen warnings).

---

## The two tags

| Tag | Gate | Who |
| --- | --- | --- |
| `v2.0.0-beta.1` | The **acceptance run**: open the desktop app (`npm run desktop:dev`), point it at a real repo with a real API key, watch a real loop converge to a real branch, and be satisfied with the quality. | You — it's a human judgment. |
| `v2.0.0` | Signed + notarized installers → needs the signing secrets below. | You — the certificates require your accounts. |

---

## macOS signing + notarization

**You need:** an [Apple Developer Program](https://developer.apple.com/programs/)
membership ($99/yr) and a **Developer ID Application** certificate.

1. In Xcode → Settings → Accounts, or the Apple Developer portal, create a
   **Developer ID Application** certificate and download it.
2. Export it from Keychain Access as a `.p12` (you'll set a password).
3. Base64-encode it for the secret:
   ```bash
   base64 -i DeveloperID_Application.p12 | pbcopy
   ```
4. Create an **app-specific password** for notarization at
   [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security →
   App-Specific Passwords.

Add these repo secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE` | the base64 `.p12` from step 3 |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password from step 2 |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | your Apple ID email |
| `APPLE_PASSWORD` | the app-specific password from step 4 |
| `APPLE_TEAM_ID` | your 10-character Team ID |

## Windows signing

**You need:** a code-signing certificate from a CA (e.g. DigiCert, Sectigo). An
**OV** cert works; an **EV** cert clears SmartScreen reputation faster.

1. Export the cert as `.pfx`, base64-encode it.

Add these repo secrets:

| Secret | Value |
| --- | --- |
| `WINDOWS_CERTIFICATE` | the base64 `.pfx` |
| `WINDOWS_CERTIFICATE_PASSWORD` | the `.pfx` password |

## Tauri updater signing (optional)

If/when you enable the auto-updater, generate a keypair with
`npm run tauri signer generate` and add `TAURI_SIGNING_PRIVATE_KEY` +
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The workflow already passes these through;
they're harmless when absent.

---

## What happens automatically once the secrets exist

The release workflow reads each secret through the environment. When a macOS or
Windows secret is **present**, `tauri-action` signs (and, for macOS, notarizes)
that platform's installer; when **absent**, it emits an unsigned artifact
instead of failing. So:

- **No secrets** → four unsigned installers + the web zip on a draft Release.
- **Secrets added** → the same, but macOS and/or Windows are signed + notarized.

Nothing in the workflow changes between those two states — only the presence of
the secrets. After a tagged run, find the **draft** Release under Releases,
review the attached artifacts, and publish.
