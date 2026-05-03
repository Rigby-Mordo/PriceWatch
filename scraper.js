const puppeteer = require('puppeteer');

async function fiyatCek(url, selector) {
    let browser;
    try {
        // URL'yi temizle (boşluk veya gizli karakterleri siler)
        const temizUrl = url.trim();

        browser = await puppeteer.launch({ 
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ] 
        });
        
        const page = await browser.newPage();
        
        // Gerçek kullanıcı kimliği
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });

        console.log(`>> Siteye gidiliyor: ${temizUrl}`);
        
        // Sayfayı yükle
        await page.goto(temizUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Sayfanın kendine gelmesi için kısa bir mola
        await new Promise(r => setTimeout(r, 3000));

        console.log(">> Fiyat etiketi aranıyor...");
        await page.waitForSelector(selector, { timeout: 15000 });

        // Veriyi çek
        const fiyatText = await page.$eval(selector, el => el.innerText.trim());
        
        await browser.close();
        return fiyatText;

    } catch (error) {
        console.error(">> Tarayıcı Hatası:", error.message);
        if (browser) await browser.close();
        return null;
    }
}

module.exports = { fiyatCek };