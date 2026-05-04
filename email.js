const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

async function alarmGonder(siteAdi, eskiFiyat, yeniFiyat) {
    try {
        const { data, error } = await resend.emails.send({
            from: 'PriceWatch <onboarding@resend.dev>', // Resend'in test adresi
            to: ['senin_mail_adresin@gmail.com'], // Buraya kendi mailini yaz
            subject: `🚨 Fiyat Değişti: ${siteAdi}`,
            html: `
                <h2>Bir fiyat değişikliği tespit edildi!</h2>
                <p><strong>Site:</strong> ${siteAdi}</p>
                <p><strong>Eski Fiyat:</strong> ${eskiFiyat} GBP</p>
                <p><strong>Yeni Fiyat:</strong> ${yeniFiyat} GBP</p>
                <br>
                <p>Hemen aksiyon almak için paneline göz at.</p>
            `
        });

        if (error) {
            console.error("Mail gönderilirken hata:", error);
        } else {
            console.log(">> ALARM: Fiyat değişim maili gönderildi!", data.id);
        }
    } catch (err) {
        console.error("Beklenmedik mail hatası:", err);
    }
}

module.exports = { alarmGonder };