# Spilscore: design

**Dato:** 2026-10-09
**Status:** Til review

## 1. Formål

En PWA til iPhone, der tæller point under kort- og terningspil og gemmer hvert spil, så der kan laves statistik bagefter, både i appen og i Excel/Power BI.

**Succeskriterier**
- Indtastning under spillet er hurtig med én hånd og virker uden net.
- Ingen data går tabt, heller ikke hvis iOS rydder appens lokale lager.
- Rå data kan hentes direkte i Power BI uden manuel eksport.
- Starter som privat app for én telefon, men datamodel og adgangsstyring tillader flere brugere senere uden ombygning.

**Spil ved lancering:** Yatzy (5 eller 6 terninger), 500 (rummy-varianten), Flip 7, Davoserjas, Hitster, plus egne "kun resultat"-spil, som oprettes i appen.

## 2. Arkitektur

```
iPhone (PWA på hjemmeskærmen)
 ├─ UI: Preact + TypeScript
 ├─ Spillogik: rene funktioner (regler, vinder, sum-tjek, gyldige værdier)
 ├─ Lokal database: IndexedDB via Dexie (sandheden på enheden)
 └─ Sync-kø → Supabase
          │
          ▼
Supabase (Postgres + Auth)  ◄── Power BI / Excel via PostgreSQL-connector
          ▲
GitHub Actions: ugentligt keep-alive-ping
```

| Del | Valg | Begrundelse |
|---|---|---|
| Build | Vite + TypeScript | Hurtig, statisk output til GitHub Pages |
| UI | Preact | React-model, ~4 KB; overskuelig tilstand på tværs af skærme |
| PWA | vite-plugin-pwa (Workbox) | Manifest, service worker, offline-cache |
| Lokal DB | Dexie | Robust IndexedDB-wrapper med transaktioner |
| Sky | supabase-js | Auth, Postgres, Row Level Security |
| Test | Vitest | Enhedstest af spillogik og sync |
| Hosting | GitHub Pages (`Flamse09`) via GitHub Actions | Gratis, automatisk deploy ved push til `main` |

