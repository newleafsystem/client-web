#!/usr/bin/env node
/**
 * verify-firestore.js
 * Check what's actually in Firestore tiles collection
 */

const { getFirestoreDb } = require('../lib/firebase-admin.cjs');

const db = getFirestoreDb();

async function verifyFirestore() {
  console.log('🔍 Checking Firestore tiles collection...\n');

  try {
    // Get ALL tiles (active and inactive)
    const allTilesSnapshot = await db.collection('tiles').get();
    console.log(`📊 Total tiles in collection: ${allTilesSnapshot.size}`);

    // Get only active tiles
    const activeTilesSnapshot = await db.collection('tiles')
      .where('isActive', '==', true)
      .get();
    
    console.log(`✅ Active tiles: ${activeTilesSnapshot.size}`);
    console.log(`❌ Inactive tiles: ${allTilesSnapshot.size - activeTilesSnapshot.size}\n`);

    if (activeTilesSnapshot.size > 0) {
      console.log('Active symbols:');
      const symbols = [];
      activeTilesSnapshot.forEach(doc => {
        const data = doc.data();
        symbols.push(data.symbol);
      });
      symbols.sort();
      console.log(symbols.join(', '));
      console.log(`\nTotal active symbols: ${symbols.length}`);
    }

    // Check market state
    const marketStateDoc = await db.collection('marketState').doc('current').get();
    if (marketStateDoc.exists) {
      const marketState = marketStateDoc.data();
      console.log(`\n📈 Market State:`);
      console.log(`  Last scan: ${marketStateDoc.data().lastScanTime?.toDate()}`);
      console.log(`  Active tile count: ${marketState.activeTileCount}`);
      console.log(`  Symbols: ${marketState.symbols?.length || 0}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

verifyFirestore();
