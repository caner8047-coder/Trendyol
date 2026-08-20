# Trendyol En Çok Satanlar Veri Havuzu

Bu repo, Trendyol'daki farklı aramaların **En Çok Satan** sıralamasını günlük olarak izleyen bir veri havuzudur. Aktif profiller: `çocuk`, `erkek`, `ev-yasam`, `kadın`, `genel-cok-satanlar`, `supermarket`, `kozmetik`, `elektronik`, `mobilya`, `otomobil-motosiklet` ve `hamile`.

İlk aşamada her günlük çalışmada birden fazla sonuç sayfası birleştirilerek **200 benzersiz ürün** izlenir. 200 ürün eşiği sağlanmazsa kalite kapısı çalışmayı reddeder ve son geçerli rapor korunur. Yapı, sistem kararlılığı doğrulandıktan sonra ayar dosyasından yeniden 1.000 ürüne ölçeklenebilir.

İlk aşamada 200 ürünün tamamı her gün ayrıntılı olarak yenilenir. Sistem yeniden 1.000 ürüne çıkarıldığında ilk 200 günlük, kalan ürünler dönüşümlü ve hızlı değişen ürünler öncelikli olacak şekilde katmanlı strateji kullanılabilir.

Ana `çocuk` en çok satan akışı benzersiz ürün vermeyi bıraktığında havuz; oyuncak, giyim, ayakkabı, okul/çanta, oda, kitap ve bebek-çocuk alt alışveriş niyetleriyle tamamlanır. Ana arama her zaman ilk önceliktedir. Her satırda `source_segment`, `source_query`, `segment_position` ve `source_page` alanları bulunur; böylece sıralama kapsamı şeffaftır.

`erkek` profili aynı kalite ve veri şemasını kullanır; çıktıları `categories/erkek/` altında çocuk veri havuzundan tamamen ayrı tutulur. Çocuk görevi her gün 09:00'da, erkek görevi çakışmayı önlemek için 09:30'da çalışır.

`ev-yasam` profili, kullanıcı tarafından verilen çoklu `wc` kategori URL'sini ana kaynak olarak izler; birleşik sayfa tekrar ettiğinde yalnız aynı URL'deki kategori kimlikleri tek tek taranır. Halı, kilim, ev tekstili, dekorasyon, ev gereçleri, banyo, perde, sofra-mutfak ve mobilya gibi seçili kategorileri kapsar. Çıktıları `categories/ev-yasam/` altında tutulur ve görev her gün 10:00'da çalışır.

`kadın` profili kadın en çok satanlar aramasını; giyim, ayakkabı, çanta-aksesuar, iç giyim ve bakım alışveriş niyetleriyle tamamlar. Çıktıları `categories/kadin/` altında tutulur ve görev diğer profillerle çakışmaması için her gün 10:30'da çalışır.

`genel-cok-satanlar` profili Trendyol Çok Satanlar vitrininin 20 ana kategori sekmesinden dengeli örneklem alır; yinelenen ürünleri tekilleştirir ve gerektiğinde popüler ürünler segmentiyle 200 ürüne tamamlar. Çıktıları `categories/genel-cok-satanlar/` altında tutulur ve her gün 11:00'da çalışır.

`supermarket` profili kullanıcı tarafından verilen iki `wc` ve yedi `bu` filtresini ana kaynakta birlikte korur; gerektiğinde aynı filtreleri tek tek tarayarak 200 benzersiz ürüne tamamlar. Çıktıları `categories/supermarket/` altında tutulur ve her gün 11:30'da çalışır.

`kozmetik` profili kullanıcı tarafından verilen Kozmetik “En Çok Satan Ürünler” vitriniyle başlar; gerektiğinde yalnız `wc=89` kozmetik kapsamındaki alt alışveriş niyetleriyle 200 ürüne tamamlar. Çıktıları `categories/kozmetik/` altında tutulur ve her gün 12:00'da çalışır.

`elektronik` profili kullanıcı tarafından verilen Elektronik `BEST_SELLER` vitriniyle başlar; gerektiğinde yalnız `wc=104024` elektronik kapsamındaki alt alışveriş niyetleriyle 200 ürüne tamamlar. Çıktıları `categories/elektronik/` altında tutulur ve her gün 12:30'da çalışır.

`mobilya` profili kullanıcı tarafından verilen Mobilya Çok Satanlar vitriniyle başlar; gerektiğinde yalnız `wc=104489` mobilya kapsamındaki alt alışveriş niyetleriyle 200 ürüne tamamlar. Çıktıları `categories/mobilya/` altında tutulur ve her gün 13:00'da çalışır.

`otomobil-motosiklet` profili kullanıcı tarafından verilen Otomobil & Motosiklet Çok Satanlar vitriniyle başlar; gerektiğinde yalnız `wc=105777` kapsamındaki alt alışveriş niyetleriyle 200 ürüne tamamlar. Çıktıları `categories/otomobil-motosiklet/` altında tutulur ve her gün 13:30'da çalışır.

