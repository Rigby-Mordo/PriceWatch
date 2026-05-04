// scraper.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function rastgeleUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fiyatCek(url, selector, { timeout = 45000 } = {}) {
    let browser;
    try {
        const temizUrl = url.trim();

        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',      // GitHub Actions için kritik
                '--disable-gpu',
                '--window-size=1920,1080',
                '--lang=en-US,en',
            ],
        });

        const page = await browser.newPage();

        // Viewport + UA
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(rastgeleUA());

        // HTTP başlıklarını gerçek tarayıcı gibi ayarla
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124"',
            'sec-ch-ua-platform': '"Windows"',
        });

        // navigator.webdriver'ı gizle (stealth ek güvence)
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        console.log(`>> Siteye gidiliyor: ${temizUrl}`);

        // networkidle2 yerine domcontentloaded — daha hızlı, daha az bot tespiti
        await page.goto(temizUrl, { waitUntil: 'domcontentloaded', timeout });

        // İnsansı rastgele bekleme (2-5 sn)
        const bekle = 2000 + Math.floor(Math.random() * 3000);
        await new Promise(r => setTimeout(r, bekle));

        // Selector yoksa null dön, exception fırlatma
        const element = await page.$(selector);
        if (!element) {
            console.warn(`>> Selector bulunamadı: ${selector}`);
            await browser.close();
            return null;
        }

        const fiyatText = await page.$eval(selector, el => el.innerText.trim());
        console.log(`>> Ham fiyat alındı: "${fiyatText}"`);

        await browser.close();
        return fiyatText;

    } catch (error) {
        console.error(`>> Tarayıcı Hatası [${url}]:`, error.message);
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
        return null;
    }
}

module.exports = { fiyatCek };
