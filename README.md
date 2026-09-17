# Melis'in İngilizce Kelime Kartları

Melis'in her hafta hocasından aldığı İngilizce kelimeleri haftalara göre
kaydedip, flashcard ile çalışıp, haftalık sınav gibi kendini test edebildiği
basit bir web uygulaması. Sunucu/veritabanı gerekmez; tüm veriler tarayıcıda
(cihazda) saklanır.

## Özellikler

- **Haftalar**: Her hafta için ayrı bir kelime listesi oluşturulur (hocanın
  verdiği kelimeler gibi).
- **Elle kelime ekleme**: İngilizce + Türkçe anlamını yazarak ekleme.
- **Fotoğraftan kelime ekleme**: Kelime listesinin fotoğrafı çekilir,
  tarayıcı içinde (Tesseract.js ile) metin taranır, bulunan kelimeler bir
  onay listesi olarak gösterilir; Melis hangilerini ekleyeceğini seçip
  gerekirse düzeltebilir.
- **Kartlar (Flashcard)**: Kelimeler kart olarak gösterilir, dokununca
  çevrilip anlamı görünür. "Biliyorum" / "Tekrar Edeyim" seçimine göre
  basit bir aralıklı tekrar (Leitner kutu) sistemiyle bir sonraki tekrar
  zamanı belirlenir.
- **Sınav**: Seçilen hafta (veya tüm haftalar) üzerinden çoktan seçmeli
  ya da yazarak cevaplama şeklinde sınav yapılır, sonuç ve yanlış
  kelimeler gösterilir, geçmiş sınavlar ana sayfada listelenir.
- **Yedekleme**: Üst çubuktaki ⬇️ ile tüm veriler JSON olarak indirilebilir,
  ⬆️ ile geri yüklenebilir. Veriler yalnızca kullanılan tarayıcıda tutulduğu
  için tarayıcı verileri temizlenirse veya cihaz değişirse yedek dosyası
  gerekir.

## Çalıştırma

Uygulama modül (`type="module"`) script kullandığından ve fotoğraf çekme
özelliği kamera erişimi gerektirdiğinden, dosyayı doğrudan çift tıklayarak
açmak yerine basit bir yerel sunucu ile açmak gerekir:

```bash
# Bu klasörün içinde:
python3 -m http.server 8080
# sonra tarayıcıda http://localhost:8080 adresini aç
```

veya Node varsa:

```bash
npx serve .
```

### Telefonda kullanmak (önerilen)

En rahat kullanım için projeyi **GitHub Pages** ile yayınlayıp linki
Melis'in telefonuna "Ana Ekrana Ekle" ile kısayol olarak eklemek iyi olur:

1. Bu depoyu GitHub'a gönder (push et).
2. Repo ayarlarından **Settings → Pages** kısmından `main` dalını yayınla.
3. Oluşan `https://kullanici-adi.github.io/repo-adi/` linkini telefonda aç.
4. Tarayıcı menüsünden "Ana ekrana ekle" seçilirse uygulama simgesi
   telefonun ana ekranına eklenir ve normal bir uygulama gibi açılır.

Kamera ile fotoğraf çekme özelliği güvenlik gereği yalnızca `https://` veya
`localhost` üzerinden çalışır; GitHub Pages bunu otomatik sağlar.

## Veri nerede saklanıyor?

Tüm haftalar, kelimeler ve sınav geçmişi tarayıcının `localStorage`'ında
tutulur. Hiçbir veri dışarıya gönderilmez (fotoğraf metne çevirme işlemi de
tamamen tarayıcı içinde, Tesseract.js ile yapılır). Bu nedenle düzenli
olarak ⬇️ butonuyla yedek almak, veri kaybını önlemek için önemlidir.

## Klasör yapısı

```
index.html        Uygulama kabuğu, sekmeler
css/styles.css     Görsel tasarım
js/app.js          Uygulama mantığı, ekranlar, olay yönetimi
js/storage.js      localStorage okuma/yazma, yedekle/geri yükle
js/leitner.js      Basit aralıklı tekrar (spaced repetition) mantığı
js/ocr.js          Fotoğraftan metin tanıma ve kelime ayrıştırma
js/id.js           Basit benzersiz id üretici
icons/, manifest.json   Ana ekrana eklenebilir uygulama simgesi/ayarları
```
