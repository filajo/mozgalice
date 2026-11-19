# Mozgalice

Igre za vježbanje mozga, bez reklama. Web aplikacija (PWA) koja se s preglednika doda na početni zaslon mobitela (Android i iPhone) i radi i bez interneta.

## Igre
- **Sudoku**: 4 razine (Lako, Srednje, Teško, Stručnjak), dnevni izazov (ista zagonetka za sve igrače), bilješke, poništi, pomoć, ljestvica.

Rezultat = vrijeme + 30 s po grešci + 60 s po pomoći. Manje je bolje.

## Struktura
```
index.html            početni zaslon s popisom igara
manifest.webmanifest  podaci za instalaciju na mobitel
sw.js                 offline predmemorija (povećaj VERSION nakon svake promjene)
css/common.css        zajednički stil
js/scores.js          zajednička ljestvica za sve igre
js/config.js          postavke zajedničke baze (Supabase)
games/sudoku/         sudoku
icons/                ikone
```
Nova igra: nova mapa u `games/`, kartica u `index.html`, datoteke u popis u `sw.js`, rezultati preko `Scores.submit({ game: 'ime-igre', ... })`.

## Zajednička ljestvica (Supabase, besplatno)
1. Napravi projekt na supabase.com.
2. U SQL Editoru pokreni:
```sql
create table scores (
  id bigint generated always as identity primary key,
  game text not null, mode text not null, level text not null, day date not null,
  player text not null, seconds int not null, mistakes int not null, hints int not null,
  score int not null, at timestamptz not null default now()
);
alter table scores enable row level security;
create policy "read" on scores for select to anon using (true);
create policy "insert" on scores for insert to anon with check (true);
```
3. Upiši Project URL i Publishable key (`sb_publishable_...`) u `js/config.js`. Secret key nikad ne ide u aplikaciju.

## Lokalno pokretanje
`python3 -m http.server` u ovoj mapi, pa otvori http://localhost:8000
