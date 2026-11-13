import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
    matches: ["<all_urls>"],
    all_frames: true
}

console.log("Content script завантажено!");

// Пульс для уникнення засинання
setInterval(() => {
    chrome.runtime.sendMessage({ action: "KEEP_ALIVE" }).catch(() => { });
}, 20000);

let lastTapTime = 0; // Запобіжник від подвійних кліків

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "SCROLL_UP") {
        window.scrollBy({ top: -100, behavior: "smooth" });
    } else if (message.action === "SCROLL_DOWN") {
        window.scrollBy({ top: 100, behavior: "smooth" });
    } else if (message.action === "PLAY_PAUSE") {
        // Ігноруємо сигнали, якщо з минулого тапу пройшло менше 500 мс
        const now = Date.now();
        if (now - lastTapTime < 500) return;
        lastTapTime = now;

        togglePlayPause();
    }
});

function togglePlayPause() {
    // 1. Метод "Розумний клік" - шукаємо кнопки відомих плеєрів
    const playerButtons = [
        ".playControl", // SoundCloud
        "[data-testid='control-button-playpause']", // Spotify
        ".ytp-play-button", // YouTube
        ".button-nfplayerPlay", // Netflix
        ".vjs-play-control", // Video.js
        ".play-pause-button" // Загальний клас
    ];

    for (const selector of playerButtons) {
        const btn = document.querySelector<HTMLElement>(selector);
        if (btn) {
            btn.click();
            console.log(`🖱 Натиснуто кнопку плеєра: ${selector}`);
            return; // Успішно натиснули, виходимо
        }
    }

    // 2. Фолбек: пряме управління медіа-тегами для простих сайтів
    const mediaElements = Array.from(document.querySelectorAll<HTMLMediaElement>("video, audio"));
    let didAction = false;

    for (const media of mediaElements) {
        // Ігноруємо фонові відео (без звуку)
        if (media.tagName.toLowerCase() === 'video' && (media.muted || media.volume === 0)) continue;

        if (!media.paused && media.currentTime > 0 && !media.ended) {
            media.pause();
            didAction = true;
            console.log("⏸ Пауза (media.pause)");
        }
    }

    if (!didAction) {
        for (const media of mediaElements) {
            if (media.tagName.toLowerCase() === 'video' && (media.muted || media.volume === 0)) continue;
            if (media.paused) {
                media.play().catch(() => { });
                didAction = true;
                console.log("▶️ Відтворення (media.play)");
                break; // Запускаємо лише перше знайдене медіа
            }
        }
    }

    // 3. Останній шанс: універсальний пробіл із затримкою
    if (!didAction) {
        console.log("Медіа не знайдено, симулюємо Space");
        const target = document.activeElement || document.body;

        target.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", keyCode: 32, bubbles: true }));
        // Маленька затримка перед keyup імітує реальне натискання
        setTimeout(() => {
            target.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", keyCode: 32, bubbles: true }));
        }, 50);
    }
}