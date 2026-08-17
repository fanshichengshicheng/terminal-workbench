import { access, copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve("@openai/codex/package.json"));
const runtimeFiles = [
  ["bin", "codex.exe"],
  ["bin", "codex-code-mode-host.exe"],
  ["codex-resources", "codex-command-runner.exe"],
  ["codex-resources", "codex-windows-sandbox-setup.exe"],
];
const candidateRoots = [
  join(packageRoot, "vendor", "x86_64-pc-windows-msvc"),
  resolve("node_modules/.pnpm/@openai+codex@0.147.0-win32-x64/node_modules/@openai/codex/vendor/x86_64-pc-windows-msvc"),
];
const sourceRoot = (await Promise.all(candidateRoots.map(async root => {
  try {
    await Promise.all(runtimeFiles.map(([directory, name]) => access(join(root, directory, name))));
    return root;
  } catch {
    return null;
  }
}))).find(Boolean);

if (!sourceRoot) {
  throw new Error("Unable to locate the complete Windows Codex runtime in @openai/codex optional dependencies.");
}

const destinationDirectory = resolve("src-tauri/resources");
await mkdir(destinationDirectory, { recursive: true });
for (const [directory, name] of runtimeFiles) {
  await copyFile(join(sourceRoot, directory, name), join(destinationDirectory, name));
}
console.log(`Codex runtime prepared: ${runtimeFiles.map(([, name]) => name).join(", ")}`);
