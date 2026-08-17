export type AiProviderId = "codex" | "openai" | "anthropic" | "deepseek" | "ollama";

export type AiSettings = {
  provider: AiProviderId;
  model: string;
  baseUrl: string;
};

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiProviderInfo = {
  id: AiProviderId;
  label: string;
  model: string;
  baseUrl: string;
  hint: string;
  needsKey: boolean;
};

export const AI_PROVIDERS: AiProviderInfo[] = [
  { id: "codex", label: "Codex 项目 Agent", model: "", baseUrl: "", hint: "项目文件、命令和审批", needsKey: false },
  { id: "openai", label: "OpenAI", model: "gpt-5-mini", baseUrl: "https://api.openai.com/v1", hint: "通用推理与文本助手", needsKey: true },
  { id: "anthropic", label: "Claude", model: "claude-sonnet-4-5", baseUrl: "https://api.anthropic.com/v1", hint: "长文本与分析", needsKey: true },
  { id: "deepseek", label: "DeepSeek", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1", hint: "中文与高性价比", needsKey: true },
  { id: "ollama", label: "Ollama 本地", model: "qwen3:8b", baseUrl: "http://127.0.0.1:11434/v1", hint: "本地离线模型", needsKey: false },
];

export const defaultAiSettings = (): AiSettings => ({ provider: "codex", model: "", baseUrl: "" });

export function loadAiSettings(): AiSettings {
  if (typeof window === "undefined") return defaultAiSettings();
  try {
    const parsed = JSON.parse(window.localStorage.getItem("workbench-ai-settings") || "null") as Partial<AiSettings> | null;
    const provider = AI_PROVIDERS.some(item => item.id === parsed?.provider) ? parsed!.provider! : "codex";
    const info = providerInfo(provider);
    return { provider, model: parsed?.model || info.model, baseUrl: parsed?.baseUrl || info.baseUrl };
  } catch {
    return defaultAiSettings();
  }
}

export function saveAiSettings(settings: AiSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("workbench-ai-settings", JSON.stringify(settings));
}

export function providerInfo(id: AiProviderId) {
  return AI_PROVIDERS.find(provider => provider.id === id) || AI_PROVIDERS[0];
}
