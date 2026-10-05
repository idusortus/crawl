# Spec Delta — ui/app-shell

## MODIFIED Requirements

### Requirement: The client saves and resumes a run

The client SHALL be able to save the current run as its full JSON state plus its full command log and `appliedCount` cursor, and to resume a saved run by deserializing that state and replaying only the remaining commands (the log tail past `appliedCount`) from there, so a session can be interrupted and continued. The save SHALL be persisted to device storage so it survives an application restart, rather than living only in memory for the life of the process. Persistence SHALL go through the engine's serialization/replay surface; the client SHALL NOT implement engine behavior of its own.

#### Scenario: Saving captures the run

- **WHEN** the user saves the current run
- **THEN** the client persists the run's full JSON state, full command log, and `appliedCount` cursor through the client-side save path

#### Scenario: Resuming restores the run

- **WHEN** the user resumes a saved run
- **THEN** the client rebuilds the run (by deserializing the saved state and replaying the remaining commands past `appliedCount`) and presents the resumed state

#### Scenario: Saving never leaves the engine boundary

- **WHEN** the client saves or resumes
- **THEN** all state serialization/replay goes through the `@engine` public surface and the client does not implement engine behavior of its own

#### Scenario: A save survives an application restart

- **WHEN** the user saves a run, closes the application, and launches it again
- **THEN** the saved run is still available to resume

### Requirement: Auto-save preserves the run without user action

The client SHALL auto-save the run so that an interruption does not silently lose progress, without mutating the live game state during the save. The auto-saved run SHALL be written to device storage so it survives an application restart.

#### Scenario: Progress is auto-saved

- **WHEN** the run advances
- **THEN** the client persists the run through its save path without requiring an explicit save press

#### Scenario: Auto-save does not disturb play

- **WHEN** an auto-save occurs
- **THEN** the live game state is unchanged and continues to accept commands identically

#### Scenario: Auto-save survives an application restart

- **WHEN** a run has advanced and the application is relaunched
- **THEN** the auto-saved run is available to resume

## ADDED Requirements

### Requirement: A stored save is adopted on startup without blocking first paint

On startup the client SHALL load any previously stored save and make it available to resume, without blocking the first render of the game screen. The client SHALL present the ordinary fresh run and then, if a stored save exists, make the resume affordance available; the client SHALL NOT silently replace the live run with the stored save. The client SHALL evaluate `hasSave` as `saveStore !== undefined` **after hydration settles**, and SHALL prevent a save or auto-save that occurs before hydration settles from overwriting the stored save (a hydration barrier), and SHALL NOT let hydration overwrite a slot already written earlier in the session.

#### Scenario: Startup is not blocked by loading a save

- **WHEN** the application starts
- **THEN** the game screen renders without waiting for the stored save to load

#### Scenario: A stored save becomes resumable

- **WHEN** a stored save exists and the application has started
- **THEN** the resume affordance is available and resuming presents the stored run

#### Scenario: A stored save does not silently replace the live run

- **WHEN** the application starts and a stored save exists
- **THEN** the client continues to present the fresh run until the user explicitly resumes the stored save

#### Scenario: A pre-hydration write cannot clobber the stored save

- **WHEN** the user acts (triggering a save or auto-save) before hydration has settled
- **THEN** the save/auto-save is a no-op and the stored save is not overwritten, and hydration does not overwrite a slot written earlier in the session

### Requirement: Save feedback and storage errors are surfaced

The client SHALL make the outcome of a save observable to the user: a successful save SHALL produce a visible, transient indication, and a storage failure SHALL be surfaced to the user rather than swallowed. A storage or hydration failure SHALL be surfaced through a separate, non-fatal `saveError` channel (for example an inline note on the `ActionBar`) and SHALL NOT be routed to the fatal pack-load error that replaces the game screen.

#### Scenario: A successful save is acknowledged

- **WHEN** the user saves the current run and the write succeeds
- **THEN** the client shows a visible indication that the run was saved, which clears on its own

#### Scenario: A save control always produces feedback

- **WHEN** the user presses the save control
- **THEN** the client shows a visible save outcome (a saved indication or a surfaced error) whether or not an auto-saved run already exists

#### Scenario: A storage failure is surfaced without hiding the game

- **WHEN** reading or writing the stored save fails
- **THEN** the client surfaces the failure through the non-fatal `saveError` channel (e.g. an `ActionBar` inline note) while continuing to render and play the current run, rather than routing the failure to the fatal pack-load error

### Requirement: The save and resume controls keep a synchronous interface

The client's public save and resume controls SHALL remain synchronous `() => void` handlers, with any asynchronous storage work performed internally, so dependent UI (keyboard handlers, the action bar, and provider types) does not drift to promise-returning handlers.

#### Scenario: Pressing save or resume returns immediately

- **WHEN** the save or resume control is invoked
- **THEN** the handler returns without awaiting a promise (storage I/O happens internally) and the surrounding UI type signature is unchanged

### Requirement: Persistence introduces no ambient nondeterminism

The client's persistence layer SHALL NOT introduce ambient randomness or wall-clock time, so a resumed run is identical to the uninterrupted run.

#### Scenario: A resumed run equals an uninterrupted run

- **WHEN** a run is interrupted (through save) and resumed
- **THEN** continued play matches the same run played without interruption

#### Scenario: No ambient randomness or time in persistence

- **WHEN** the persistence path is inspected
- **THEN** it uses neither a random-number source nor wall-clock time to decide stored content
