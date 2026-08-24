<p align="right">
  <a href="README.md">简体中文</a> · <strong>English</strong>
</p>

# Terminal Workbench

<p align="center">
  <img src="public/brand-logo-preview.png" alt="Terminal Workbench" width="240" />
</p>

Terminal Workbench is a local Windows project workspace inspired by the visual language of *Arknights: Endfield*. Its signature Memory Bubbles let ideas drift, connect, age, and turn into projects, while Codex conversations, background tasks, project canvases, daily planning, calendars, and local tools live together in one desktop application.

Current version: `0.2.8`

Maintainer: [@fanshichengshicheng](https://github.com/fanshichengshicheng)

## Download

<p align="center">
  <a href="https://github.com/fanshichengshicheng/terminal-workbench/releases/download/v0.2.8/terminal-workbench_0.2.8_x64-setup.exe"><strong>Download the Windows x64 installer (v0.2.8)</strong></a>
  <br />
  <a href="https://github.com/fanshichengshicheng/terminal-workbench/releases/latest">View the latest release and release notes</a>
</p>

> The installer is not currently code-signed, so Windows may display a security warning.

## Signature Feature: Memory Bubbles

Memory Bubbles are the core way Terminal Workbench organizes ideas and projects, rather than simply presenting another list of notes.

- Let ideas float freely as bubbles in Wander view to create a more spatial writing environment
- Connect related notes and inspect their relationships through Local Graph and Global Graph views
- Allow long-unvisited bubbles to become dormant or sink, while pinning important ideas prevents aging
- Turn a mature idea directly into a project workspace and continue the work with the canvas and Codex

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

- Organize ideas with Memory Bubbles that support wandering, connections, aging, and project conversion
- Multiple project workspaces with independent local project directories
- Local Codex conversations with streaming responses, command execution, file edits, and approvals
- A background task center that keeps work running after leaving a project page
- A visual canvas with text, images, response cards, freehand drawing, and node connections
- Chat image attachments, historical image rendering, and collapsible operation records
- A creative knowledge base, local and global relationship graphs, daily plans, and calendar synchronization
- Quick launching for Windows applications, shortcuts, scripts, URLs, and folders
- API keys stored in Windows Credential Manager instead of project files
- A section-aware engineering overview with general milestones that sync with the calendar
- An AI companion launcher with isolated project tasks, persona chat, and PET mode
- A Qixun-07 dorm prototype with sprite-v2 animations, feeding, interaction, and patrol
- One-click export and guarded restore for local workbench, project canvas, and planning data

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

See [RELEASE_NOTES.md](RELEASE_NOTES.md) for the `0.2.8` release notes.

This repository currently does not include an open-source license. Public source availability does not grant permission for redistribution or commercial use.
