"""SRS knobs — single source of truth for tunables across the review
flow. Hard-coded today; the migration to per-user settings is Fase 2.

Defaults match Anki's long-standing defaults so users transitioning
from Anki don't get surprised by either a tougher or laxer system.
"""
from __future__ import annotations

# Maximum number of NEVER-REVIEWED cards introduced to the user per
# calendar day (UTC). Once this many cards have transitioned from
# state=0 (New) to anything else today, the queue stops surfacing
# more new cards until tomorrow. Mature reviews are NOT affected.
DAILY_NEW_CARD_CAP = 20

# When a card accumulates this many lapses (grade=Again while in
# Review/Relearning state), it's auto-suspended. The user can still
# unsuspend manually after editing the card to make it stick.
LEECH_LAPSE_THRESHOLD = 8
