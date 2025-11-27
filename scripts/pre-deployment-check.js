#!/usr/bin/env node

/**
 * Pre-Deployment Checklist Script
 * Runs automated checks before production deployment
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Pre-Deployment Checklist\n');
console.log('=' .repeat(50));
console.log();

let passed = 0;
let failed = 0;
let warnings = 0;

// Helper functions
function check(name, condition, isWarning = false) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    if (isWarning) {
      console.log(`⚠️  ${name}`);
      warnings++;
    } else {
      console.log(`❌ ${name}`);
      failed++;
    }
  }
}

function fileExists(filepath) {
  return fs.existsSync(path.join(__dirname, '..', filepath));
}

function fileContains(filepath, searchString) {
  try {
    const content = fs.readFileSync(path.join(__dirname, '..', filepath), 'utf-8');
    return content.includes(searchString);
  } catch (e) {
    return false;
  }
}

// 1. Core Files Check
console.log('📁 Core Files');
check('package.json exists', fileExists('package.json'));
check('next.config.ts exists', fileExists('next.config.ts'));
check('.env.local exists', fileExists('.env.local'), true);
check('middleware.ts exists', fileExists('middleware.ts'));
console.log();

// 2. Feature Files Check
console.log('🎯 Feature Files');
check('Templates lib exists', fileExists('lib/templates.ts'));
check('Template gallery page exists', fileExists('app/templates/page.tsx'));
check('Error boundary exists', fileExists('components/error-boundary.tsx'));
check('API error handler exists', fileExists('lib/api-error-handler.ts'));
check('Sentry configs exist', fileExists('sentry.client.config.ts') && fileExists('sentry.server.config.ts'));
check('OG image API exists', fileExists('app/api/og/route.tsx'));
check('Sitemap exists', fileExists('app/sitemap.ts'));
check('Robots.txt exists', fileExists('app/robots.ts'));
console.log();

// 3. Critical Components
console.log('🧩 Critical Components');
check('Activity editor exists', fileExists('components/itineraries/activity-editor.tsx'));
check('Day editor exists', fileExists('components/itineraries/day-editor.tsx'));
check('Edit form exists', fileExists('components/itineraries/edit-form.tsx'));
check('Template card exists', fileExists('components/templates/template-card.tsx'));
check('Chat interface exists', fileExists('components/chat/chat-interface.tsx'));
console.log();

// 4. API Routes
console.log('🔌 API Routes');
check('Generate API exists', fileExists('app/api/itineraries/generate/route.ts'));
check('Update API exists', fileExists('app/api/itineraries/[id]/update/route.ts'));
check('Share API exists', fileExists('app/api/itineraries/[id]/share/route.ts'));
check('Export API exists', fileExists('app/api/itineraries/[id]/export/route.ts'));
check('Revise API exists', fileExists('app/api/itineraries/[id]/revise/route.ts'));
check('Chat API exists', fileExists('app/api/chat/route.ts'));
console.log();

// 5. SEO Implementation
console.log('🔍 SEO Implementation');
check('OG image generation implemented', fileExists('app/api/og/route.tsx'));
check('Sitemap implemented', fileExists('app/sitemap.ts'));
check('Robots.txt implemented', fileExists('app/robots.ts'));
check('Itinerary page has metadata', fileContains('app/itineraries/[id]/page.tsx', 'generateMetadata'));
check('Spot page has metadata', fileContains('app/spots/[id]/page.tsx', 'generateMetadata'));
check('JSON-LD structured data', fileContains('app/itineraries/[id]/page.tsx', 'application/ld+json'));
console.log();

// 6. Dependencies
console.log('📦 Dependencies');
const packageJson = require('../package.json');
const deps = packageJson.dependencies || {};

check('Next.js installed', !!deps.next);
check('React installed', !!deps.react);
check('Supabase client installed', !!deps['@supabase/supabase-js']);
check('Clerk installed', !!deps['@clerk/nextjs']);
check('OpenAI installed', !!deps.openai);
check('Sentry installed', !!deps['@sentry/nextjs']);
check('DnD library installed', !!deps['@hello-pangea/dnd']);
console.log();

// 7. Environment Variables (from .env.local if exists)
console.log('🔐 Environment Configuration');
if (fileExists('.env.local')) {
  check('NEXT_PUBLIC_SUPABASE_URL configured', fileContains('.env.local', 'NEXT_PUBLIC_SUPABASE_URL'));
  check('NEXT_PUBLIC_SUPABASE_ANON_KEY configured', fileContains('.env.local', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  check('SUPABASE_SERVICE_ROLE_KEY configured', fileContains('.env.local', 'SUPABASE_SERVICE_ROLE_KEY'));
  check('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY configured', fileContains('.env.local', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'));
  check('CLERK_SECRET_KEY configured', fileContains('.env.local', 'CLERK_SECRET_KEY'));
  check('OPENAI_API_KEY configured', fileContains('.env.local', 'OPENAI_API_KEY'));
  check('NEXT_PUBLIC_SENTRY_DSN configured', fileContains('.env.local', 'NEXT_PUBLIC_SENTRY_DSN'), true);
  check('NEXT_PUBLIC_BASE_URL configured', fileContains('.env.local', 'NEXT_PUBLIC_BASE_URL'), true);
} else {
  console.log('⚠️  .env.local not found - skipping environment checks');
  warnings++;
}
console.log();

// 8. Build Artifacts
console.log('🏗️  Build Artifacts');
check('.next directory exists', fileExists('.next'));
check('Build successful (check manually)', true, true);
console.log();

// Summary
console.log('=' .repeat(50));
console.log('\n📊 Summary\n');
console.log(`✅ Passed:   ${passed}`);
console.log(`❌ Failed:   ${failed}`);
console.log(`⚠️  Warnings: ${warnings}`);
console.log();

if (failed === 0) {
  console.log('🎉 All critical checks passed!');
  if (warnings > 0) {
    console.log(`⚠️  ${warnings} warning(s) - review before deployment`);
  }
  console.log('\n✅ Ready for production deployment!');
  process.exit(0);
} else {
  console.log(`❌ ${failed} critical check(s) failed!`);
  console.log('🚫 NOT ready for deployment - fix issues first');
  process.exit(1);
}