**Placering:** `D:\My Drive\Private\Spilscore\`, eget git-repo, remote `github.com/Flamse09/Spilscore`.

### Moduler

| Modul | Ansvar | Afhænger af |
|---|---|---|
| `src/games/` | Spildefinitioner og regler: gyldige værdier, sum-tjek, slutbetingelse, placering | Intet (ren logik) |
| `src/db/` | Dexie-skema, repository-funktioner (opret/ret/blødt slet) | `games` (typer) |
| `src/sync/` | Kø, push/pull mod Supabase, konfliktløsning | `db`, supabase-js |
| `src/stats/` | Statistikberegninger på lokale data | `db` |
| `src/ui/` | Skærme og komponenter | Alle ovenstående |

`games` og `stats` har ingen afhængighed af UI eller netværk og testes isoleret.

## 3. Datamodel

Samme tabeller lokalt (Dexie) og i Supabase (Postgres).

**Fælles kolonner på alle tabeller**
- `id uuid`: genereres på enheden (`crypto.randomUUID()`), så en sync aldrig laver dubletter.
- `owner_id uuid`: Supabase auth-bruger.
- `created_at`, `updated_at timestamptz`.
- `deleted_at timestamptz null`: blød sletning, så intet forsvinder under sync.

**Tabeller**

| Tabel | Kolonner (ud over fælles) |
|---|---|
| `players` | `name text`, `archived bool` |
| `games` | `key text` (unik, f.eks. `yatzy`), `name text`, `type text` (`open_rounds` \| `fixed_rounds` \| `scoresheet` \| `result_only`), `config jsonb`, `built_in bool` |
| `sessions` | `game_id`, `options jsonb` (f.eks. `{"dice":6}`), `started_at`, `ended_at null`, `status text` (`in_progress` \| `finished` \| `abandoned`), `note text null` |
| `session_teams` | `session_id`, `name text`, `seat int` |
| `session_players` | `session_id`, `player_id`, `team_id null`, `seat int`, `final_score numeric null`, `placement int null`, `is_winner bool null` |
| `score_entries` | `session_id`, `player_id null`, `team_id null`, `round_no int null`, `category text null`, `points numeric` |

**Regler**
- En `score_entries`-række har enten `player_id` eller `team_id`.
- Når et spil afsluttes, skrives `final_score`, `placement` og `is_winner` til `session_players`. Ved holdspil får hver person på holdet holdets værdier.
- Ved uafgjort deler spillerne placeringen, og alle med placering 1 har `is_winner = true`.
- Rettelser i et afsluttet spil genberegner felterne i `session_players`.
- Afbrudte spil (`abandoned`) indgår ikke i statistik.

**Power BI-view `v_results`:** én række pr. spiller pr. afsluttet session: `session_id`, `game_name`, `started_at`, `ended_at`, `player_name`, `team_name`, `final_score`, `placement`, `is_winner`, `player_count`. Slettede rækker er filtreret fra.

**Row Level Security:** alle tabeller har en policy `owner_id = auth.uid()` for select, insert og update. Delte spil kræver senere en udvidelse af policies, men ikke af tabellerne.

**Bevidst udeladt:** lokationer, Elo/rating, billeder.

## 4. Spildefinitioner

### Fælles config-felter

```ts
type GameConfig = {
  scoring: 'high' | 'low';          // højest eller lavest vinder
  minPlayers: number;
  maxPlayers?: number;
  teams: 'none' | 'optional' | 'required';
  allowNegative?: boolean;
  target?: number;                  // open_rounds: slut efter runden hvor nogen når target
  rounds?: RoundDef[];              // fixed_rounds
  sheet?: 'yatzy';                  // scoresheet: navngiven generator
  trackScore?: boolean;             // result_only: indtast valgfri point
  options?: OptionDef[];            // f.eks. antal terninger
};
type RoundDef = { key: string; label: string; rule: string; check?: CheckKind };
```

### Yatzy (`scoresheet`, høj vinder, 1+ spillere, option `dice: 5 | 6`)

| 5 terninger | 6 terninger (Maxi Yatzy) |
|---|---|
| 1'ere–6'ere | 1'ere–6'ere |
| Bonus 50 ved ≥ 63 i øverste del | Bonus 50 ved ≥ 84 i øverste del |
| 1 par, 2 par | 1 par, 2 par, 3 par |
| 3 ens, 4 ens | 3 ens, 4 ens, 5 ens |
| Lille straight (15), stor straight (20) | Lille straight (15), stor straight (20), royal straight (21) |
| Fuldt hus | Hus (3+2), villa (3+3), tårn (4+2) |
| Chance | Chance |
| Yatzy (50) | Maxi Yatzy (100) |

- Felternes navne og værdier ligger i opsætningen og kan justeres til jeres pointark.
- **Gyldige værdier** pr. felt beregnes ved at gennemgå alle terningkombinationer (6⁵ = 7.776 for 5 terninger, 6⁶ = 46.656 for 6 terninger) og samle de mulige scores. 0 (streg) er altid gyldig. Resultatet beregnes én gang og caches.
- Bonus og summer beregnes automatisk og indtastes aldrig.
- Spillet slutter, når alle felter for alle spillere er udfyldt.

### 500 (`open_rounds`, høj vinder, 2+ spillere)
- `target: 500`, `allowNegative: true`.
- Slutter efter den runde, hvor mindst én spiller har ≥ 500. Højeste total vinder.

### Flip 7 (`open_rounds`, høj vinder, 3+ spillere)
- `target: 200`. Hurtigknap "Bust" sætter 0. Der indtastes rundens samlede point inklusive Flip 7-bonus.
- Slutter efter den runde, hvor mindst én spiller har ≥ 200. Højeste total vinder.

### Davoserjas (`fixed_rounds`, lav vinder, 3–7 spillere)

Alle kort gives. Hver spiller får `k = floor(52 / N)` kort, og `r = 52 mod N` kort lægges væk.

| # | Runde | Regel | Sum-tjek |
|---|---|---|---|
| 1 | Stik | 1 point pr. stik | Præcis `k` |
| 2 | Klør | 1 point pr. klør | `13 − r` til `13` |
| 3 | Damer | 5 point pr. dame | Multiplum af 5 fra `20 − 5·min(r,4)` til `20` |
| 4 | Klør konge | 15 point | `15`, eller `0`/`15` hvis `r > 0` |
| 5 | Første og sidste stik | 10 point hver | Præcis `20` |
| 6 | Alle regler | Runde 1–5 gælder på én gang | Alle mulige summer af runde 1–5 (præcis 81 ved 4 spillere) |
| 7 | Kabalen | 1 point pr. kort tilbage på hånden | Ingen |

- Sum-tjek er en blød advarsel ("Summen er 12, forventet 13. Gem alligevel?") og blokerer aldrig.
- Når `r = 0` (4 spillere), er alle tjek præcise.
- Spillet slutter efter runde 7. Laveste total vinder.

### Hitster (`result_only`, `teams: 'optional'`, `trackScore: true`)
- Vælg hold og spillere og markér placeringer. Valgfrit: antal kort pr. hold.

### Egne spil
- Oprettes i Indstillinger som `result_only`. Brugeren vælger navn, hold (ingen/valgfri/påkrævet), om der indtastes point, og om høj eller lav score vinder.

### Fælles under spillet
- Fortryd sidste indtastning.
- Ret en tidligere runde eller et tidligere felt.
- Afbryd spillet (status `abandoned`).
- Note på sessionen.

## 5. Skærme

1. **Hjem**
   - Kort med "Fortsæt [spil]", hvis der er en session med status `in_progress`.
   - Knap til "Nyt spil".
   - De 10 seneste sessioner.
   - Sync-status i headeren: ✓ synkroniseret / ⟳ N venter / offline.
2. **Nyt spil**
   - Vælg spil.
   - Vælg spillere. Spillerne vises som knapper, nye kan oprettes direkte, og rækkefølgen er pladsen ved bordet.
   - Hold, hvis spillet har hold.
   - Indstillinger, f.eks. antal terninger.
   - Start.
3. **Spil**
   - *Runder*:
     - Tabel med spillere som kolonner og runder som rækker, med en fast række med totaler øverst.
     - "Ny runde" åbner indtastningen: et stort tal-felt pr. spiller og en ±-knap, "Bust" i Flip 7, rundens regel og sum-tjek i Davoserjas.
   - *Pointark*: Yatzy-ark. Tryk på et felt og vælg blandt de gyldige værdier.
   - *Kun resultat*: vælg vinder eller ordn placeringerne, plus valgfri point.
   - *Slut*: oversigt med vinder og slutstilling og knappen "Afslut".
4. **Historik**
   - Liste, som kan filtreres på spil og spiller.
   - Tryk på en session for at se den, rette i den eller slette den.
5. **Statistik**
   - Pr. spil: antal spil, sejrsprocent pr. spiller, gennemsnitlig slutscore, bedste og værste score, højeste rundescore.
   - Pr. spiller: antal spil, sejre, favoritspil, længste sejrsstime, og indbyrdes opgør mod hver af de andre (sejre i spil, hvor begge deltog).
   - Sejrsprocent = sejre ÷ afsluttede spil, man har deltaget i. Delt sejr tæller som sejr.
6. **Indstillinger**
   - Login og sync-status.
   - Spillere: omdøb og arkivér.
   - Egne spil.
   - Eksport til CSV (`v_results`-format plus rå `score_entries`).

**Design**
- Mørk og lys tilstand følger telefonen.
- Touch-mål på mindst 44 px, så alt kan betjenes med én tommelfinger.
- Skærmen holdes tændt under et spil med Screen Wake Lock API, hvis det er understøttet. Ellers sker der ingenting.

## 6. Sync

- Hver skrivning sker i én Dexie-transaktion: rækken opdateres, og dens id lægges i tabellen `outbox` (tabelnavn + id).
- **Push** kører ved app-start, ved `online`-hændelsen, efter hver skrivning (debounced 2 sek.) og hvert 60. sekund, mens appen er åben. Den sender en `upsert` pr. tabel i rækkefølgen players → games → sessions → session_teams → session_players → score_entries og fjerner kun posten fra outbox, hvis kaldet lykkedes.
- **Pull** henter rækker med `updated_at` efter sidste pull-tidspunkt. Det bruges til at gendanne data på en ny enhed eller efter, at iOS har ryddet lageret.
- **Konflikter:** nyeste `updated_at` vinder.
- **Fejl:** rækker bliver i outbox og forsøges igen med eksponentiel backoff (maks. 5 min). Status vises i headeren. Data på enheden slettes aldrig af en fejlet sync.
- **Login:** Supabase e-mail og adgangskode, uden bekræftelsesmail ("Confirm email" er slået fra). Der sendes ingen mails. Magic link er fravalgt, fordi linket på iOS åbner i Safari og ikke i den installerede PWA. Kode på mail er fravalgt (ændret 2026-10-09), fordi Supabase kun lader skabelonerne redigere med egen SMTP, og standardmailen indeholder kun et link. iOS-nøgleringen kan gemme adgangskoden. Sessionen fornyes automatisk. Appen virker fuldt ud uden login, og sync starter, når man er logget ind.
- **Keep-alive:** et GitHub Actions-cronjob kører hver mandag og torsdag og laver en let `select` mod Supabase, så gratisprojektet ikke går i dvale.

## 7. Fejlhåndtering

- Validering under indtastning er advarsler, ikke blokeringer. Undtagelse: Yatzy-felter tillader kun gyldige værdier.
- Fejler skrivningen til IndexedDB, vises en tydelig fejl, og indtastningen bliver stående i formularen.
- En ny service worker bliver aktiveret ved næste app-start og aldrig midt i et spil.

## 8. Test

- **Vitest, spillogik:**
  - Gyldige Yatzy-værdier for 5 og 6 terninger (stikprøver, f.eks. at 4'ere ∈ {0,4,…,20} og fuldt hus aldrig er 6).
  - Bonusgrænser.
  - Slutbetingelser for 500 og Flip 7.
  - Davoserjas-intervaller for N = 3–7.
  - Placering og delte sejre.
- **Vitest, statistik:** sejrsprocent, sejrsstime og indbyrdes opgør på kendte testdata.
- **Vitest, sync:** outbox-rækkefølge, retry og at nyeste vinder, med en fake Supabase-klient.
- **Manuelt:** gennemspil hvert spil i iPhone-størrelse i browseren og derefter på telefonen efter installation på hjemmeskærmen, inklusive flytilstand midt i et spil.

## 9. Opsætning

**Gjort (2026-10-09)**
- Supabase-projekt `qskvbsjjqmpdtwlefxjx` (`https://qskvbsjjqmpdtwlefxjx.supabase.co`). Email-login er slået til.
- GitHub-repo `github.com/Flamse09/Spilscore`, **offentligt**, så GitHub Pages er gratis.

