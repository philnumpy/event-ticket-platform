export type HoldStatus = 'ACTIVE' | 'EXPIRED' | 'CONSUMED' | 'RELEASED';

export interface HoldProps {
  id: string;
  showId: string;
  seatIds: string[];
  userId: string;
  createdAt: Date;
  ttlSeconds: number;
  status?: HoldStatus;
}

/** A temporary claim on one or more seats, e.g. the 5-minute window between
 * "add to cart" and payment. Backed by Redis with a matching TTL in Phase 2;
 * this entity is the transport-agnostic record of that claim. */
export class Hold {
  readonly id: string;
  readonly showId: string;
  readonly seatIds: string[];
  readonly userId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  private _status: HoldStatus;

  constructor(props: HoldProps) {
    if (props.seatIds.length === 0) {
      throw new Error('A hold must cover at least one seat');
    }
    this.id = props.id;
    this.showId = props.showId;
    this.seatIds = props.seatIds;
    this.userId = props.userId;
    this.createdAt = props.createdAt;
    this.expiresAt = new Date(props.createdAt.getTime() + props.ttlSeconds * 1000);
    this._status = props.status ?? 'ACTIVE';
  }

  get status(): HoldStatus {
    return this._status;
  }

  isExpired(now: Date = new Date()): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  consume(): void {
    if (this._status !== 'ACTIVE') {
      throw new Error(`Cannot consume a hold in status "${this._status}"`);
    }
    this._status = 'CONSUMED';
  }

  expire(): void {
    if (this._status === 'ACTIVE') {
      this._status = 'EXPIRED';
    }
  }

  release(): void {
    if (this._status === 'ACTIVE') {
      this._status = 'RELEASED';
    }
  }

  toJSON() {
    return {
      id: this.id,
      showId: this.showId,
      seatIds: this.seatIds,
      userId: this.userId,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      status: this._status,
    };
  }
}
