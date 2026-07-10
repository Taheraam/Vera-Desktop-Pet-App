import { useCallback } from 'react';
import { setClickThrough, setAutoStart } from '../shared/ipc-client';

export function SettingsPanel() {
  const handleToggleClickThrough = useCallback(async () => {
    try {
      await setClickThrough(true);
    } catch {
      /* not critical */
    }
  }, []);

  const handleDisableClickThrough = useCallback(async () => {
    try {
      await setClickThrough(false);
    } catch {
      /* not critical */
    }
  }, []);

  const handleEnableAutoStart = useCallback(async () => {
    try {
      await setAutoStart(true);
    } catch {
      /* not critical */
    }
  }, []);

  const handleDisableAutoStart = useCallback(async () => {
    try {
      await setAutoStart(false);
    } catch {
      /* not critical */
    }
  }, []);

  return (
    <div className="settings-panel">
      <h3>Settings</h3>

      <div className="settings-section">
        <h4>Pet Window</h4>
        <div className="settings-row">
          <span>Enable click-through (pet ignores clicks)</span>
          <button onClick={handleToggleClickThrough} className="settings-btn">On</button>
          <button onClick={handleDisableClickThrough} className="settings-btn">Off</button>
        </div>
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
        <h4>About</h4>
        <div className="settings-row">
          <span>VeraPet v0.0.1</span>
        </div>
        <p className="settings-note">Desktop pet companion app. See docs/ for full documentation.</p>
      </div>
    </div>
  );
}
