# Spec Delta — ui/input-mapping

## ADDED Requirements

### Requirement: Movement and attack controls are visibly distinguished

The input layer SHALL render the directional movement controls and the directional attack controls with visible labels that state each group's purpose, so the attack controls are distinguishable from the movement controls without relying on a screen reader or on subtle styling alone. Each group SHALL carry a visible caption (for example "Move" and "Attack"), and the attack group SHALL remain visually distinct from the movement group beyond the caption alone.

#### Scenario: The attack control group is labeled

- **WHEN** the directional controls are rendered
- **THEN** the attack group carries a visible caption identifying it as the attack controls and the movement group carries a visible caption identifying it as the movement controls

#### Scenario: The two groups are visually distinct

- **WHEN** the directional controls are rendered
- **THEN** the attack group is visually distinguishable from the movement group by more than the glyphs alone

#### Scenario: Labeling does not change dispatch

- **WHEN** a labeled movement or attack control is pressed
- **THEN** the same move or attack command is dispatched as before, with no additional component state introduced
