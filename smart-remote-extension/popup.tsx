import { useState, useEffect } from "react"

// Словник доступних дій у браузері
const AVAILABLE_ACTIONS = {
  NONE: "Нічого не робити",
  SCROLL_UP: "Гортати вверх",
  SCROLL_DOWN: "Гортати вниз",
  NEXT_TAB: "Вкладка справа",
  PREV_TAB: "Вкладка зліва",
  NEW_TAB: "Нова вкладка",
  CLOSE_TAB: "Закрити вкладку",
  PLAY_PAUSE: "Пауза / Відтворення"
}

// Словник жестів, які надсилає ESP32
const GESTURES = {
  SWIPE_LEFT: "Змах вліво",
  SWIPE_RIGHT: "Змах вправо",
  SCROLL_UP: "Нахил вверх",
  SCROLL_DOWN: "Нахил вниз",
  TILT_RIGHT: "Нахил вправо",
  TILT_LEFT: "Нахил вліво",
  SHORT_TAP: "Короткий тап"
}

// Стандартні налаштування
const DEFAULT_MAPPINGS = {
  SWIPE_LEFT: "CLOSE_TAB",
  SWIPE_RIGHT: "NEW_TAB",
  SCROLL_UP: "SCROLL_UP",
  SCROLL_DOWN: "SCROLL_DOWN",
  TILT_RIGHT: "NEXT_TAB",
  TILT_LEFT: "PREV_TAB",
  SHORT_TAP: "PLAY_PAUSE"
}

function IndexPopup() {
  const [ipAddress, setIpAddress] = useState("192.168.0.105")
  const [mappings, setMappings] = useState(DEFAULT_MAPPINGS)
  const [saved, setSaved] = useState(false)

  // При відкритті вікна завантажуємо збережені дані
  useEffect(() => {
    chrome.storage.local.get(["espIp", "gestureMappings"], (result) => {
      if (result.espIp) setIpAddress(result.espIp)
      if (result.gestureMappings) setMappings(result.gestureMappings)
    })
  }, [])

  // Збереження налаштувань
  const saveSettings = () => {
    chrome.storage.local.set({
      espIp: ipAddress,
      gestureMappings: mappings
    }, () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  // Оновлення окремого жесту
  const handleMappingChange = (gesture: string, newAction: string) => {
    setMappings(prev => ({ ...prev, [gesture]: newAction }))
  }

  return (
    <div style={{ width: 320, padding: "20px", fontFamily: "sans-serif", backgroundColor: "#f9fafb" }}>
      <h2 style={{ marginTop: 0, marginBottom: "20px", color: "#111827", textAlign: "center" }}>
        🎮 Smart Remote
      </h2>

      {/* Блок налаштування IP */}
      <div style={{ marginBottom: "20px", padding: "15px", backgroundColor: "white", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "5px", color: "#4b5563" }}>
          IP-АДРЕСА ESP32:
        </label>
        <input
          type="text"
          value={ipAddress}
          onChange={(e) => setIpAddress(e.target.value)}
          style={{ width: "100%", padding: "8px", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: "4px" }}
        />
      </div>

      {/* Блок налаштування жестів */}
      <div style={{ marginBottom: "20px", padding: "15px", backgroundColor: "white", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <h3 style={{ fontSize: "14px", margin: "0 0 15px 0", color: "#374151" }}>Налаштування жестів</h3>

        {Object.entries(GESTURES).map(([gestureKey, gestureName]) => (
          <div key={gestureKey} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "13px", color: "#4b5563", fontWeight: 500 }}>{gestureName}</span>
            <select
              value={mappings[gestureKey as keyof typeof mappings]}
              onChange={(e) => handleMappingChange(gestureKey, e.target.value)}
              style={{ padding: "4px", fontSize: "12px", borderRadius: "4px", border: "1px solid #d1d5db", backgroundColor: "#f9fafb", width: "140px" }}
            >
              {Object.entries(AVAILABLE_ACTIONS).map(([actionKey, actionName]) => (
                <option key={actionKey} value={actionKey}>{actionName}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Кнопка збереження */}
      <button
        onClick={saveSettings}
        style={{ width: "100%", padding: "10px", backgroundColor: saved ? "#10b981" : "#3b82f6", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", transition: "background 0.2s" }}
      >
        {saved ? "✅ Збережено!" : "Зберегти налаштування"}
      </button>
    </div>
  )
}

export default IndexPopup