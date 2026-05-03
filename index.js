const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { fiyatCek } = require('./scraper.js');
require('dotenv').config();

// 1. BAĞLANTILAR
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// 2. AYARLAR
const KENDI_MAILIM = 'senin_mail_adresin@gmail.com'; // Burayı güncellemeyi unutma!
const RAKIP_URL = 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html';
const RAKIP_ADI = 'Test Kitapçısı';
const SELECTOR = '.price_color'; 

async function baslat() {
    console.log(`\n--- [PriceWatch] ${RAKIP_ADI} Kontrolü Başladı ---`);

    // --- ADIM 1: Rakip Kaydı ---
    let { data: rakip } = await supabase.from('competitors').select('id').eq('website_url', RAKIP_URL).maybeSingle();
    let rakipId;

    if (rakip) {
        rakipId = rakip.id;
    } else {
        const { data: yeni, error: e } = await supabase.from('competitors').insert([{ name: RAKIP_ADI, website_url: RAKIP_URL }]).select().single();
        if (e) return console.error("!! Veritabanı Hatası:", e.message);
        rakipId = yeni.id;
    }

    // --- ADIM 2: Fiyat Çekme ---
    const hamFiyat = await fiyatCek(RAKIP_URL, SELECTOR);
    
    // --- ADIM 3: Mantık Kontrolü ---
    if (hamFiyat) {
        const yeniFiyat = parseFloat(hamFiyat.replace(/[^0-9.]/g, ""));
        console.log(`>> Başarılı! Güncel Fiyat: ${yeniFiyat}`);

        const { data: sonKayit } = await supabase.from('price_history')
            .select('price_value')
            .eq('competitor_id', rakipId)
            .order('detected_at', { descending: false })
            .limit(1).maybeSingle();

        const eskiFiyat = sonKayit ? sonKayit.price_value : null;

        if (eskiFiyat !== yeniFiyat) {
            console.log(">> DEĞİŞİM TESPİT EDİLDİ. Kaydediliyor...");
            await supabase.from('price_history').insert([{ competitor_id: rakipId, price_value: yeniFiyat, currency: 'GBP' }]);
            
            await resend.emails.send({
                from: 'PriceWatch <onboarding@resend.dev>',
                to: [KENDI_MAILIM],
                subject: `🚨 Fiyat Değişti: ${RAKIP_ADI}`,
                html: `<h3>Fiyat Güncellendi!</h3><p>Yeni Fiyat: <b>${yeniFiyat} GBP</b></p><p>Eski Fiyat: ${eskiFiyat || 'Yok'}</p>`
            });
            console.log(">> Başarı maili gönderildi.");
        } else {
            console.log(">> Fiyat aynı, aksiyon alınmadı.");
        }
    } else {
        // --- BURASI KRİTİK: HATA VARSA SANA HABER VERİR ---
        console.log("!! HATA: Fiyat çekilemedi. Selector bozulmuş veya site botu engellemiş olabilir.");
        
        try {
            await resend.emails.send({
                from: 'PriceWatch Error <onboarding@resend.dev>',
                to: [KENDI_MAILIM],
                subject: `⚠️ Takip Hatası: ${RAKIP_ADI}`,
                html: `<h3>Sistem Bir Sorunla Karşılaştı</h3>
                       <p><b>${RAKIP_ADI}</b> sitesinden veri çekilemedi.</p>
                       <p>Olası Sebepler:</p>
                       <ul>
                        <li>Selector (${SELECTOR}) değişmiş olabilir.</li>
                        <li>Site bot olduğumuzu anlamış olabilir.</li>
                        <li>İnternet bağlantısı veya URL hatalı olabilir.</li>
                       </ul>
                       <p>Lütfen kontrol et!</p>`
            });
            console.log(">> Hata bildirim maili gönderildi.");
        } catch (mailError) {
            console.error("!! Hata maili bile gönderilemedi:", mailError.message);
        }
    }
}

baslat();