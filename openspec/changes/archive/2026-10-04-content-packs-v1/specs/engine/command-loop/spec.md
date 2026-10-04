# Spec Delta

## ADDED Requirements

### Requirement: Command and event unions are extensible

The engine SHALL represent commands and events as discriminated unions that can be extended with new action types without altering the existing command-in/event-out contract, and unknown command types SHALL continue to degrade to a no-op rather than throwing.

#### Scenario: New command type follows the existing contract

- **WHEN** a newly added command type (such as use-item) is applied
- **THEN** it returns new state and at least one event under the same contract as existing commands, and the input state is unchanged

#### Scenario: Unrecognized command type still degrades gracefully

- **WHEN** a command of an unrecognized type is applied after the union is extended
- **THEN** the engine emits a no-op event and returns state equivalent to the input, without throwing

#### Scenario: New event type is plain and loggable

- **WHEN** a new event type is emitted
- **THEN** it is plain serializable data appended to the event log in order like every other event
