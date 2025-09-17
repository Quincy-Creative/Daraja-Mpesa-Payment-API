// db/client.js
// CommonJS style - requires the postgres.js client, then creates a drizzle instance.
const sql = require('./pg');

// Try to require drizzle-orm's postgres-js adapter.
// If your drizzle install is ESM-only this require might fail; see bottom notes for fallback.
let db;
try {
	// If this works, drizzle supports CJS in your environment
	const { drizzle } = require('drizzle-orm/postgres-js');
	db = drizzle(sql);
} catch (err) {
	// We'll throw a clearer error telling you how to fix (see fallback note below).
	console.error('Could not require drizzle-orm/postgres-js directly. If you see an ESM error, please use the dynamic import fallback described in the README or set "type": "module" in package.json.');
	throw err;
}

module.exports = {
	sql,
	db,
};
