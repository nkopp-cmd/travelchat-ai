# Supabase Database Setup

## Quick Fix for Current Issues

**If you're experiencing database errors, run this immediately:**

1. Go to your Supabase project dashboard
2. Click on "SQL Editor"
3. Copy and paste the contents of `fix-database-schema.sql`
4. Click "Run"

This will:
- ✅ Add `clerk_user_id` column to `itineraries` table
- ✅ Create `conversations` and `messages` tables
- ✅ Add all necessary indexes
- ✅ Create triggers for automatic timestamp updates

## Full Database Setup (New Projects)

For setting up a completely new database, run these files in order:

### 1. Main Schema
```sql
-- Run: schema.sql
-- Creates all core tables (users, spots, itineraries, challenges, conversations, messages)
```

### 2. Indexes
```sql
-- Run: indexes.sql
-- Creates performance indexes for all tables
```

### 3. RLS Policies
```sql
-- Run: rls-policies.sql
-- Sets up Row Level Security for data protection
```

### 4. Conversations (if not in main schema)
```sql
-- Run: conversations.sql
-- Creates conversations and messages tables (backup)
```

### 5. Viator Schema (optional)
```sql
-- Run: viator-schema.sql
-- Creates tables for Viator API integration
```

## Current Database Issues Fixed

### Issue 1: Missing `conversations` table
**Error:** `Could not find the table 'public.conversations' in the schema cache`

**Fix:** The `fix-database-schema.sql` script creates the conversations and messages tables with all necessary indexes and triggers.

### Issue 2: Missing `clerk_user_id` column in itineraries
**Error:** `column itineraries.clerk_user_id does not exist`

**Fix:** The `fix-database-schema.sql` script adds the `clerk_user_id` column to the itineraries table and migrates existing data.

## Verification

After running the fix script, verify everything works:

```sql
-- Check if clerk_user_id exists in itineraries
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'itineraries' AND column_name = 'clerk_user_id';

-- Check if conversations table exists
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('conversations', 'messages');

-- Check all indexes
SELECT indexname
FROM pg_indexes
WHERE tablename IN ('conversations', 'messages', 'itineraries')
ORDER BY tablename, indexname;
```

## Schema Overview

### Core Tables

1. **users** - User profiles synced from Clerk
2. **spots** - Location database with multi-language support
3. **user_progress** - Gamification progress tracking
4. **itineraries** - AI-generated travel plans
5. **challenges** - Weekly challenges for users
6. **user_challenges** - User progress on challenges
7. **conversations** - Chat conversation sessions
8. **messages** - Individual chat messages

### Key Features

- **PostGIS** for geospatial queries
- **Multi-language JSONB** fields for i18n
- **Row Level Security** for data protection
- **Optimized indexes** for performance
- **Automatic timestamps** via triggers

## Environment Variables Required

Make sure these are set in your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Troubleshooting

### "Table does not exist" errors
Run the `fix-database-schema.sql` script.

### "Column does not exist" errors
The fix script handles column migrations automatically.

### RLS Policy errors
Check that `rls-policies.sql` has been run and policies are enabled.

### Performance issues
Ensure `indexes.sql` has been run for all tables.

## Migration History

- **Initial Schema** - Core tables (users, spots, progress, itineraries, challenges)
- **Chat Feature** - Added conversations and messages tables
- **Schema Fix** - Added clerk_user_id to itineraries for direct querying

## Contact

For issues or questions, check the main project README.md
