-- Migration 005: Add linked_itinerary_id to conversations
-- Links a chat conversation to a saved itinerary when user saves from chat

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS linked_itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_linked_itinerary
ON conversations(linked_itinerary_id)
WHERE linked_itinerary_id IS NOT NULL;

COMMENT ON COLUMN conversations.linked_itinerary_id IS
  'Links conversation to itinerary saved from chat. Nullable. ON DELETE SET NULL preserves conversation if itinerary is deleted.';
