const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { fiyatCek } = require('./scraper.js');
require('dotenv').config();

// Servis Bağlantıları
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// Bildirimlerin gideceği adres
const KENDI_MAILIM = 'batukilic48@gmail.com'; 

// GLOBAL HR-TECH İZLEME LİSTESİ
const RAKIPLER = [
    { 
        ad: 'Deel (Global EOR)', 
        url: 'https://www.deel.com/pricing', 
        selector: '.pricing-card__price', 
        paraBirimi: 'USD'
    },
    { 
        ad: 'Remote.com (Bordrolama)', 
        url: 'https://remote.com/pricing', 
        selector: '[data-testid="pricing-card-price"]', 
        paraBirimi: 'USD'
    },
    { 
        ad: 'Lattice (Performans & Bağlılık)', 
        url: 'https://www.lattice.com/pricing', 
        selector: '.pricing-card__amount', 
        paraBirimi: 'USD'
    },
    { 
        ad: 'SafetyWing (Nomad Sigortası)', 
        url: 'https://safetywing.com/nomad-insurance/pricing', 
        selector: '.price-tag', 
        paraBirimi: 'USD'
    },
    { 
        ad: 'BetterUp (Çalışan Esenliği)', 
        url: 'https://www.betterup.com/pricing', 
        selector: '.plan-price', 
        paraBirimi: 'USD'
    },
    {
        ad: 'Sistem Kontrolü (Books)',
        url: 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
        selector: '.price_color',
        paraBirimi: 'GBP'
    }
];

async function rakipIsle(rakip) {
    console.log(`\n--- [${rakip.ad}] Kontrol Ediliyor ---`);

    try {
        // 1. Veritabanında rakibi kontrol et veya oluştur
        let { data: dbRakip } = await supabase.from('competitors').select('id').eq('website_url', rakip.url).maybeSingle();
        let rakipId = dbRakip ? dbRakip.id : null;

        if (!rakipId) {
            const { data: yeni, error: insertError } = await supabase.from('competitors').insert([{ name: rakip.ad, website_url: rakip.url }]).select().single();
            if (insertError) throw insertError;
            rakipId = yeni.id;
        }

        // 2. Fiyatı web sitesinden çek
        const hamFiyat = await fiyatCek(rakip.url, rakip.selector);
        
        if (!hamFiyat) {
            throw new Error(`${rakip.ad} sitesinden veri alınamadı (Selector değişmiş veya bot engeli).`);
        }

        const yeniFiyat = parseFloat(hamFiyat.replace(/[^0-9.]/g, ""));
        console.log(`>> Mevcut Fiyat: ${yeniFiyat} ${rakip.paraBirimi}`);

        // 3. Veritabanındaki son kayıtla karşılaştır
        const { data: sonKayit } = await supabase.from('price_history')
            .select('price_value')
            .eq('competitor_id', rakipId)
            .order('detected_at', { ascending: false })
            .limit(1).maybeSingle();

        // 4. Değişim varsa kaydet ve mail at
        if (!sonKayit || sonKayit.price_value !== yeniFiyat) {
            console.log(`>> DEĞİŞİM TESPİT EDİLDİ!`);
            
            await supabase.from('price_history').insert([{ 
                competitor_id: rakipId, 
                price_value: yeniFiyat, 
                currency: rakip.paraBirimi 
            }]);
            
            await resend.emails.send({
                from: 'PriceWatch <onboarding@resend.dev>',
                to: [KENDI_MAILIM],
                subject: `🚨 Global HR Alert: ${rakip.ad} Fiyatı Değişti!`,
                html: `
                    <h2>Pazar Analizi Bildirimi</h2>
                    <p><b>${rakip.ad}</b> platformunda fiyat değişimi tespit edildi.</p>
                    <ul>
                        <li><b>Yeni Fiyat:</b> ${yeniFiyat} ${rakip.paraBirimi}</li>
                        <li><b>Eski Fiyat:</b> ${sonKayit ? sonKayit.price_value : 'Veri Yok'} ${rakip.paraBirimi}</li>
                    </ul>
                    <p><a href="${rakip.url}">Siteye Git</a></p>
                `
            });
        } else {
            console.log(`>> Fiyat stabil.`);
        }

    } catch (error) {
        console.error(`!! ${rakip.ad} Hatası:`, error.message);
        // Hata durumunda da bildirim alalım ki sistemin bozulduğunu bilelim
        await resend.emails.send({
            from: 'PriceWatch Error <onboarding@resend.dev>',
            to: [KENDI_MAILIM],
            subject: `⚠️ Takip Hatası: ${rakip.ad}`,
            html: `<p><b>${rakip.ad}</b> izlenirken bir hata oluştu: ${error.message}</p>`
        });
    }
}

async function baslat() {
    console.log("==========================================");
    console.log("PriceWatch Global HR-Tech Edition Başladı");
    console.log("==========================================");
    
    for (const rakip of RAKIPLER) {
        await rakipIsle(rakip);
        // Siteler arasında kısa bir bekleme (Bot korumasına karşı önlem)
        await new Promise(r => setTimeout(r, 3000));
    }
    
    console.log("\n--- Tüm Taramalar Başarıyla Tamamlandı ---");
}

baslat();
