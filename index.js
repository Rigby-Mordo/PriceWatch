// index.js
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { fiyatCek } = require('./scraper.js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);
const KENDI_MAILIM = 'batukilic48@gmail.com';

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

// Rakip kaydını bul veya oluştur
async function rakipIdAl(rakip) {
    let { data } = await supabase
        .from('competitors')
        .select('id')
        .eq('website_url', rakip.url)
        .maybeSingle();

    if (data) return data.id;

    const { data: yeni, error } = await supabase
        .from('competitors')
        .insert([{ name: rakip.ad, website_url: rakip.url }])
        .select()
        .single();

    if (error) throw error;
    return yeni.id;
}

async function rakipIsle(rakip) {
    const etiket = `[${rakip.ad}]`;
    console.log(`\n--- ${etiket} Başlıyor ---`);

    try {
        const rakipId = await rakipIdAl(rakip);
        const hamFiyat = await fiyatCek(rakip.url, rakip.selector);

        if (!hamFiyat) {
            // Hata zaten scraper içinde loglandı, sessizce geç
            console.warn(`${etiket} Fiyat alınamadı, atlanıyor.`);
            return { rakip: rakip.ad, durum: 'hata', sebep: 'fiyat_alinamadi' };
        }

        const yeniFiyat = parseFloat(hamFiyat.replace(/[^0-9.]/g, ''));
        console.log(`${etiket} Fiyat: ${yeniFiyat} ${rakip.paraBirimi}`);

        const { data: sonKayit } = await supabase
            .from('price_history')
            .select('price_value')
            .eq('competitor_id', rakipId)
            .order('detected_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!sonKayit || sonKayit.price_value !== yeniFiyat) {
            console.log(`${etiket} DEĞİŞİM ALGILANDI — kaydediliyor...`);

            await supabase.from('price_history').insert([{
                competitor_id: rakipId,
                price_value: yeniFiyat,
                currency: rakip.paraBirimi,
            }]);

            await resend.emails.send({
                from: 'PriceWatch <onboarding@resend.dev>',
                to: [KENDI_MAILIM],
                subject: `🚨 ${rakip.ad} Fiyatı Değişti!`,
                html: `
                    <h2>🔔 Fiyat Değişikliği Tespit Edildi</h2>
                    <p><strong>Rakip:</strong> ${rakip.ad}</p>
                    <p><strong>Yeni Fiyat:</strong> ${yeniFiyat} ${rakip.paraBirimi}</p>
                    ${sonKayit ? `<p><strong>Eski Fiyat:</strong> ${sonKayit.price_value} ${rakip.paraBirimi}</p>` : '<p><em>İlk kayıt</em></p>'}
                    <p><strong>URL:</strong> <a href="${rakip.url}">${rakip.url}</a></p>
                `
            });

            return { rakip: rakip.ad, durum: 'degisim', yeniFiyat };
        }

        console.log(`${etiket} Fiyat aynı, aksiyon alınmadı.`);
        return { rakip: rakip.ad, durum: 'ayni', fiyat: yeniFiyat };

    } catch (error) {
        // try/catch burada olduğu için bir rakipteki hata diğerlerini etkilemez
        console.error(`${etiket} KRİTİK HATA:`, error.message);
        return { rakip: rakip.ad, durum: 'hata', sebep: error.message };
    }
}

// Diziyi N'li gruplara böl
function grupla(arr, n) {
    const gruplar = [];
    for (let i = 0; i < arr.length; i += n) {
        gruplar.push(arr.slice(i, i + n));
    }
    return gruplar;
}

async function baslat() {
    console.log('========================================');
    console.log('  PriceWatch Global HR-Tech Başlatıldı');
    console.log(`  Tarih: ${new Date().toISOString()}`);
    console.log('========================================');

    const sonuclar = [];
    // 2'li gruplar halinde paralel çalıştır (bot tespitini zorlaştırmak için tam paralel değil)
    const gruplar = grupla(RAKIPLER, 2);

    for (const grup of gruplar) {
        const grupSonuclari = await Promise.all(grup.map(rakipIsle));
        sonuclar.push(...grupSonuclari);

        // Gruplar arası bekleme
        if (gruplar.indexOf(grup) < gruplar.length - 1) {
            console.log('\n--- Grup tamamlandı, 8 saniye bekleniyor... ---');
            await new Promise(r => setTimeout(r, 8000));
        }
    }

    // Özet
    console.log('\n========== ÖZET ==========');
    for (const s of sonuclar) {
        const sembol = s.durum === 'degisim' ? '🔴' : s.durum === 'ayni' ? '🟢' : '⚠️';
        console.log(`${sembol} ${s.rakip}: ${s.durum.toUpperCase()}`);
    }
    console.log('===========================\n');
}

baslat().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});