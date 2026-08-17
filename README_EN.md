<p align="right">
  <a href="README.md">简体中文</a> · <strong>English</strong>
</p>

# Terminal Workbench

<p align="center">
  <img src="public/brand-logo-preview.png" alt="Terminal Workbench" width="240" />
</p>

Terminal Workbench is a local project workspace for Windows that brings project management, creative notes, daily planning, calendars, local tool launching, a visual canvas, and Codex conversations into one desktop application.

Current version: `0.2.7`

## Design Note

This project is an unofficial, personal attempt to reference and recreate the visual design language of *Arknights: Endfield*. The result may not be a perfect reproduction, but a great deal of care has gone into its colors, typography, layout, and interaction details.

This project is not affiliated with Hypergryph or the official *Arknights: Endfield* team.

## Preview

### Launch Screen

![Terminal Workbench launch screen](docs/screenshots/workbench-overview.png)

<table>
  <tr>
    <td width="50%">
      <strong>Daily Plan</strong><br />
      <img src="docs/screenshots/daily-plan.png" alt="Daily plan" />
    </td>
    <td width="50%">
      <strong>Knowledge Graph Canvas</strong><br />
      <img src="docs/screenshots/canvas.png" alt="Knowledge graph canvas" />
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <strong>Monthly Calendar</strong><br />
      <img src="docs/screenshots/plans-calendar.png" alt="Daily plans and monthly calendar" />
    </td>
  </tr>
</table>

## Features

- Multiple project workspaces with independent local project directories
- Local Codex conversations with streaming responses, command execution, file edits, and approvals
- A background task center that keeps work running after leaving a project page
- A visual canvas with text, images, response cards, freehand drawing, and node connections
- Chat image attachments, historical image rendering, and collapsible operation records
- A creative knowledge base, note relationship graphs, daily plans, and calendar synchronization
- Quick launching for Windows applications, shortcuts, scripts, URLs, and folders
- API keys stored in Windows Credential Manager instead of project files

## Requirements

- Windows 10/11 x64
- Node.js `>=22.13.0`
- pnpm
- Rust and the Windows build tools required by Tauri 2, only when building from source

## Local Development

```powershell
pnpm install
pnpm desktop:dev
```

To run only the web interface:

```powershell
pnpm desktop:web:dev
```

## Build the Windows Installer

```powershell
pnpm install
pnpm desktop:build
```

The installer is generated in:

```text
src-tauri/target/release/bundle/nsis/
```

Before each build, `scripts/prepare-codex-sidecar.mjs` prepares the Windows Codex runtime from the installed official `@openai/codex` npm dependency. `src-tauri/resources/` is generated locally and is not committed to Git.

## Data and Privacy

- Projects, plans, notes, and canvas data are stored in local browser storage or IndexedDB.
- Third-party model API keys are stored in Windows Credential Manager by the desktop application.
- `.env` files, local logs, build caches, Codex runtime binaries, and personal documents are excluded through `.gitignore`.

## Verification

```powershell
pnpm exec eslint app/ProjectWorkspace.tsx app/codex-client.ts app/codex-runtime.ts
pnpm desktop:web:build
cargo check --manifest-path src-tauri/Cargo.toml
```

## Release

See [RELEASE_NOTES.md](RELEASE_NOTES.md) for the `0.2.7` release notes.

This repository currently does not include an open-source license. Public source availability does not grant permission for redistribution or commercial use.