`hamile` profili kullanıcı tarafından verilen Hamile Çok Satanlar vitriniyle başlar; gerektiğinde yalnız `wc=104625` kapsamındaki hamile giyim alt alışveriş niyetleriyle 200 ürüne tamamlar. Çıktıları `categories/hamile/` altında tutulur ve her gün 14:00'da çalışır.

## Üretilen çıktılar

- `data/history.csv`: ürünlerin gün bazında uzun dönem geçmişi
- `snapshots/YYYY-MM-DD/`: günlük ham JSON ve CSV görüntüsü
- `lists/YYYY-MM-DD/`: yükselen, düşen, trend, niche, kampanya, fiyat ve stok listeleri; CSV ve ürün adları tıklanabilir Markdown sürümleri
- `reports/YYYY-MM-DD.md`: e-ticaret ve dijital pazarlama uzmanı bakışıyla günlük rapor
- `reports/latest.md`: son rapor
- `reports/telegram-latest.txt`: Telegram için kısa günlük yönetici özeti
- `quality/latest.json`: veri kapsamı ve kalite kapısı sonucu
- `categories/erkek/`: erkek profiline ait aynı `data`, `snapshots`, `lists`, `reports` ve `quality` yapısı
- `categories/ev-yasam/`: seçili Ev & Yaşam kategori bağlantısına ait bağımsız veri havuzu ve raporlar
- `categories/kadin/`: kadın en çok satanlar aramasına ait bağımsız veri havuzu ve raporlar
- `categories/genel-cok-satanlar/`: genel Çok Satanlar vitrininin dengeli kategori örneklemine ait bağımsız veri havuzu ve raporlar
- `categories/supermarket/`: seçili Süpermarket filtrelerine ait bağımsız veri havuzu ve raporlar
- `categories/kozmetik/`: Kozmetik En Çok Satan Ürünler filtresine ait bağımsız veri havuzu ve raporlar
- `categories/elektronik/`: Elektronik BEST_SELLER sıralamasına ait bağımsız veri havuzu ve raporlar
- `categories/mobilya/`: Mobilya Çok Satanlar sıralamasına ait bağımsız veri havuzu ve raporlar
- `categories/otomobil-motosiklet/`: Otomobil & Motosiklet Çok Satanlar sıralamasına ait bağımsız veri havuzu ve raporlar
- `categories/hamile/`: Hamile Çok Satanlar sıralamasına ait bağımsız veri havuzu ve raporlar

## İzlenen alanlar

Sıra, ürün/marka/kategori, ürün ve satıcı kimliği, satıcı adı/puanı, fiyat/eski fiyat/indirim, kampanyalar, stok durumu ve stok sinyali, son dönem satış sinyali, puan, değerlendirme/yorum/soru sayıları, teslimat ve kargo bilgileri, favori/sepet/görüntülenme sinyalleri, ürün özellikleri ve görsel bağlantısı.

Trendyol'un herkese açık sayfasında gösterilmeyen bir değer tahmin edilmez. Böyle alanlar boş bırakılır ve kalite raporunda kapsama oranına yansıtılır.

## Günlük çalışma

```bash
bash scripts/run_daily.sh
```

Toplayıcı düşük hacimli çalışır, sayfalar arasında bekler ve CAPTCHA/erişim engelini aşmaya çalışmaz. Erişim engellenirse veri üretmek yerine hata verir.

## Veri Mimarı yayın hattı

Başarılı günlük görüntüler `scripts/publish_website.cjs` ile Veri Mimarı Pazar Nabzı veri katmanına gönderilebilir. Yayıncı yalnız `PASS` kalite durumundaki ve en az 200 ürün içeren profilleri kabul eder. GitHub Action, aşağıdaki repository secrets tanımlanana kadar güvenli biçimde yayını atlar:

- `VERI_MIMARI_INGEST_URL`
- `VERI_MIMARI_INGEST_SECRET`

Web sitesi tarafı aynı sır ile isteği doğrular, veriyi idempotent biçimde kaydeder ve ilgili sayfa önbelleğini yeniler. GitHub deposu ham arşiv ve denetim kaynağı olarak kalır.

Günlük profil çalışmaları tek bir global kilitle sıralanır; aynı anda iki profil veya iki Git işlemi çalışamaz. Toplayıcı 30 saniyede bir heartbeat üretir ve her deneme 20 dakikalık kesin süre sınırıyla korunur. Süre aşılırsa tüm alt süreç grubu kapatılır; arkada yetim Chrome/Node süreci bırakılmaz. Hermes görevleri `no-agent` modunda çalışır: veri üretimi modele bağlı değildir ve Telegram'a yalnız doğrulanmış kısa rapor iletilir.
