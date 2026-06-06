# Known Problems & Mitigations

## Adversarial / Accidental Workspace Switching

### Background

The `Workspace` class uses an `async-mutex` on `switchWorkspace()` to prevent
concurrent workspace switches (two `switch_workspace` calls running in parallel
cannot interleave). However, this mutex does **not** serialize `switchWorkspace`
against normal filesystem tool calls (read, write, search, etc.).

### The Problem

If an agent calls `switch_workspace` at the same time as another filesystem
tool, two things can go wrong:

1. **Race on currentPath** — the other tool may resolve its paths before the
   switch completes, or after, leading to inconsistent behaviour depending on
   timing.
2. **Reader sees wrong workspace** — a tool that started before the switch
   will silently operate on the old workspace for its entire duration.

This could happen intentionally (an adversarial agent trying to bypass access
controls) or accidentally (a poorly orchestrated agent making parallel tool
calls).

### Current Mitigations

- **Agent-level contract**: the `switch_workspace` tool description states
  that agents MUST call it first and then call other tools sequentially, never
  in parallel.
- **Mutex on switch**: prevents concurrent switches from interleaving.

### Future Direction

A more robust solution would serialise **all** workspace operations behind a
single mutex (or a read-write lock). This would prevent any tool from executing
while a switch is in flight. The downside is reduced throughput for parallel
read operations.

This has not been implemented because it would serialise all filesystem
operations, which is too restrictive for the current use case. Revisit if
adversarial agent scenarios become a real concern.
