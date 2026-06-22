import * as sql from 'mssql/msnodesqlv8';

let poolPromise: Promise<sql.ConnectionPool> | null = null;

function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    const fullServer = process.env.DB_SERVER || 'localhost';
    const database   = process.env.DB_DATABASE || 'sto_management';

    // Split "SERVERNAME\INSTANCENAME" into separate fields
    const [server, instanceName] = fullServer.includes('\\')
      ? fullServer.split('\\')
      : [fullServer, undefined];

    const config: sql.config = {
      server,
      database,
      driver: 'msnodesqlv8',
      options: {
        trustedConnection: true,
        trustServerCertificate: true,
        instanceName,
      },
      // Pool sizing: the Dashboard fires 6 parallel requests per page load.
      // max=20 handles ~3 concurrent users loading the dashboard simultaneously
      // without queueing; raise it if query times start climbing under load.
      pool: {
        max: 20,
        min: 2,
        idleTimeoutMillis: 30_000,
        acquireTimeoutMillis: 15_000,
      },
    };

    console.log(`DB connecting → server: ${server}, instance: ${instanceName ?? 'default'}, database: ${database}`);

    const pool = new sql.ConnectionPool(config);
    poolPromise = pool.connect().catch(err => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

async function makeRequest(params: Record<string, unknown> = {}): Promise<sql.Request> {
  const pool = await getPool();
  const req = pool.request();
  for (const [key, val] of Object.entries(params)) {
    req.input(key, val !== undefined ? val : null);
  }
  return req;
}

export async function dbQuery<T = Record<string, unknown>>(
  queryStr: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const req = await makeRequest(params);
  const result = await req.query<T>(queryStr);
  return result.recordset;
}

export async function dbQueryOne<T = Record<string, unknown>>(
  queryStr: string,
  params: Record<string, unknown> = {}
): Promise<T | undefined> {
  const rows = await dbQuery<T>(queryStr, params);
  return rows[0];
}

export async function dbExecute(
  queryStr: string,
  params: Record<string, unknown> = {}
): Promise<void> {
  const req = await makeRequest(params);
  await req.query(queryStr);
}

export type TxExecutor = (query: string, params?: Record<string, unknown>) => Promise<void>;

export async function withTransaction(fn: (execute: TxExecutor) => Promise<void>): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const execute: TxExecutor = async (queryStr, params = {}) => {
      const txReq = new sql.Request(transaction);
      for (const [key, val] of Object.entries(params)) {
        txReq.input(key, val !== undefined ? val : null);
      }
      await txReq.query(queryStr);
    };
    await fn(execute);
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function closePool(): Promise<void> {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close();
    poolPromise = null;
  }
}

