Read docs/Desktop_Pet_PRD_Technical_Spec.md (Section 3.1) and
docs/Desktop_Pet_Asset_Animation_Spec_Sheet.md (Section 2 — all 11 animation states)
before doing anything else.

Write docs/pet-state-machine.md documenting:

1. The full FSM: all 11 states (idle, walk, sleep, waking_up, happy, worried,
   celebrate, typing_focused, eating, consent_ask, bring_me_a_note), what triggers
   each transition, and what state follows.

2. Click-through toggle logic: idle state -> click-through enabled after N seconds;
   global hotkey (Alt+P) -> click-through disabled, pet "perks up"; already
   interactive + hotkey -> opens Utility Window. Explain the three-state resolution.

3. Fullscreen detection: pet hides immediately (not occluded) when a fullscreen app
   gains focus; restores with waking_up animation when it loses focus.

4. Frame timing: looping states run ~8-10fps, one-off states run ~150ms/frame then
   hold or return to idle.

Do not write any code yet — this is a design document only. Save it to
docs/pet-state-machine.md.