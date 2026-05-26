# Slachthuis Monitor

## Project Overview

A web app that visualises violations at Dutch slaughterhouses on an interactive map. The source data is a document containing ~130 violations across various slaughterhouses in the Netherlands.

## Core Feature

- Interactive map of the Netherlands showing a pin/marker for each slaughterhouse mentioned in the violations document
- Clicking a marker shows details: the violation description, the fine amount, and any other relevant metadata from the source document

## Data

The source document is an NVWA WOO-besluit covering 112 inspection cases at Dutch red-meat slaughterhouses (2017–2023). The cleaned dataset lives at `data/boetes.json` (112 records). The original PDF and OCR'd text live at `/home/matthijs/data/slachthuis_monitor/`.

### `data/boetes.json` schema

Each record has these fields:

| Field | Type | Description |
|---|---|---|
| `nr` | int | Case number (1–112) |
| `rapport_nr` | str \| null | NVWA report kenmerk |
| `datum` | str | Date of the inspection finding (Dutch format, e.g. `"3 juni 2021"`) |
| `slachthuis.naam` | str | Slaughterhouse legal name |
| `slachthuis.adres` | str \| null | Street address |
| `slachthuis.postcode_plaats` | str \| null | Postcode + city |
| `overtreding` | str | Verbatim Dutch quote from the Bevinding section describing the violation |
| `boetebedrag` | str \| null | Fine in Dutch format, e.g. `"5.000,00"`. Null if no boetebeschikking is in source for this case. |
| `reactie` | str \| null | Verbatim quote of the slaughterhouse's response (zienswijze). Null if none was submitted. |
| `samenvatting` | str | One-sentence Dutch summary of the violation |
| `ernst` | int (1–4) | Welfare-severity tier (see below) |
| `ernst_tags` | list[str] | Zero or more tags from the closed vocabulary below |

### Severity tiers (`ernst`)

The tier is welfare-focused and **deliberately independent of `boetebedrag`** — the fine reflects the regulator's legal view, the tier reflects the welfare impact on the animal.

| `ernst` | naam | criteria |
|---|---|---|
| 1 | laag | Administratief, hygiëne zonder dier-impact, kleine welzijnstekorten zonder lijden |
| 2 | midden | Welzijn aangetast (overbezetting, vies/nat strooisel, ontbrekend drinkwater, slechte transportomstandigheden) — geen direct lijden tijdens de slacht |
| 3 | hoog | Onnodig pijn/stress tijdens de slacht: te late nabedwelming, fixatiefout met loskomende dieren, herhaalde bedwelmingsfouten, overmatig gebruik elektrische prikker |
| 4 | zeer hoog | Dier was bewust/levend tijdens halssnede of uitslachten; OF actief geweld (slaan, schoppen, slepen aan ketens); OF meermalen mislukte bedwelming met aanhoudend lijden |

### Closed `ernst_tags` vocabulary

`bewust_geslacht` · `bedwelming_mislukt` · `nabedwelming_te_laat` · `actief_geweld` · `fixatie_fout` · `prikker_overmatig` · `ritueel_slacht_fout` · `overbezetting` · `huisvesting` · `hygiene` · `transport` · `administratief`

Geocoding of `slachthuis.adres` + `slachthuis.postcode_plaats` will be needed to place pins on the map.

## Stack (TBD)

To be determined during design phase.
