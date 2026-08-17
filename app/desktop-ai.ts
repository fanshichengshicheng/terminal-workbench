import { invoke } from "@tauri-apps/api/core";
import { AI_PROVIDERS, type AiMessage, type AiSettings } from "./ai-provider";

export function isDesktopApp() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function runAiChat(settings: AiSettings, messages: AiMessage[]) {
  if (settings.provider === "codex") throw new Error("Codex 请从项目对话中使用");
  if (isDesktopApp()) {
    return invoke<{ content: string; provider: string; model: string }>("ai_chat", {
      request: { provider: settings.provider, model: settings.model, baseUrl: settings.baseUrl || null, messages },
    });
  }
  return runBrowserChat(settings, messages);
}

export async function hasAiSecret(provider: string) {
  if (!isDesktopApp()) return false;
  return invoke<boolean>("ai_secret_status", { provider });
}

export async function saveAiSecret(provider: string, secret: string) {
  if (!isDesktopApp()) return;
  await invoke("ai_secret_set", { provider, secret });
}

export async function deleteAiSecret(provider: string) {
  if (!isDesktopApp()) return;
  await invoke("ai_secret_delete", { provider });
}

export async function openExternalUrl(url: string) {
  if (isDesktopApp()) await invoke("open_external_url", { url });
  else window.open(url, "_blank", "noopener,noreferrer");
}

async function runBrowserChat(settings: AiSettings, messages: AiMessage[]) {
  const info = AI_PROVIDERS.find(provider => provider.id === settings.provider);
  const baseUrl = (settings.baseUrl || info?.baseUrl || "").replace(/\/$/, "");
  if (!baseUrl) throw new Error("请先填写服务地址");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let url = `${baseUrl}/chat/completions`;
  if (settings.provider === "anthropic") {
    url = `${baseUrl}/messages`;
    const key = window.prompt("请输入 Claude API Key（仅用于本次网页请求）")?.trim();
    if (!key) throw new Error("Claude 需要 API Key");
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
  } else if (info?.needsKey) {
    const key = window.prompt(`请输入 ${info.label} API Key（仅用于本次网页请求）`)?.trim();
    if (!key) throw new Error(`${info.label} 需要 API Key`);
    headers.Authorization = `Bearer ${key}`;
  }
  const system = messages.filter(message => message.role === "system").map(message => message.content).join("\n\n");
  const chatMessages = messages.filter(message => message.role !== "system");
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(settings.provider === "anthropic" ? { model: settings.model, max_tokens: 4096, system: system || undefined, messages: chatMessages } : { model: settings.model, messages, stream: false }) });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(String((body.error as { message?: string } | undefined)?.message || `服务商请求失败（${response.status}）`));
  const content = settings.provider === "anthropic"
    ? ((body.content as Array<{ text?: string }> | undefined) || []).map(item => item.text || "").join("\n")
    : String(((body.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content || body.output_text || ""));
  return { content, provider: settings.provider, model: settings.model };
}
