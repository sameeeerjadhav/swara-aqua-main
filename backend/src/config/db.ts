import mysql from 'mysql2/promise';
// dotenv already loaded in index.ts before this import

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || '127.0.0.1',
  port:               Number(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'swara_aqua',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  connectTimeout:     30000,
  multipleStatements: false,
  // ── IST timezone ────────────────────────────────────────────────────────────
  // mysql2 uses this when converting JS Date <-> TIMESTAMP columns
  timezone:           '+05:30',
  // Hostinger uses SSL on shared hosting — disable cert verification
  ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
});

// Quick connectivity check + set session timezone — non-fatal
pool.getConnection()
  .then(async conn => {
    // Force MySQL session to IST so NOW(), CURDATE(), CURTIME() all return IST
    await conn.query("SET time_zone = '+05:30'");
    console.log(`MySQL connected -> ${process.env.DB_NAME} (timezone: IST +05:30)`);
    conn.release();
  })
  .catch(err => {
    console.error('MySQL connection failed:', err.message);
    console.error('   Check DB_HOST=127.0.0.1, DB_USER, DB_PASSWORD, DB_NAME in .env');
    // Non-fatal — migrations will fail and show a clear error
  });

// Apply IST timezone to every new connection acquired from the pool
// This is critical — each pooled connection needs its own SET time_zone
(pool as any).on('connection', (conn: any) => {
  conn.query("SET time_zone = '+05:30'", (err: any) => {
    if (err) console.warn('Failed to set time_zone on connection:', err.message);
  });
});

export default pool;
