# Muse Player

Wklej link do serialu na my-muse.ai. Player odczyta faktyczną listę odcinków z danych strony i połączy każdy M3U8 z właściwym VTT. Nie zgaduje nazw ani liczby odcinków. Filmy są odtwarzane bezpośrednio z CDN, bez pobierania na serwer.

## Najprościej online: Netlify

**GitHub Pages nie wystarczy**: nie uruchamia backendu, a my-muse nie pozwala przeglądarce odczytać HTML z obcej domeny przez CORS. Ten projekt zawiera frontend i Netlify Function, więc oba uruchamiają się z jednego repo.

1. Otwórz [Netlify — nowy projekt z repo](https://app.netlify.com/start).
2. Wybierz GitHub i repo **damian2603/nowetestyfilm**, gałąź **main**.
3. Netlify odczyta `netlify.toml`: komenda `npm run check && npm test`, katalog publikacji `public`, funkcje `netlify/functions`. Nie wybieraj Next.js i nie ustawiaj `.next`.
4. Kliknij Deploy. Otwórz otrzymany adres HTTPS na komputerze albo telefonie.
5. Wklej link i kliknij **Wczytaj serial**. Możesz też użyć przycisku z przykładem.

Nie trzeba API key, tokenu GitHuba w przeglądarce ani dodatkowej usługi proxy. Samo przesłanie folderu `public` metodą drag-and-drop nie wdraża backendu; połącz pełne repo.

## Windows — od razu lokalnie

Zainstaluj [Node.js 22 lub nowszy](https://nodejs.org/), pobierz repo przez **Code → Download ZIP**, rozpakuj i uruchom `start.bat`. Wejdź na **http://localhost:3000**. Nie potrzeba `npm install`.

Na telefonie w tej samej sieci Wi-Fi otwórz `http://IP-KOMPUTERA:3000` (adres komputera sprawdzisz przez `ipconfig`). Windows może poprosić o zezwolenie na dostęp Node.js w sieci prywatnej. Nie udostępniaj portu przez router. Dla wygodnego oglądania poza domem użyj hostingu HTTPS.

## Funkcje

- Dynamiczny tytuł i lista odcinków; polskie napisy wybierane domyślnie, gdy są dostępne.
- Safari/iOS: natywne HLS i napisy `<track>`; Chrome/Firefox: HLS.js 1.7.3 z CDN.
- Wybór języka, wyłączanie napisów, korekta opóźnienia −60…+60 s (dodatnia wartość wyświetla napis później).
- Poprzedni/następny odcinek i automatyczne przejście po zakończeniu.
- Pamięć playlisty, ostatniego odcinka każdego serialu, języka i opóźnienia w tej przeglądarce.
- Eksport M3U i JSON; bezpośrednie linki do M3U8 oraz aktualnego VTT.
- Link `/?url=ZAKODOWANY_LINK_MY_MUSE` może automatycznie wczytać serial.

## Ograniczenia

Import odczytuje publiczne dane strony; nie loguje się do konta, nie odblokowuje odcinków i nie omija zabezpieczeń. Sam adres w metadanych nie gwarantuje uprawnień do odtworzenia filmu. Jeśli strona nie udostępnia adresów, zwróci blokadę albo zmieni format danych, importer pokaże błąd. Zmiana formatu może wymagać aktualizacji `lib/muse.mjs`.

Napisy przy każdym odcinku są automatycznie przypinane w **tym playerze**. Eksport M3U używa dodatkowego tagu VLC `#EXTVLCOPT:sub-file=`; obsługa zewnętrznych napisów z M3U zależy od aplikacji, a iOS/PotPlayer mogą ten tag ignorować. Eksport M3U nie jest master manifestem HLS z napisami. Opóźnienie z interfejsu dotyczy odtwarzacza na stronie, nie eksportowanych plików VTT. Automatyczne rozpoczęcie kolejnego odcinka może wymagać kliknięcia Play, zależnie od polityki przeglądarki.

CDN musi pozwalać na odtwarzanie HLS i odczyt VTT z domeny hostingu. Serwer nie przekazuje filmów ani napisów przez proxy. HLS.js wymaga dostępu do cdn.jsdelivr.net. iOS wymaga sprawdzenia na fizycznym urządzeniu, szczególnie w trybie pełnoekranowym.

## Sprawdzenie projektu

```sh
npm run check
npm test
npm start
```

API: `GET /api/series?url=...`. Dopuszcza tylko HTTPS na dokładnej domenie `my-muse.ai` i ścieżki filmów z UUID. Przekierowania są walidowane; pobieranie ma limit 22 s i 4 MB. Parser używa JSON i nigdy nie wykonuje skryptów źródłowej strony. Wyniki są przechowywane w pamięci procesu maksymalnie 3 minuty. Biblioteka backendu jest wspólna dla serwera lokalnego i Netlify.
