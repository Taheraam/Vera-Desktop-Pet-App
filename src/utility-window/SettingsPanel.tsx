import { useEffect, useState, useCallback } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { ProviderStatus, AgentAction } from '../shared/types';
import {
  setAutoStart, getXpState, onEvent,
  addProviderKey, removeProviderKey, verifyProviderKey,
  listProviders, setActiveProvider, listAgentActions,
  getPermissionStatus, setContextEngine,
} from '../shared/ipc-client';

const PROVIDERS = ['openai', 'anthropic', 'gemini'] as const;
const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
};

export function SettingsPanel() {
  const [xpState, setXpState] = useState<{ xp: number; level: number } | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<Record<string, string>>({});
  const [agentActions, setAgentActions] = useState<AgentAction[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [ctxEngineEnabled, setCtxEngineEnabled] = useState(false);

  useEffect(() => {
    getXpState().then(setXpState).catch(() => {});
    const unlisten = onEvent('xp-changed', (p) => setXpState(p));
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    refreshProviders();
    refreshAudit();
  }, []);

  useEffect(() => {
    getPermissionStatus().then((s) => setCtxEngineEnabled(s.contextEngineEnabled)).catch(() => {});
  }, []);

  const refreshProviders = async () => {
    try {
      const p = await listProviders();
      setProviders(p);
    } catch { /* ignore */ }
  };

  const refreshAudit = async () => {
    try {
      const a = await listAgentActions(20);
      setAgentActions(a);
    } catch { /* ignore */ }
  };

  const handleEnableAutoStart = useCallback(async () => {
    try { await setAutoStart(true); } catch { /* not critical */ }
  }, []);

  const handleDisableAutoStart = useCallback(async () => {
    try { await setAutoStart(false); } catch { /* not critical */ }
  }, []);

  const handleToggleContextEngine = useCallback(async (enable: boolean) => {
    try {
      await setContextEngine(enable);
      setCtxEngineEnabled(enable);
    } catch { /* not critical */ }
  }, []);

  const handleAddKey = async (provider: string) => {
    const key = apiKeys[provider];
    if (!key) return;
    try {
      setVerifyStatus(prev => ({ ...prev, [provider]: 'Saving...' }));
      await addProviderKey({ provider, apiKey: key });
      setApiKeys(prev => ({ ...prev, [provider]: '' }));
      setAddingKey(null);
      setVerifyStatus(prev => ({ ...prev, [provider]: 'Saved' }));
      await refreshProviders();
    } catch (e) {
      setVerifyStatus(prev => ({ ...prev, [provider]: String(e) }));
    }
  };

  const handleRemoveKey = async (provider: string) => {
    try {
      await removeProviderKey(provider);
      setVerifyStatus(prev => ({ ...prev, [provider]: 'Removed' }));
      await refreshProviders();
    } catch (e) {
      setVerifyStatus(prev => ({ ...prev, [provider]: String(e) }));
    }
  };

  const handleVerifyKey = async (provider: string) => {
    setVerifyStatus(prev => ({ ...prev, [provider]: 'Verifying...' }));
    try {
      const result = await verifyProviderKey(provider);
      setVerifyStatus(prev => ({
        ...prev,
        [provider]: result.valid ? 'Valid ✓' : `Invalid: ${result.error || 'unknown error'}`,
      }));
    } catch (e) {
      setVerifyStatus(prev => ({ ...prev, [provider]: String(e) }));
    }
  };

  const handleSetActive = async (provider: string) => {
    try {
      await setActiveProvider(provider);
      await refreshProviders();
    } catch (e) {
      setVerifyStatus(prev => ({ ...prev, [provider]: String(e) }));
    }
  };

  return (
    <div className="settings-panel">
      <h3>Settings</h3>

      <div className="settings-section">
        <h4>XP & Progress</h4>
        <div className="settings-row">
          {xpState ? (
            <span>Level {xpState.level} — {xpState.xp % 100}/100 XP</span>
          ) : (
            <span>No XP yet</span>
          )}
        </div>
        {xpState && (
          <div className="xp-bar-track">
            <div
              className="xp-bar-fill"
              style={{ width: `${xpState.xp % 100}%` }}
            />
          </div>
        )}
      </div>

      <div className="settings-section">
        <h4>Launch</h4>
        <div className="settings-row">
          <span>Launch at login</span>
          <button onClick={handleEnableAutoStart} className="settings-btn">On</button>
          <button onClick={handleDisableAutoStart} className="settings-btn">Off</button>
        </div>
        <p className="settings-note">Only enable if you want the pet to start automatically with your computer.</p>
      </div>

      <div className="settings-section">
        <h4>Context Engine</h4>
        <div className="settings-row">
          <span>Active-window detection</span>
          <button onClick={() => handleToggleContextEngine(true)} className="settings-btn" style={ctxEngineEnabled ? { background: '#2a7', color: '#fff' } : {}}>On</button>
          <button onClick={() => handleToggleContextEngine(false)} className="settings-btn" style={!ctxEngineEnabled ? { background: '#c44', color: '#fff' } : {}}>Off</button>
        </div>
        <p className="settings-note">Detects the active window category (coding, browsing, idle) so the pet can respond contextually. Window titles are read in-memory only and never stored. If disabled, the pet always shows its idle state.</p>
      </div>

      <div className="settings-section">
        <h4>AI Providers</h4>
        <p className="settings-note">Add API keys for AI providers. The active provider is used for task delegation.</p>
        {PROVIDERS.map((provider) => {
          const status = providers.find(p => p.provider === provider);
          const isConfigured = !!status;
          const isActive = status?.isActive ?? false;
          const verifyText = verifyStatus[provider] || '';

          return (
            <div key={provider} className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 500, minWidth: 100 }}>{PROVIDER_LABELS[provider]}</span>
                {isConfigured ? (
                  <>
                    {isActive ? <span className="badge-active">Active</span> : <span className="badge-inactive">Inactive</span>}
                    {verifyText && <span style={{ fontSize: 11, color: verifyText.includes('✓') ? '#2a7' : '#c44' }}>{verifyText}</span>}
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: '#999' }}>Not configured</span>
                )}
              </div>

              {isConfigured ? (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button onClick={() => handleVerifyKey(provider)} className="settings-btn-sm">Verify</button>
                  {!isActive && <button onClick={() => handleSetActive(provider)} className="settings-btn-sm">Set Active</button>}
                  <button onClick={() => handleRemoveKey(provider)} className="settings-btn-sm btn-danger">Remove</button>
                </div>
              ) : addingKey === provider ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={apiKeys[provider] || ''}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, [provider]: e.target.value }))}
                    style={{ flex: 1, fontSize: 12, padding: '2px 6px' }}
                  />
                  <button onClick={() => handleAddKey(provider)} className="settings-btn-sm">Save</button>
                  <button onClick={() => { setAddingKey(null); setApiKeys(prev => ({ ...prev, [provider]: '' })); }} className="settings-btn-sm">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setAddingKey(provider)} className="settings-btn-sm">Add Key</button>
              )}
            </div>
          );
        })}
      </div>

      <div className="settings-section">
        <h4>Agent Action Audit Log</h4>
        <button onClick={() => { setShowAudit(!showAudit); refreshAudit(); }} className="settings-btn">
          {showAudit ? 'Hide' : `Show (${agentActions.length})`}
        </button>
        {showAudit && agentActions.length === 0 && (
          <div className="settings-note" style={{ marginTop: 4 }}>No agent actions recorded yet.</div>
        )}
        {showAudit && agentActions.length > 0 && (
          <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 11, marginTop: 4 }}>
            {agentActions.map((a) => (
              <div key={a.id} style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>
                <div style={{ fontWeight: 500 }}>{a.actionType}</div>
                <div style={{ color: '#666' }}>{a.targetSummary}</div>
                <div style={{ color: statusColor(a.status), fontSize: 10 }}>
                  {a.status} · {new Date(a.createdAt * 1000).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-section">
        <h4>About</h4>
        <div className="settings-row">
          <span>VeraPet v0.0.1</span>
        </div>
      </div>
    </div>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case 'executed': return '#2a7';
    case 'denied': return '#c44';
    case 'failed': return '#c44';
    case 'pending_consent': return '#e87';
    default: return '#666';
  }
}
