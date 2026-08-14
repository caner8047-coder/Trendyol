# Trendyol En Çok Satanlar Veri Havuzu

Bu repo, Trendyol'daki farklı aramaların **En Çok Satan** sıralamasını günlük olarak izleyen bir veri havuzudur. Aktif profiller: `çocuk` ve `erkek`.

İlk aşamada her günlük çalışmada birden fazla sonuç sayfası birleştirilerek **200 benzersiz ürün** izlenir. 200 ürün eşiği sağlanmazsa kalite kapısı çalışmayı reddeder ve son geçerli rapor korunur. Yapı, sistem kararlılığı doğrulandıktan sonra ayar dosyasından yeniden 1.000 ürüne ölçeklenebilir.

İlk aşamada 200 ürünün tamamı her gün ayrıntılı olarak yenilenir. Sistem yeniden 1.000 ürüne çıkarıldığında ilk 200 günlük, kalan ürünler dönüşümlü ve hızlı değişen ürünler öncelikli olacak şekilde katmanlı strateji kullanılabilir.

Ana `çocuk` en çok satan akışı benzersiz ürün vermeyi bıraktığında havuz; oyuncak, giyim, ayakkabı, okul/çanta, oda, kitap ve bebek-çocuk alt alışveriş niyetleriyle tamamlanır. Ana arama her zaman ilk önceliktedir. Her satırda `source_segment`, `source_query`, `segment_position` ve `source_page` alanları bulunur; böylece sıralama kapsamı şeffaftır.

`erkek` profili aynı kalite ve veri şemasını kullanır; çıktıları `categories/erkek/` altında çocuk veri havuzundan tamamen ayrı tutulur. Çocuk görevi her gün 09:00'da, erkek görevi çakışmayı önlemek için 09:30'da çalışır.

## Üretilen çıktılar

- `data/history.csv`: ürünlerin gün bazında uzun dönem geçmişi
- `snapshots/YYYY-MM-DD/`: günlük ham JSON ve CSV görüntüsü
- `lists/YYYY-MM-DD/`: yükselen, düşen, trend, niche, kampanya, fiyat ve stok listeleri; CSV ve ürün adları tıklanabilir Markdown sürümleri
- `reports/YYYY-MM-DD.md`: e-ticaret ve dijital pazarlama uzmanı bakışıyla günlük rapor
- `reports/latest.md`: son rapor
- `reports/telegram-latest.txt`: Telegram için kısa günlük yönetici özeti
- `quality/latest.json`: veri kapsamı ve kalite kapısı sonucu
- `categories/erkek/`: erkek profiline ait aynı `data`, `snapshots`, `lists`, `reports` ve `quality` yapısı

## İzlenen alanlar

Sıra, ürün/marka/kategori, ürün ve satıcı kimliği, satıcı adı/puanı, fiyat/eski fiyat/indirim, kampanyalar, stok durumu ve stok sinyali, son dönem satış sinyali, puan, değerlendirme/yorum/soru sayıları, teslimat ve kargo bilgileri, favori/sepet/görüntülenme sinyalleri, ürün özellikleri ve görsel bağlantısı.

Trendyol'un herkese açık sayfasında gösterilmeyen bir değer tahmin edilmez. Böyle alanlar boş bırakılır ve kalite raporunda kapsama oranına yansıtılır.

## Günlük çalışma

```bash
bash scripts/run_daily.sh
```

Toplayıcı düşük hacimli çalışır, sayfalar arasında bekler ve CAPTCHA/erişim engelini aşmaya çalışmaz. Erişim engellenirse veri üretmek yerine hata verir.
