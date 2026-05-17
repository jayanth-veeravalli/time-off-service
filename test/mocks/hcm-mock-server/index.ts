import express, { Request, Response } from 'express';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

export type MockMode =
  | 'NORMAL'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_DIMENSIONS'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'SILENT_ACCEPT'
  | 'REVERSAL_ERROR';

interface MockResponse {
  status: number;
  body: Record<string, unknown>;
}

interface BalanceKey {
  employerId: string;
  employeeId: string;
  locationId: string;
  leaveType: string;
  year: string | number;
}

// ─── load response fixtures ───────────────────────────────────────────────────

function r(endpoint: string, name: string): MockResponse {
  const filePath = path.join(__dirname, 'responses', endpoint, `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as MockResponse;
}

const responses = {
  balance: {
    success: r('balance', 'success'),
    serverError: r('balance', 'server-error'),
    invalidDims: r('balance', 'invalid-dims'),
  },
  debit: {
    success: r('debit', 'success'),
    serverError: r('debit', 'server-error'),
    insufficientBalance: r('debit', 'insufficient-balance'),
    invalidDims: r('debit', 'invalid-dims'),
    silentAccept: r('debit', 'silent-accept'),
  },
  reverse: {
    success: r('reverse', 'success'),
    serverError: r('reverse', 'server-error'),
    reversalError: r('reverse', 'reversal-error'),
  },
  control: {
    ok: r('control', 'ok'),
  },
};

// ─── server state ─────────────────────────────────────────────────────────────

let mode: MockMode = 'NORMAL';
let delayMs = 0;
const balances = new Map<string, number>();
const debits = new Map<string, number>();

function keyOf(k: BalanceKey): string {
  return `${k.employerId}:${k.employeeId}:${k.locationId}:${k.leaveType}:${k.year}`;
}

function send(res: Response, r: MockResponse): void {
  res.status(r.status).json(r.body);
}

// ─── app ──────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.get('/balance', async (req: Request, res: Response) => {
  await pause();
  if (mode === 'TIMEOUT') return;
  if (mode === 'SERVER_ERROR')
    return void send(res, responses.balance.serverError);
  if (mode === 'INVALID_DIMENSIONS')
    return void send(res, responses.balance.invalidDims);

  const key = keyOf(req.query as unknown as BalanceKey);
  const balanceHours = balances.get(key) ?? 0;
  send(res, { ...responses.balance.success, body: { balanceHours } });
});

app.post('/debit', async (req: Request, res: Response) => {
  await pause();
  if (mode === 'TIMEOUT') return;
  if (mode === 'SERVER_ERROR')
    return void send(res, responses.debit.serverError);
  if (mode === 'INVALID_DIMENSIONS')
    return void send(res, responses.debit.invalidDims);
  if (mode === 'INSUFFICIENT_BALANCE')
    return void send(res, responses.debit.insufficientBalance);
  if (mode === 'SILENT_ACCEPT')
    return void send(res, responses.debit.silentAccept);

  const { hours, requestExternalId, ...keyParts } = req.body as BalanceKey & {
    hours: number;
    requestExternalId: string;
  };
  const key = keyOf(keyParts);
  balances.set(key, (balances.get(key) ?? 0) - hours);
  debits.set(requestExternalId, hours);
  send(res, responses.debit.success);
});

app.post('/reverse', async (req: Request, res: Response) => {
  await pause();
  if (mode === 'TIMEOUT') return;
  if (mode === 'SERVER_ERROR')
    return void send(res, responses.reverse.serverError);
  if (mode === 'REVERSAL_ERROR')
    return void send(res, responses.reverse.reversalError);

  const { hours, requestExternalId, ...keyParts } = req.body as BalanceKey & {
    hours: number;
    requestExternalId: string;
  };
  const key = keyOf(keyParts);
  balances.set(key, (balances.get(key) ?? 0) + hours);
  debits.delete(requestExternalId);
  send(res, responses.reverse.success);
});

// ─── control routes ───────────────────────────────────────────────────────────

app.post('/mock/seed', (req: Request, res: Response) => {
  const { key, balanceHours } = req.body as {
    key: BalanceKey;
    balanceHours: number;
  };
  balances.set(keyOf(key), balanceHours);
  send(res, responses.control.ok);
});

app.post('/mock/reset', (_req: Request, res: Response) => {
  balances.clear();
  debits.clear();
  mode = 'NORMAL';
  delayMs = 0;
  send(res, responses.control.ok);
});

app.post('/mock/configure', (req: Request, res: Response) => {
  const { mode: newMode, delayMs: newDelay } = req.body as {
    mode: MockMode;
    delayMs?: number;
  };
  mode = newMode;
  if (newDelay !== undefined) delayMs = newDelay;
  send(res, responses.control.ok);
});

app.post('/mock/mutate', (req: Request, res: Response) => {
  const { key, balanceHours } = req.body as {
    key: BalanceKey;
    balanceHours: number;
  };
  balances.set(keyOf(key), balanceHours);
  send(res, responses.control.ok);
});

app.get('/mock/debits', (_req: Request, res: Response) => {
  res.json(Object.fromEntries(debits));
});

app.get('/mock/balance', (req: Request, res: Response) => {
  const key = keyOf(req.query as unknown as BalanceKey);
  res.json({ balanceHours: balances.get(key) ?? 0 });
});

// ─── lifecycle ────────────────────────────────────────────────────────────────

let server: http.Server | null = null;
let port = 0;

export function start(): Promise<void> {
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      port = (server!.address() as { port: number }).port;
      resolve();
    });
  });
}

export function stop(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server) return resolve();
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

export function getPort(): number {
  return port;
}

function pause(): Promise<void> {
  return delayMs > 0
    ? new Promise((r) => setTimeout(r, delayMs))
    : Promise.resolve();
}
