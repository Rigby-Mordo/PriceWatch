const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { fiyatCek } = require('./scraper.js');
require('dotenv').config();

// Servis Bağlantıları
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// Senin mail adresin buraya sabitlendi
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
    console.log(`\n--- [${rakip.ad}] İşlem Başlıyor ---`);

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
            throw new Error(`${rakip.ad} sitesinden veri alınamadı (Bot koruması veya Selector hatası).`);
        }

        const yeniFiyat = parseFloat(hamFiyat.replace(/[^0-9.]/g, ""));
        console.log(`>> Çekilen Fiyat: ${yeniFiyat} ${rakip.paraBirimi}`);

        // 3. Veritabanındaki son kayıtla karşılaştır
        const { data: sonKayit } = await supabase.from('price_history')
            .select('price_value')
            .eq('competitor_id', rakipId)
            .order('detected_at', { ascending: false })
            .limit(1).maybeSingle();

        // 4. Değişim varsa kaydet ve mail at
        if (!sonKayit || sonKayit.price_value !== yeniFiyat) {
            console.log(`>> DEĞİŞİM VAR! Kaydediliyor...`);
            
            await supabase.from('price_history').insert([{ 
                competitor_id: rakipId, 
                price_value: yeniFiyat, 
                currency: rakip.paraBirimi 
            }]);
            
            await resend.emails.send({
                from: 'PriceWatch <onboarding@resend.dev>',
                to: [KENDI_MAILIM],
                subject: `🚨 Global HR Alert: ${rakip.ad} Fiyatı Değişti!`,
                html: `<h3>${rakip.ad} Fiyatı Güncellendi!</h3><p>Yeni: ${yeniFiyat} ${rakip.paraBirimi}</p>`
            });
        } else {
            console.log(`>> Fiyat aynı, aksiyon alınmadı.`);
        }

    } catch (error) {
        console.error(`!! ${rakip.ad} Hatası:`, error.message);
    }
}

async function baslat() {
    console.log(">> PriceWatch Global HR-Tech Başlatıldı...");
    for (const rakip of RAKIPLER) {
        await rakipIsle(rakip);
        // Bot engeline takılmamak için 5 saniye bekleme
        await new Promise(r => setTimeout(r, 5000)); 
    }
    console.log("\n--- Tüm Rakipler Kontrol Edildi ---");
}

baslat();
