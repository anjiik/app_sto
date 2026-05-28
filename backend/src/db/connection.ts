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

export async function dbInsert(
  queryStr: string,
  params: Record<string, unknown> = {}
): Promise<number> {
  const rows = await dbQuery<{ id: number }>(queryStr, params);
  return rows[0]?.id ?? 0;
}
