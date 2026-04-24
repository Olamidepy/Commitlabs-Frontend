import { logError, logInfo } from '../logger';
import {
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '../errors';
import { getStorageAdapter } from '../storage';
import type {
  MarketplaceListing,
  CreateListingRequest,
} from '@/lib/types/domain';

export type MarketplaceCommitmentType = 'Safe' | 'Balanced' | 'Aggressive';

export interface MarketplacePublicListing {
  listingId: string;
  commitmentId: string;
  type: MarketplaceCommitmentType;
  amount: number;
  remainingDays: number;
  maxLoss: number;
  currentYield: number;
  complianceScore: number;
  price: number;
}

export interface MarketplaceListingsQuery {
  type?: MarketplaceCommitmentType;
  minCompliance?: number;
  maxLoss?: number;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: string;
}

export interface FeaturedMarketplaceConfig {
  minComplianceScore: number;
  maxLoss: number;
  limit: number;
}

const MARKETPLACE_LISTING_COUNTER_KEY = 'marketplace:listings:counter';

const MOCK_LISTINGS: MarketplacePublicListing[] = [
  {
    listingId: 'LST-001',
    commitmentId: 'CMT-001',
    type: 'Safe',
    amount: 50000,
    remainingDays: 25,
    maxLoss: 2,
    currentYield: 5.2,
    complianceScore: 95,
    price: 52000,
  },
  {
    listingId: 'LST-002',
    commitmentId: 'CMT-002',
    type: 'Balanced',
    amount: 100000,
    remainingDays: 45,
    maxLoss: 8,
    currentYield: 12.5,
    complianceScore: 88,
    price: 105000,
  },
  {
    listingId: 'LST-003',
    commitmentId: 'CMT-003',
    type: 'Aggressive',
    amount: 250000,
    remainingDays: 80,
    maxLoss: 100,
    currentYield: 18.7,
    complianceScore: 76,
    price: 262000,
  },
  {
    listingId: 'LST-004',
    commitmentId: 'CMT-004',
    type: 'Safe',
    amount: 75000,
    remainingDays: 15,
    maxLoss: 2,
    currentYield: 4.8,
    complianceScore: 92,
    price: 76500,
  },
  {
    listingId: 'LST-005',
    commitmentId: 'CMT-005',
    type: 'Balanced',
    amount: 150000,
    remainingDays: 55,
    maxLoss: 8,
    currentYield: 11.3,
    complianceScore: 85,
    price: 155000,
  },
  {
    listingId: 'LST-006',
    commitmentId: 'CMT-006',
    type: 'Aggressive',
    amount: 500000,
    remainingDays: 85,
    maxLoss: 100,
    currentYield: 22.1,
    complianceScore: 72,
    price: 525000,
  },
];

const SORT_CONFIG = {
  price: { key: 'price', order: 'desc' },
  amount: { key: 'amount', order: 'desc' },
  complianceScore: { key: 'complianceScore', order: 'desc' },
  remainingDays: { key: 'remainingDays', order: 'asc' },
  maxLoss: { key: 'maxLoss', order: 'asc' },
  currentYield: { key: 'currentYield', order: 'desc' },
} as const satisfies Record<
  string,
  { key: keyof MarketplacePublicListing; order: 'asc' | 'desc' }
>;

export const FEATURED_MARKETPLACE_CONFIG: FeaturedMarketplaceConfig =
  Object.freeze({
    minComplianceScore: 85,
    maxLoss: 8,
    limit: 4,
  });

export const FEATURED_MARKETPLACE_CACHE_CONTROL =
  'public, max-age=300, s-maxage=300, stale-while-revalidate=600';

export type MarketplaceSortBy = keyof typeof SORT_CONFIG;

function getListingStorageKey(listingId: string): string {
  return `marketplace:listing:${listingId}`;
}

function getActiveListingStorageKey(commitmentId: string): string {
  return `marketplace:commitment:${commitmentId}:active-listing`;
}

function normalizeStorageError(error: unknown): InternalError {
  const normalized = error instanceof Error ? error : new Error(String(error));
  logError(
    undefined,
    '[MarketplaceService] Storage operation failed',
    normalized,
  );

  return new InternalError(
    'Marketplace storage is temporarily unavailable. Please try again later.',
  );
}

function sortListings(
  listings: MarketplacePublicListing[],
  sortBy: MarketplaceSortBy,
): MarketplacePublicListing[] {
  const { key, order } = SORT_CONFIG[sortBy];

  return [...listings].sort((a, b) => {
    const lhs = a[key] as number;
    const rhs = b[key] as number;
    return order === 'asc' ? lhs - rhs : rhs - lhs;
  });
}

export function isMarketplaceSortBy(value: string): value is MarketplaceSortBy {
  return value in SORT_CONFIG;
}

export function getMarketplaceSortKeys(): MarketplaceSortBy[] {
  return Object.keys(SORT_CONFIG) as MarketplaceSortBy[];
}

export async function listMarketplaceListings(
  query: MarketplaceListingsQuery,
): Promise<MarketplacePublicListing[]> {
  let results = MOCK_LISTINGS;

  if (query.type) {
    results = results.filter((listing) => listing.type === query.type);
  }
  if (query.minCompliance !== undefined) {
    const minCompliance = query.minCompliance;
    results = results.filter(
      (listing) => listing.complianceScore >= minCompliance,
    );
  }
  if (query.maxLoss !== undefined) {
    const maxLoss = query.maxLoss;
    results = results.filter((listing) => listing.maxLoss <= maxLoss);
  }
  if (query.minAmount !== undefined) {
    const minAmount = query.minAmount;
    results = results.filter((listing) => listing.amount >= minAmount);
  }
  if (query.maxAmount !== undefined) {
    const maxAmount = query.maxAmount;
    results = results.filter((listing) => listing.amount <= maxAmount);
  }

  const sortBy =
    query.sortBy && isMarketplaceSortBy(query.sortBy) ? query.sortBy : 'price';

  return sortListings(results, sortBy);
}

export function selectFeaturedMarketplaceListings(
  listings: readonly MarketplacePublicListing[],
  config: FeaturedMarketplaceConfig = FEATURED_MARKETPLACE_CONFIG,
): MarketplacePublicListing[] {
  return [...listings]
    .filter(
      (listing) =>
        listing.complianceScore >= config.minComplianceScore &&
        listing.maxLoss <= config.maxLoss,
    )
    .sort((left, right) => {
      if (right.complianceScore !== left.complianceScore) {
        return right.complianceScore - left.complianceScore;
      }

      if (right.currentYield !== left.currentYield) {
        return right.currentYield - left.currentYield;
      }

      if (left.price !== right.price) {
        return left.price - right.price;
      }

      return left.listingId.localeCompare(right.listingId);
    })
    .slice(0, config.limit);
}

class MarketplaceService {
  private readonly storage = getStorageAdapter();

  private async loadListing(
    listingId: string,
  ): Promise<MarketplaceListing | null> {
    try {
      return await this.storage.get<MarketplaceListing>(
        getListingStorageKey(listingId),
      );
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async createListing(
    request: CreateListingRequest,
  ): Promise<MarketplaceListing> {
    logInfo(undefined, '[MarketplaceService] Creating listing', { request });

    this.validateCreateListingRequest(request);

    try {
      const activeListingId = await this.storage.get<string>(
        getActiveListingStorageKey(request.commitmentId),
      );

      if (activeListingId) {
        const existingListing = await this.loadListing(activeListingId);

        if (existingListing?.status === 'Active') {
          throw new ConflictError(
            'Commitment is already listed on the marketplace.',
            {
              commitmentId: request.commitmentId,
              existingListingId: existingListing.id,
            },
          );
        }
      }

      const listingSequence = await this.storage.increment(
        MARKETPLACE_LISTING_COUNTER_KEY,
      );
      const listingId = `listing_${listingSequence}_${Date.now()}`;
      const now = new Date().toISOString();

      const listing: MarketplaceListing = {
        id: listingId,
        commitmentId: request.commitmentId,
        price: request.price,
        currencyAsset: request.currencyAsset,
        sellerAddress: request.sellerAddress,
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      };

      await this.storage.set(getListingStorageKey(listingId), listing);
      await this.storage.set(
        getActiveListingStorageKey(request.commitmentId),
        listingId,
      );

      logInfo(undefined, '[MarketplaceService] Listing created', { listingId });

      return listing;
    } catch (error) {
      if (error instanceof ConflictError) {
        throw error;
      }

      throw normalizeStorageError(error);
    }
  }

  async cancelListing(listingId: string, sellerAddress: string): Promise<void> {
    logInfo(undefined, '[MarketplaceService] Cancelling listing', {
      listingId,
      sellerAddress,
    });

    const listing = await this.getListing(listingId);

    if (!listing) {
      throw new NotFoundError('Listing', { listingId });
    }

    if (listing.sellerAddress !== sellerAddress) {
      throw new ValidationError('Only the seller can cancel this listing.', {
        listingId,
        expectedSeller: listing.sellerAddress,
        providedSeller: sellerAddress,
      });
    }

    if (listing.status !== 'Active') {
      throw new ConflictError('Only active listings can be cancelled.', {
        listingId,
        currentStatus: listing.status,
      });
    }

    try {
      const cancelledListing: MarketplaceListing = {
        ...listing,
        status: 'Cancelled',
        updatedAt: new Date().toISOString(),
      };

      await this.storage.set(getListingStorageKey(listingId), cancelledListing);
      await this.storage.delete(
        getActiveListingStorageKey(listing.commitmentId),
      );

      logInfo(undefined, '[MarketplaceService] Listing cancelled', { listingId });
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async getListing(listingId: string): Promise<MarketplaceListing | null> {
    return this.loadListing(listingId);
  }

  async getFeaturedListings(): Promise<MarketplacePublicListing[]> {
    return selectFeaturedMarketplaceListings(MOCK_LISTINGS);
  }

  private validateCreateListingRequest(request: CreateListingRequest): void {
    const errors: string[] = [];

    if (!request.commitmentId || typeof request.commitmentId !== 'string') {
      errors.push('commitmentId is required and must be a string');
    }

    if (!request.price || typeof request.price !== 'string') {
      errors.push('price is required and must be a string');
    } else {
      const priceNum = Number.parseFloat(request.price);
      if (Number.isNaN(priceNum) || priceNum <= 0) {
        errors.push('price must be a positive number');
      }
    }

    if (!request.currencyAsset || typeof request.currencyAsset !== 'string') {
      errors.push('currencyAsset is required and must be a string');
    }

    if (!request.sellerAddress || typeof request.sellerAddress !== 'string') {
      errors.push('sellerAddress is required and must be a string');
    }

    if (errors.length > 0) {
      throw new ValidationError('Invalid listing request', { errors });
    }
  }
}

export const marketplaceService = new MarketplaceService();
