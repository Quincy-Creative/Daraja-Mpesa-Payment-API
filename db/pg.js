const postgres = require('postgres');

const connectionString = process.env.DATABASE_URL_POOL;
if (!connectionString) {
	throw new Error('DATABASE_URL_POOL environment variable is not set');
}
const sql = postgres(connectionString, { prepare: false });

module.exports = sql;