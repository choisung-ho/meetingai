// Presence is maintained by the workspace/meeting-room lifecycle handlers.
//
// The protocol does not expose a separate client-sent presence event: joining
// or leaving a scope updates Redis presence and broadcasts the corresponding
// USER_PRESENCE_UPDATED message. This module is kept as an explicit extension
// point for future presence-only events so an empty placeholder cannot be
// mistaken for a missing implementation.

function handlePresenceEvent() {
  return undefined;
}

module.exports = {
  handlePresenceEvent,
};
