import 'server-only';
import { serverClient } from '@/sanity/lib/serverClient';

export type Dbk94SaleMovement = {
  _type: 'dbk94SaleMovement'; _key: string;
  movementId: string;
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  variantId?: string;
  quantityChange: number;
  stockBefore?: number;
  stockAfter?: number;
  sourceStoreId?: string;
  sourceLocation?: string;
  note?: string;
  createdAt: string;
};
const PROD_HOST = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const TEST_HOST = 'ep-green-sea-ba4sybzn-pooler.c-8.eu-central-1.aws.neon.tech';
/** Only changes SALE movement-document storage, never stock authority or payment routing. */
export function dbk94NeonSalesEnabled() {
  if (process.env.DBK94_SALE_MOVEMENT_STORE !== 'neon') return false;
  if (process.env.DBK94_SALE_MOVEMENT_APPROVED !== 'YES')
    throw new Error('DBK-94 movement cutover requires explicit approval');
  if (process.env.DBK_INVENTORY_BACKEND === 'neon')
    throw new Error('DBK-94 journal is for legacy Sanity stock authority only');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DBK-94 missing production Neon URL');
  const db = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.pathname !== '/neondb') {
    throw new Error('DBK-94 requires a pinned Neon database');
  }
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
  const project = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  if (process.env.DBK94_STAGING_TEST === 'YES') {
    if (process.env.VERCEL_ENV === 'production' ||
        (process.env.NODE_ENV !== 'development' && process.env.VERCEL_ENV !== 'preview') ||
        dataset === 'production' || db.hostname !== TEST_HOST) {
      throw new Error('DBK-94 staging mode refuses production Sanity or Neon');
    }
    return true;
  }
  if (db.hostname !== PROD_HOST || project !== 'g34n810u' || dataset !== 'production') {
    throw new Error('DBK-94 refuses mismatched production Sanity/Neon identity');
  }
  return true;
}
export function dbk94JournalOnExistingOrder(
  patch: ReturnType<typeof serverClient.patch>,
  entries: Dbk94SaleMovement[],
) {
  return entries.length ? patch.setIfMissing({dbk94SaleMovementJournal: []})
    .append('dbk94SaleMovementJournal', entries) : patch;
}
