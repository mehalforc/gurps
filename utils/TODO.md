## ActiveEffectConfig

- Could we allow the user to redefine some of the standard "effects" such as maneuver or posture?

### Effects tab

- add translations for GURPS.exhausted, GURPS.posture, GURPS.reeling, GURPS.selfModifiers, GURPS.moveManeuver, GURPS.movePosture, GURPS.strength, GURPS.DR?
- If Attribute Key == Manuever, remove Change Mode dropdown (Custom is the default), set EffectValue as a dropdown of maneuvers
- If Attribute Key == self or target modifer, remove ChangeMode dropdown (Add is the default)
- Somehow allow both free form text and dropdown for Attribute Key (use pattern established for Split DR Damage Type)

## Split DR

- Allow multiple split DR definition
- Consider retooling split DR to be keyed by value, not by damage type. E.g., `3: [pi-, pi, pi+, pi++, imp]` would be DR 3 for impaling and all types of piercing damage. Ultimately this is simpler and more compact, I think.

## Hit Location

- Need to figure out display when there are many split DR types
- Add "Flexible Armor" checkbox
