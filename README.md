# Trendyol Çocuk Trend Takip Sistemi

Bu repo, Trendyol'daki `çocuk` aramasının **En Çok Satan** sıralamasını günlük olarak izleyen bir veri havuzudur.

## Üretilen çıktılar

- `data/history.csv`: ürünlerin gün bazında uzun dönem geçmişi
- `snapshots/YYYY-MM-DD/`: günlük ham JSON ve CSV görüntüsü
- `lists/YYYY-MM-DD/`: yükselen, düşen, trend, niche, kampanya, fiyat ve stok listeleri
- `reports/YYYY-MM-DD.md`: e-ticaret ve dijital pazarlama uzmanı bakışıyla günlük rapor
- `reports/latest.md`: son rapor
- `reports/telegram-latest.txt`: Telegram için kısa günlük yönetici özeti
- `quality/latest.json`: veri kapsamı ve kalite kapısı sonucu

## İzlenen alanlar

Sıra, ürün/marka/kategori, ürün ve satıcı kimliği, satıcı adı/puanı, fiyat/eski fiyat/indirim, kampanyalar, stok durumu ve stok sinyali, son dönem satış sinyali, puan, değerlendirme/yorum/soru sayıları, teslimat ve kargo bilgileri, favori/sepet/görüntülenme sinyalleri, ürün özellikleri ve görsel bağlantısı.

Trendyol'un herkese açık sayfasında gösterilmeyen bir değer tahmin edilmez. Böyle alanlar boş bırakılır ve kalite raporunda kapsama oranına yansıtılır.

## Günlük çalışma

```bash
bash scripts/run_daily.sh
```

Toplayıcı düşük hacimli çalışır, sayfalar arasında bekler ve CAPTCHA/erişim engelini aşmaya çalışmaz. Erişim engellenirse veri üretmek yerine hata verir.
