"use client";

/* eslint-disable react-hooks/set-state-in-effect, jsx-a11y/no-static-element-interactions */

import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, KeyRound, LoaderCircle, LogIn, LogOut, Trash2, X } from "lucide-react";
import { AI_PROVIDERS, providerInfo, saveAiSettings, type AiProviderId, type AiSettings } from "./ai-provider";
import type { CodexClient } from "./codex-client";
import { deleteAiSecret, hasAiSecret, openExternalUrl, runAiChat, saveAiSecret } from "./desktop-ai";

type CodexAccount =
  | { type: "apiKey" }
  | { type: "chatgpt"; email: string | null; planType: string }
  | { type: "amazonBedrock"; usesCodexManagedCredentials: boolean };

type AccountResponse = { account: CodexAccount | null; requiresOpenaiAuth: boolean };
type LoginResponse =
  | { type: "apiKey" }
  | { type: "chatgpt"; loginId: string; authUrl: string }
  | { type: "chatgptDeviceCode"; loginId: string; verificationUrl: string; userCode: string };

export default function AiSettingsModal({
  client,
  connected,
  settings,
  close,
  onSave,
}: {
  client: CodexClient | null;
  connected: boolean;
  settings: AiSettings;
  close: () => void;
  onSave: (settings: AiSettings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [secret, setSecret] = useState("");
  const [secretSaved, setSecretSaved] = useState(false);
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [codexKey, setCodexKey] = useState("");
  const [deviceCode, setDeviceCode] = useState<{ url: string; code: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const info = useMemo(() => providerInfo(draft.provider), [draft.provider]);

  const refreshAccount = async () => {
    if (!client || !connected) {
      setAccount(null);
      return;
    }
    try {
      setAccount(await client.request<AccountResponse>("account/read", { refreshToken: false }));
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    }
  };

  useEffect(() => {
    refreshAccount();
    if (!client) return;
    const onNotification = (event: Event) => {
      const message = (event as CustomEvent<{ method: string }>).detail;
      if (message.method === "account/updated" || message.method === "account/login/completed") refreshAccount();
    };
    client.addEventListener("notification", onNotification);
    return () => client.removeEventListener("notification", onNotification);
  }, [client, connected]);

  useEffect(() => {
    setSecret("");
    setStatus("");
    if (!info.needsKey) {
      setSecretSaved(false);
      return;
    }
    hasAiSecret(info.id).then(setSecretSaved).catch(() => setSecretSaved(false));
  }, [info.id, info.needsKey]);

  const changeProvider = (provider: AiProviderId) => {
    const next = providerInfo(provider);
    setDraft({ provider, model: next.model, baseUrl: next.baseUrl });
  };

  const persistSecret = async () => {
    if (!info.needsKey || !secret.trim()) return;
    await saveAiSecret(info.id, secret.trim());
    setSecret("");
    setSecretSaved(true);
  };

  const save = async () => {
    setBusy("save");
    setStatus("");
    try {
      await persistSecret();
      saveAiSettings(draft);
      onSave(draft);
      close();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy("");
    }
  };

  const testProvider = async () => {
    setBusy("test");
    setStatus("");
    try {
      await persistSecret();
      await runAiChat(draft, [{ role: "user", content: "只回复：连接成功" }]);
      setStatus("连接成功");
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy("");
    }
  };

  const loginChatGpt = async (device = false) => {
    if (!client || !connected) return;
    setBusy(device ? "device" : "chatgpt");
    setStatus("");
    try {
      const response = await client.request<LoginResponse>("account/login/start", device
        ? { type: "chatgptDeviceCode" }
        : { type: "chatgpt", codexStreamlinedLogin: true, useHostedLoginSuccessPage: true, appBrand: "codex" });
      if (response.type === "chatgpt") {
        await openExternalUrl(response.authUrl);
        setStatus("浏览器已打开，完成登录后会自动刷新状态");
      } else if (response.type === "chatgptDeviceCode") {
        setDeviceCode({ url: response.verificationUrl, code: response.userCode });
        await openExternalUrl(response.verificationUrl);
      }
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy("");
    }
  };

  const loginApiKey = async () => {
    if (!client || !connected || !codexKey.trim()) return;
    setBusy("codex-key");
    setStatus("");
    try {
      await client.request<LoginResponse>("account/login/start", { type: "apiKey", apiKey: codexKey.trim() });
      setCodexKey("");
      await refreshAccount();
      setStatus("Codex API Key 已登录");
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy("");
    }
  };

  const logout = async () => {
    if (!client || !connected) return;
    setBusy("logout");
    try {
      await client.request("account/logout");
      await refreshAccount();
      setDeviceCode(null);
      setStatus("Codex 已退出登录");
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy("");
    }
  };

  const removeSecret = async () => {
    setBusy("delete-key");
    try {
      await deleteAiSecret(info.id);
      setSecret("");
      setSecretSaved(false);
      setStatus("API Key 已从 Windows 凭据管理器删除");
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy("");
    }
  };

  const accountLabel = account?.account?.type === "chatgpt"
    ? account.account.email || `ChatGPT ${account.account.planType}`
    : account?.account?.type === "apiKey" ? "API Key" : account?.account ? "Amazon Bedrock" : "本机 Codex 已接入";

  return <div className="ai-settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="ai-settings-dialog" role="dialog" aria-modal="true" aria-label="AI 服务设置">
      <header><div><small>AI PROVIDERS</small><h2>模型与连接</h2></div><button onClick={close} title="关闭"><X size={17}/></button></header>
      <div className="ai-settings-body">
        <label><span>当前服务</span><select value={draft.provider} onChange={event => changeProvider(event.target.value as AiProviderId)}>{AI_PROVIDERS.map(provider => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select><small>{info.hint}</small></label>

        {draft.provider === "codex" ? <div className="codex-account-settings">
          <div className="ai-setting-status"><span className={account?.account ? "ready" : ""}/><div><b>{accountLabel}</b><small>{connected ? "内置 Codex 已连接" : "Codex 进程未连接"}</small></div>{account?.account && <button onClick={logout} title="退出登录"><LogOut size={15}/></button>}</div>
          {!account?.account && <>
            <div className="ai-login-actions"><button onClick={() => loginChatGpt(false)} disabled={!connected || !!busy}><LogIn size={15}/>ChatGPT 登录</button><button onClick={() => loginChatGpt(true)} disabled={!connected || !!busy}>设备码</button></div>
            {deviceCode && <button className="device-code" onClick={() => openExternalUrl(deviceCode.url)}><span>{deviceCode.code}</span><ExternalLink size={14}/></button>}
            <div className="ai-key-row"><KeyRound size={15}/><input type="password" value={codexKey} onChange={event => setCodexKey(event.target.value)} placeholder="Codex / OpenAI API Key"/><button onClick={loginApiKey} disabled={!codexKey.trim() || !!busy} title="使用 API Key 登录"><Check size={15}/></button></div>
          </>}
        </div> : <>
          <label><span>模型</span><input value={draft.model} onChange={event => setDraft(current => ({ ...current, model: event.target.value }))}/></label>
          <label><span>服务地址</span><input value={draft.baseUrl} onChange={event => setDraft(current => ({ ...current, baseUrl: event.target.value }))}/></label>
          {info.needsKey && <label><span>API Key</span><div className="ai-key-row"><KeyRound size={15}/><input type="password" value={secret} onChange={event => setSecret(event.target.value)} placeholder={secretSaved ? "已安全保存，输入可替换" : "保存到 Windows 凭据管理器"}/>{secretSaved && <button onClick={removeSecret} disabled={!!busy} title="删除已保存的 API Key"><Trash2 size={14}/></button>}</div></label>}
          {!info.needsKey && <div className="ai-setting-status"><span className="ready"/><div><b>本地服务</b><small>{draft.baseUrl}</small></div></div>}
        </>}
        {status && <p className="ai-settings-message">{status}</p>}
      </div>
      <footer>{draft.provider !== "codex" && <button onClick={testProvider} disabled={!!busy || !draft.model.trim() || !draft.baseUrl.trim()}>{busy === "test" ? <LoaderCircle className="spin" size={15}/> : <Check size={15}/>}测试连接</button>}<button className="primary" onClick={save} disabled={!!busy}>{busy === "save" ? <LoaderCircle className="spin" size={15}/> : <Check size={15}/>}保存</button></footer>
    </section>
  </div>;
}
