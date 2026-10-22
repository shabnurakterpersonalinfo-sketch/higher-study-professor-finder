import { Logger, NotImplementedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GatewayName = 'bKash' | 'Nagad' | 'Mock';

export interface CreatePaymentInput {
  transactionId: string; // our Transaction.id, used as merchant invoice number
  amount: number;
  payerReference: string;
  callbackUrl: string;
}
export interface CreatePaymentResult {
  paymentId: string;
  redirectUrl: string;
  raw?: unknown;
}
export interface ExecuteResult {
  status: 'SUCCESS' | 'FAILED';
  gatewayTransactionId?: string;
  raw?: unknown;
}

export interface PaymentGateway {
  readonly name: GatewayName;
  create(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Finalise after the user returns to the callback URL. Must be safe to call twice. */
  execute(paymentId: string): Promise<ExecuteResult>;
}

/**
 * bKash Tokenized Checkout.
 * Flow: grant token → create (returns bkashURL) → user pays → callback → execute.
 * Env: BKASH_BASE_URL, BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME, BKASH_PASSWORD.
 * Verify field names against the current bKash merchant docs for your API version
 * before going live; sandbox and production base URLs differ.
 */
export class BkashGateway implements PaymentGateway {
  readonly name = 'bKash' as const;
  private readonly log = new Logger('bKash');
  private token: { value: string; exp: number } | null = null;

  constructor(private readonly cfg: ConfigService) {}

  private get base() {
    const b = this.cfg.get<string>('BKASH_BASE_URL');
    if (!b) throw new ServiceUnavailableException('bKash is not configured');
    return b.replace(/\/$/, '');
  }

  private async idToken(): Promise<string> {
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    const res = await fetch(`${this.base}/tokenized/checkout/token/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        username: this.cfg.getOrThrow('BKASH_USERNAME'),
        password: this.cfg.getOrThrow('BKASH_PASSWORD'),
      },
      body: JSON.stringify({ app_key: this.cfg.getOrThrow('BKASH_APP_KEY'), app_secret: this.cfg.getOrThrow('BKASH_APP_SECRET') }),
    });
    const body = (await res.json()) as { id_token?: string; expires_in?: number; statusMessage?: string };
    if (!res.ok || !body.id_token) throw new ServiceUnavailableException(`bKash token grant failed: ${body.statusMessage ?? res.status}`);
    this.token = { value: body.id_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return body.id_token;
  }

  private async call<T>(path: string, payload: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: await this.idToken(),
        'X-APP-Key': this.cfg.getOrThrow('BKASH_APP_KEY'),
      },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as T;
  }

  async create(i: CreatePaymentInput): Promise<CreatePaymentResult> {
    const body = await this.call<{ paymentID?: string; bkashURL?: string; statusMessage?: string }>('/tokenized/checkout/create', {
      mode: '0011',
      payerReference: i.payerReference,
      callbackURL: i.callbackUrl,
      amount: i.amount.toFixed(2),
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: i.transactionId,
    });
    if (!body.paymentID || !body.bkashURL) throw new ServiceUnavailableException(`bKash create failed: ${body.statusMessage ?? 'unknown'}`);
    return { paymentId: body.paymentID, redirectUrl: body.bkashURL, raw: body };
  }

  async execute(paymentId: string): Promise<ExecuteResult> {
    let body = await this.call<{ transactionStatus?: string; trxID?: string; statusCode?: string }>('/tokenized/checkout/execute', { paymentID: paymentId });
    // A network blip on execute can leave the payment completed on bKash's side; query before failing.
    if (!body.transactionStatus) {
      this.log.warn(`execute returned no status for ${paymentId}; querying`);
      body = await this.call('/tokenized/checkout/payment/status', { paymentID: paymentId });
    }
    return body.transactionStatus === 'Completed'
      ? { status: 'SUCCESS', gatewayTransactionId: body.trxID, raw: body }
      : { status: 'FAILED', raw: body };
  }
}

/**
 * Nagad requires RSA-encrypted sensitive data and signatures using keys issued
 * in the merchant onboarding kit. That part needs your merchant keys and the
 * kit's spec, so it is left as an explicit integration point.
 */
export class NagadGateway implements PaymentGateway {
  readonly name = 'Nagad' as const;
  create(): Promise<CreatePaymentResult> {
    throw new NotImplementedException('Nagad checkout needs merchant keys — see docs/PAYMENTS.md. Use PAYMENT_MODE=mock in development.');
  }
  execute(): Promise<ExecuteResult> {
    throw new NotImplementedException('Nagad checkout not configured');
  }
}

/** Development gateway: redirects to the web app's mock checkout page. */
export class MockGateway implements PaymentGateway {
  readonly name = 'Mock' as const;
  constructor(private readonly webUrl: string) {}
  async create(i: CreatePaymentInput): Promise<CreatePaymentResult> {
    const paymentId = `mock_${i.transactionId}`;
    const url = new URL('/purchase-plan/mock-checkout', this.webUrl);
    url.searchParams.set('paymentID', paymentId);
    url.searchParams.set('amount', String(i.amount));
    url.searchParams.set('callback', i.callbackUrl);
    return { paymentId, redirectUrl: url.toString() };
  }
  async execute(paymentId: string): Promise<ExecuteResult> {
    return { status: 'SUCCESS', gatewayTransactionId: `MOCK${paymentId.slice(-8).toUpperCase()}` };
  }
}
