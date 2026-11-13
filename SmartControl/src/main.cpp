#include <Wire.h>
#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ESPmDNS.h>
#include "MAX30105.h" // Працює і для MAX30102

// Налаштування пінів та I2C
#define I2C_SDA 8
#define I2C_SCL 9
#define MPU_ADDR 0x68

// Налаштування мережі
const char *ssid = "your_ssid";
const char *password = "your_password";

WebSocketsServer webSocket = WebSocketsServer(81);
MAX30105 particleSensor;

// Стейт-машина для оптичної кнопки
enum State
{
    IDLE,
    PRESSED,
    HOLD
};
State currentState = IDLE;

const long IR_THRESHOLD = 23000;      // Поріг спрацювання
const unsigned long HOLD_DELAY = 400; // Мілісекунди для переходу в режим HOLD
unsigned long pressStartTime = 0;
unsigned long lastPingTime = 0;
const unsigned long PING_INTERVAL = 20000;

// Попереднє оголошення функцій для PlatformIO
void webSocketEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length);
void sendAction(String actionName);
void processGestures();

// Статична IP
IPAddress local_IP(192, 168, 0, 200);
IPAddress gateway(192, 168, 0, 1);
IPAddress subnet(255, 255, 255, 0);

void setup()
{
    Serial.begin(115200);
    delay(3000); // Чекаємо 3 секунди для ініціалізації USB Serial на ESP32-S3
    Serial.println("\nСистема стартує...");

    Wire.begin(I2C_SDA, I2C_SCL);

    // 1. Ініціалізація RGB LED
    neopixelWrite(RGB_BUILTIN, 0, 0, 0);

    // 2. Ініціалізація MAX30102
    if (!particleSensor.begin(Wire, I2C_SPEED_FAST))
    {
        Serial.println("MAX30102 не знайдено!");
        while (1)
            ;
    }
    particleSensor.setup();
    particleSensor.setPulseAmplitudeRed(0x0A); // Вимикаємо червоний діод, залишаємо тільки IR
    particleSensor.setPulseAmplitudeGreen(0);

    // 3. Ініціалізація MPU6050 (Виводимо зі сплячого режиму)
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x6B); // Регістр керування живленням
    Wire.write(0);    // Встановлюємо в 0 (пробудження)
    Wire.endTransmission(true);

    // 4. Підключення до Wi-Fi
    WiFi.config(local_IP, gateway, subnet);
    WiFi.begin(ssid, password);
    Serial.print("Підключення до Wi-Fi");
    while (WiFi.status() != WL_CONNECTED)
    {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWi-Fi підключено. IP: " + WiFi.localIP().toString());

    // 5. Запуск WebSocket сервера
    webSocket.begin();
    webSocket.onEvent(webSocketEvent);

    // Готовність системи - світимо синім 1 секунду
    neopixelWrite(RGB_BUILTIN, 0, 0, 64);
    delay(1000);
    neopixelWrite(RGB_BUILTIN, 0, 0, 0);
}

void loop()
{
    if (millis() - lastPingTime > PING_INTERVAL)
    {
        sendAction("PING");
        lastPingTime = millis();
    }

    webSocket.loop(); // Обробка вхідних клієнтів

    long irValue = particleSensor.getIR();
    bool isFingerPresent = (irValue > IR_THRESHOLD);
    unsigned long currentTime = millis();

    // Логіка стейт-машини
    switch (currentState)
    {
    case IDLE:
        if (isFingerPresent)
        {
            currentState = PRESSED;
            pressStartTime = currentTime;
            neopixelWrite(RGB_BUILTIN, 64, 64, 0); // Жовтий колір - торкання зафіксовано
        }
        break;

    case PRESSED:
        if (!isFingerPresent)
        {
            // Палець прибрали швидко - це "Короткий Тап"
            sendAction("SHORT_TAP");
            neopixelWrite(RGB_BUILTIN, 0, 0, 0); // Вимикаємо діод
            currentState = IDLE;
        }
        else if (currentTime - pressStartTime > HOLD_DELAY)
        {
            // Палець тримають довго - переходимо в режим "Утримання" (Шорткати)
            currentState = HOLD;
            neopixelWrite(RGB_BUILTIN, 0, 64, 0); // Зелений колір - режим навігації активний
        }
        break;

    case HOLD:
        if (!isFingerPresent)
        {
            // Відпустили після утримання
            sendAction("HOLD_RELEASED");
            neopixelWrite(RGB_BUILTIN, 0, 0, 0);
            currentState = IDLE;
        }
        else
        {
            // Ми в режимі HOLD, тому постійно читаємо кути нахилу і шлемо команди
            processGestures();
        }
        break;
    }
}

void processGestures()
{
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x3B);
    Wire.endTransmission(false);
    Wire.requestFrom((uint16_t)MPU_ADDR, (uint8_t)14, true);

    int16_t accX = Wire.read() << 8 | Wire.read();
    int16_t accY = Wire.read() << 8 | Wire.read();
    int16_t accZ = Wire.read() << 8 | Wire.read();
    int16_t tempRaw = Wire.read() << 8 | Wire.read();
    int16_t gyroX = Wire.read() << 8 | Wire.read();
    int16_t gyroY = Wire.read() << 8 | Wire.read();
    int16_t gyroZ = Wire.read() << 8 | Wire.read();

    float pitch = atan2((float)accY, (float)accZ) * 180.0 / PI; // Вперед/Назад
    float roll = atan2((float)-accX, (float)accZ) * 180.0 / PI; // Вліво/Вправо

    // 1. Швидкі змахи (ТІЛЬКИ по осі Z - горизонтальний поворот кисті)
    if (gyroZ > 15000) // Повернули 15000, щоб виключити мікрорухи
    {
        sendAction("SWIPE_LEFT");
        delay(1000);
        return;
    }
    else if (gyroZ < -15000)
    {
        sendAction("SWIPE_RIGHT");
        delay(1000);
        return;
    }

    // 2. ФІЛЬТР РУХУ: Якщо рука зараз активно обертається, блокуємо статичні нахили
    if (abs(gyroX) > 4000 || abs(gyroY) > 4000 || abs(gyroZ) > 4000)
    {
        return;
    }

    // 3. Статичні нахили
    if (pitch > 15)
    {
        sendAction("SCROLL_UP");
        delay(150);
    }
    else if (pitch < -15)
    {
        sendAction("SCROLL_DOWN");
        delay(150);
    }
    else if (roll > 25)
    {
        sendAction("TILT_RIGHT");
        delay(700);
    }
    else if (roll < -25)
    {
        sendAction("TILT_LEFT");
        delay(700);
    }
}

// Допоміжна функція для надсилання JSON через WebSockets
void sendAction(String actionName)
{
    String payload = "{\"action\": \"" + actionName + "\"}";
    webSocket.broadcastTXT(payload);
    Serial.println("Sent: " + actionName);
}

// Обробка подій WebSocket (підключення/відключення клієнтів)
void webSocketEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length)
{
    if (type == WStype_CONNECTED)
    {
        Serial.printf("[%u] Клієнт підключився!\n", num);
        neopixelWrite(RGB_BUILTIN, 0, 64, 64); // Бірюзовий - хтось підключився
        delay(300);
        neopixelWrite(RGB_BUILTIN, 0, 0, 0);
    }
}