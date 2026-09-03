# Linked Cards

Lumno lets a pinned recent-site card stay associated with a browser tab while its page changes, and preserves earlier card versions so people can return to them.

## Language

**Linked Card**:
A pinned recent-site card associated with one or more browser tabs so its saved page can be updated.
_Avoid_: Tracked page, watched page

**Version**:
A saved title and URL state of a linked card at a particular change.
_Avoid_: Undo item, backup

**Change History**:
The ordered collection of up to ten retained versions for a linked card; choosing a version does not consume it. Restoring records the previous current version at the front, so the oldest retained version may age out when the limit is reached.
_Avoid_: Undo stack

**Undo**:
The immediate reversal of the most recently completed link or update operation while it is still safe to reverse.
_Avoid_: Restore, rollback

**Restore**:
Making a retained version current while preserving the existing change history and recording the result as a new change.
_Avoid_: Undo, rollback
