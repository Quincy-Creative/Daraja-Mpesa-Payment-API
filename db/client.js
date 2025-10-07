/**
 * db/client.js
 *
 * This file sets up and exports the database client for the application.
 * It initializes the connection to the PostgreSQL database using the Postgres.js client,
 * and integrates it with Drizzle ORM for type-safe query building and migrations.
 *
 * Exports:
 *   - sql: The raw Postgres.js client instance for direct SQL queries.
 *   - db: The Drizzle ORM instance for structured and type-safe database operations.
 *
 * If Drizzle's postgres-js adapter cannot be required (e.g., due to ESM/CJS issues),
 * an error is thrown with instructions for resolving the import problem.
 */


const sql = require("./pg");

// Try to require drizzle-orm's postgres-js adapter.
// If your drizzle install is ESM-only this require might fail; see bottom notes for fallback.
let db;
try {
	const { drizzle } = require("drizzle-orm/postgres-js");
	db = drizzle(sql);
} catch (err) {
	console.error(
		"Could not require drizzle-orm/postgres-js directly. If you see an ESM error, please use the dynamic import fallback described in the README or set \"type\": \"module\" in package.json."
	);
	throw err;
}

module.exports = {
	sql,
	db,
};
