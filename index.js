const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { fiyatCek } = require('./scraper.js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);
const KENDI_MAILIM = 'batukilic48@gmail.com'; // Mail adresin buraya eklendi

const RAKIPLER = [
    { ad: 'Deel (Global EOR)', url: 'https://www.deel.com/pricing', selector: '.pricing-card__price', paraBirimi: 'USD' },
    { ad: 'Remote.com (Bordrolama)', url: 'https://remote.com/pricing', selector: '[data-testid="pricing-card-price"]', paraBirimi: 'USD' },
    { ad: 'Lattice (Performans & Bağlılık)', url: 'https://www.lattice.com/pricing', selector: '.pricing-card__amount', paraBirimi: 'USD' },
    { ad: 'SafetyWing (Nomad Sigortası)', url: 'https://safetywing.com/nomad-insurance/pricing', selector: '.price-tag', paraBirimi: 'USD' },
    { ad: 'BetterUp (Çalışan Esenliği)', url: 'https://www.betterup.com/pricing', selector: '.plan-price', paraBirimi: 'USD' },
    { ad: 'Sistem Kontrolü (Books)', url: 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html', selector: '.price_color', paraBirimi: 'GBP' }
];

async function rakipIdAl(rakip) {
    let { data } = await supabase.from('competitors').select('id').eq('website_url', rakip.url).maybeSingle();
    if (data) return data.id;
    const { data: yeni } = await supabase.from('competitors').insert([{ name: rakip.ad, website_url: rakip.url }]).select().single();
    return yeni.id;
}

async function rakipIsle(rakip) {
    console.log(`\n--- [${rakip.ad}] Başlıyor ---`);
    try {
        const rakipId = await rakipIdAl(rakip);
        const hamFiyat = await fiyatCek(rakip.url, rakip.selector);
        if (!hamFiyat) return { rakip: rakip.ad, durum: 'hata' };

        const yeniFiyat = parseFloat(hamFiyat.replace(/[^0-9.]/g, ''));
        const { data: sonKayit } = await supabase.from('price_history').select('price_value').eq('competitor_id', rakipId).order('detected_at', { ascending: false }).limit(1).maybeSingle();

        if (!sonKayit || sonKayit.price_value !== yeniFiyat) {
            await supabase.from('price_history').insert([{ competitor_id: rakipId, price_value: yeniFiyat, currency: rakip.paraBirimi }]);
            await resend.emails.send({
                from: 'PriceWatch <onboarding@resend.dev>',
                to: [KENDI_MAILIM],
                subject: `🚨 ${rakip.ad} Fiyatı Değişti!`,
                html: `<p><strong>${rakip.ad}</strong> yeni fiyatı: ${yeniFiyat} ${rakip.paraBirimi}</p>`
            });
            return { rakip: rakip.ad, durum: 'degisim' };
        }
        return { rakip: rakip.ad, durum: 'ayni' };
    } catch (error) {
        console.error(`!! ${rakip.ad} Hatası:`, error.message);
        return { rakip: rakip.ad, durum: 'hata' };
    }
}

async function baslat() {
    console.log('>> PriceWatch Global HR-Tech Başlatıldı...');
    for (let i = 0; i < RAKIPLER.length; i += 2) {
        const grup = RAKIPLER.slice(i, i + 2);
        await Promise.all(grup.map(rakipIsle));
        if (i + 2 < RAKIPLER.length) await new Promise(r => setTimeout(r, 8000));
    }
    console.log('\n>> İşlem Tamamlandı.');
}
baslat();
