---
doc_type: guide
title: Understanding CTI Product Codes
source: CTI Price Masterlist
---

# Understanding CTI Product Codes

Every item in the masterlist has a unique product code. Understanding the code
structure makes it possible to locate an item, identify its category, and
recognise related variants.

## Code format

The general shape is:

```
PREFIX - GROUP - ITEM [ - VARIANT ]
   |       |       |        |
   |       |       |        +-- optional size, capacity or chemical type
   |       |       +----------- item number within the group
   |       +------------------- numeric sub-group
   +--------------------------- three-letter category prefix
```

Examples:

- `MED-001-01` — Medical department, group 001, item 01
- `FUR-002-87` — Furniture, chairs group, item 87
- `TRA-001-18-42L` — Trash bins, item 18, the 42-litre variant
- `FIR-002-10LBS-DC` — Fire extinguishers, 10 lbs, Dry Chemical
- `PPE-012-01-30` — Traffic cones, item 01, 30-inch variant

## The three-letter prefixes

| Prefix | Meaning |
|---|---|
| `BOD` | Body protection — harnesses, welding aprons |
| `EAR` | Hearing protection — earplugs, earmuffs |
| `FAC` | Face protection — face masks, welding masks |
| `FIR` | Fire safety and fire extinguishers |
| `FLA` | Flashlights and headlights |
| `FUR` | Furniture — tables, chairs, storage |
| `GOG` | Safety goggles |
| `HAR` | Hard hats |
| `HCS` | High cut safety shoes |
| `HEA` | Helmets |
| `JAN` | Janitorial and cleaning equipment |
| `LAN` | Fall-protection lanyards |
| `LCS` | Low cut safety shoes |
| `LIF` | Life saving, water rescue, first aid kits |
| `MAC` | Vending and coffee machines |
| `MED` | Medical and clinic equipment |
| `MEG` | Megaphones |
| `ORD` | Assorted / ordinary safety footwear |
| `PLT` | Portable toilets |
| `PPE` | Gloves, cones, barriers, work boots |
| `RAI` | Rainwear |
| `SAF` | Safety vests and safety shoes |
| `SPO` | Sports and martial arts equipment |
| `TND` | Barangay tanod equipment |
| `TRA` | Trash bins and waste containers |
| `WHI` | Whistles and signaling devices |

## Letter suffixes mean variants

A trailing letter on the item number marks a variant of the same base product,
usually size:

- `LIF-001-01A` — Life ring (small)
- `LIF-001-01B` — Life ring (big)
- `FIR-001-11A` through `FIR-001-11E` — Fire blankets from 1.0×1.0 m to 1.8×1.8 m

When a customer names a product without specifying size, check whether lettered
variants exist and confirm which one they need before quoting.

## Sub-groups worth knowing

The `PPE` prefix is broad and splits into meaningfully different sub-groups:

- `PPE-005` — gloves
- `PPE-012` — traffic cones
- `PPE-014` — chains, barriers, caution tape
- `PPE-018` — work boots

Similarly `SAF-001` is safety vests while `SAF-002` is safety shoes, and
`FIR-001` is general fire equipment while `FIR-002` is extinguishers
specifically.

## Searching by code

Codes may be written with hyphens (`MED-001-01`), without (`MED00101`), or with
spaces (`MED 001 01`). All three refer to the same item.
