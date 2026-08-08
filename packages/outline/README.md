# @calepin/outline

The plan: parts (dramatic objective, initial state, tipping point, final state)
and chapter outlines (sixteen attributes each), chapter-count calibration,
reordering, merging and splitting with stable ordering, narrative threads,
repercussion analysis and the dramatic-function audit.

Backlog: E10 — CAL-101 to CAL-111. Schemas: CAL-019, CAL-020.

## What is here today

`order/` — the ordering the plan rests on (CAL-019).

- `orderKeyBetween`, `orderKeysBetween` — a fractional index between two keys,
  so inserting a chapter writes one row instead of renumbering the rest.
- `orderKeyAt`, `moveOrderKey` — the same, addressed by position: insert at 3,
  drag 7 to 2. `moveOrderKey`'s `to` is the position the row ends up at.
- `resolveOutline` — the plan in reading order, with the chapter number derived
  from the keys. Nothing stores that number.
- `isOrderKey`, `compareOrderKeys`, `ORDER_KEY_ALPHABET` — the key's shape and
  its order, the same ones `parts_order_key_check` and `chapters_order_key_check`
  hold in the database.
