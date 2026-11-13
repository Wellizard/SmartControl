// background.ts

let espIp = "192.168.0.105";
let socket: WebSocket | null = null;
let currentMappings: Record<string, string> = {};

// Ініціалізація: читаємо налаштування з пам'яті перед стартом
chrome.storage.local.get(["espIp", "gestureMappings"], (result) => {
    if (result.espIp) espIp = result.espIp;
    if (result.gestureMappings) {
        currentMappings = result.gestureMappings;
    } else {
        // Якщо ще нічого не збережено, встановлюємо дефолтні
        currentMappings = {
            SWIPE_LEFT: "CLOSE_TAB",
            SWIPE_RIGHT: "NEW_TAB",
            SCROLL_UP: "SCROLL_UP",
            SCROLL_DOWN: "SCROLL_DOWN",
            TILT_RIGHT: "NEXT_TAB",
            TILT_LEFT: "PREV_TAB",
            SHORT_TAP: "PLAY_PAUSE"
        };
    }
    connectToESP32();
});

// Слухаємо зміни в налаштуваннях (якщо ти змінив їх у Popup)
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local") {
        if (changes.espIp) {
            espIp = changes.espIp.newValue;
            console.log(`IP змінено на: ${espIp}. Перепідключення...`);
            if (socket) socket.close(); // Це викличе onclose і перепідключення з новим IP
        }
        if (changes.gestureMappings) {
            currentMappings = changes.gestureMappings.newValue;
            console.log("Мапінг жестів оновлено.");
        }
    }
});

function connectToESP32() {
    const wsUrl = `ws://${espIp}:81`;
    console.log(`Спроба підключення до ${wsUrl}...`);
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log("✅ Успішно підключено до Smart Remote!");
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleGesture(data.action);
        } catch (e) {
            console.error("Помилка обробки JSON:", e);
        }
    };

    socket.onclose = () => {
        console.log("❌ З'єднання втрачено. Перепідключення через 3 секунди...");
        setTimeout(connectToESP32, 3000);
    };
}

function handleGesture(gesture: string) {
    console.log(`Отримано жест з ESP32: ${gesture}`);

    // Дістаємо призначену дію для цього жесту зі словника
    const actionToPerform = currentMappings[gesture];
    console.log(`Призначена дія: ${actionToPerform}`);

    if (!actionToPerform || actionToPerform === "NONE") return;

    switch (actionToPerform) {
        case "NEXT_TAB":
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
                    if (activeTabs.length > 0 && tabs.length > 0) {
                        const currentIndex = activeTabs[0].index;
                        const nextIndex = (currentIndex + 1) % tabs.length;
                        chrome.tabs.update(tabs[nextIndex].id!, { active: true });
                    }
                });
            });
            break;

        case "PREV_TAB":
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
                    if (activeTabs.length > 0 && tabs.length > 0) {
                        const currentIndex = activeTabs[0].index;
                        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                        chrome.tabs.update(tabs[prevIndex].id!, { active: true });
                    }
                });
            });
            break;

        case "NEW_TAB":
            chrome.tabs.create({});
            break;

        case "CLOSE_TAB":
            chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
                if (activeTabs.length > 0) {
                    chrome.tabs.remove(activeTabs[0].id!);
                }
            });
            break;

        case "PLAY_PAUSE":
        case "SCROLL_UP":
        case "SCROLL_DOWN":
            // Ці команди вимагають маніпуляцій на самій сторінці, тому шлемо їх у content.ts
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: actionToPerform }).catch(() => { });
                }
            });
            break;
    }
}

// Пінг від content.ts, щоб Service Worker не засинав
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "KEEP_ALIVE") {
        sendResponse({ status: "alive" });
    }
});

export { }