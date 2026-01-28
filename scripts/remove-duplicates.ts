/**
 * Remove Duplicate Spots Script
 *
 * Finds and removes duplicate spots based on name and address.
 * Keeps the oldest record (first created).
 *
 * Usage:
 *   npx tsx scripts/remove-duplicates.ts --dry-run
 *   npx tsx scripts/remove-duplicates.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Spot {
    id: string;
    name: { en: string; [key: string]: string };
    address: { en: string; [key: string]: string };
    created_at: string;
}

async function findDuplicates(): Promise<Map<string, Spot[]>> {
    console.log('🔍 Fetching all spots...\n');

    const { data: spots, error } = await supabase
        .from('spots')
        .select('id, name, address, created_at')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('❌ Error fetching spots:', error);
        process.exit(1);
    }

    console.log(`📊 Found ${spots.length} total spots\n`);

    // Group by name + address
    const groups = new Map<string, Spot[]>();

    for (const spot of spots) {
        const nameEn = spot.name?.en || '';
        const addressEn = spot.address?.en || '';
        const key = `${nameEn.toLowerCase()}|${addressEn.toLowerCase()}`;

        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(spot as Spot);
    }

    // Filter to only groups with duplicates
    const duplicates = new Map<string, Spot[]>();
    for (const [key, spotGroup] of groups) {
        if (spotGroup.length > 1) {
            duplicates.set(key, spotGroup);
        }
    }

    return duplicates;
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  DUPLICATE SPOTS REMOVER`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`${'═'.repeat(60)}\n`);

    const duplicates = await findDuplicates();

    if (duplicates.size === 0) {
        console.log('✅ No duplicates found!\n');
        return;
    }

    console.log(`🔄 Found ${duplicates.size} duplicate groups:\n`);

    let totalToDelete = 0;
    const idsToDelete: string[] = [];

    for (const [key, spots] of duplicates) {
        const [nameEn] = key.split('|');
        console.log(`  "${nameEn}" - ${spots.length} copies`);

        // Keep the first (oldest), delete the rest
        const [keep, ...toDelete] = spots;
        console.log(`    ✓ Keep: ${keep.id} (created ${keep.created_at})`);

        for (const spot of toDelete) {
            console.log(`    ✗ Delete: ${spot.id}`);
            idsToDelete.push(spot.id);
        }
        totalToDelete += toDelete.length;
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Total to delete: ${totalToDelete} spots`);
    console.log(`${'─'.repeat(60)}\n`);

    if (dryRun) {
        console.log('📝 DRY RUN - No changes made.\n');
        console.log('Run without --dry-run to delete duplicates.\n');
        return;
    }

    // Delete duplicates
    console.log('🗑️  Deleting duplicates...\n');

    let deleted = 0;
    let errors = 0;

    for (const id of idsToDelete) {
        const { error } = await supabase
            .from('spots')
            .delete()
            .eq('id', id);

        if (error) {
            console.error(`  ❌ Failed to delete ${id}: ${error.message}`);
            errors++;
        } else {
            deleted++;
        }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ✅ COMPLETE`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  Deleted: ${deleted}`);
    console.log(`  Errors: ${errors}`);
    console.log(`${'═'.repeat(60)}\n`);
}

main();