**Konfiguration**
- URL og publishable key (`sb_publishable_…`) ligger i `.env` som `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` og committes. Begge ender alligevel i den byggede JS på telefonen, og beskyttelsen ligger i RLS. Secret-nøgle og database-password må aldrig i repoet.
- Repoet er offentligt, så kode og spec er synlige. Data er det ikke.

**Mangler (kræver Frederik)**
- Kør SQL-migreringen i Supabase SQL Editor. Filen leveres i repoet.
- Supabase → Authentication → Sign In / Providers → Email: slå "Confirm email" fra. Der kræves ingen SMTP og ingen ændring af mailskabeloner.
- Opret kontoen i appen under Indstillinger med "Opret konto".
- Bagefter: slå "Allow new users to sign up" fra, så ingen andre kan oprette sig. Dette trin er påkrævet.
- Når første workflow er pushet: GitHub → Settings → Pages → Source = "GitHub Actions".
- Power BI: PostgreSQL-connector mod Supabases connection pooler med en read-only databasebruger, som oprettes via SQL i opsætningen.

## 10. Uden for scope (v1)

- Flere brugere og delte spil (datamodel og RLS er forberedt).
- Lokationer, rating, billeder.
- Meldinger og stikregistrering i 500/Davoserjas ud over point.
- Native app / App Store.
