import { describe, it, expect, beforeEach } from 'vitest';
import { 
  marketplaceService, 
  listMarketplaceListings, 
  isMarketplaceSortBy, 
  getMarketplaceSortKeys 
} from './marketplace';
import { ValidationError, ConflictError, NotFoundError } from '../errors';
import type { CreateListingRequest } from '@/lib/types/domain';

describe('Marketplace Functions', () => {
  describe('isMarketplaceSortBy', () => {
    it('should return true for valid sort keys', () => {
      expect(isMarketplaceSortBy('price')).toBe(true);
      expect(isMarketplaceSortBy('amount')).toBe(true);
    });

    it('should return false for invalid sort keys', () => {
      expect(isMarketplaceSortBy('invalid')).toBe(false);
    });
  });

  describe('getMarketplaceSortKeys', () => {
    it('should return all valid sort keys', () => {
      const keys = getMarketplaceSortKeys();
      expect(keys).toContain('price');
      expect(keys).toContain('amount');
      expect(keys).toContain('complianceScore');
    });
  });

  describe('listMarketplaceListings', () => {
    it('should return all listings by default', async () => {
      const listings = await listMarketplaceListings({});
      expect(listings.length).toBeGreaterThan(0);
    });

    it('should filter by type', async () => {
      const listings = await listMarketplaceListings({ type: 'Safe' });
      listings.forEach(l => expect(l.type).toBe('Safe'));
    });

    it('should filter by minCompliance', async () => {
      const listings = await listMarketplaceListings({ minCompliance: 90 });
      listings.forEach(l => expect(l.complianceScore).toBeGreaterThanOrEqual(90));
    });

    it('should filter by maxLoss', async () => {
      const listings = await listMarketplaceListings({ maxLoss: 5 });
      listings.forEach(l => expect(l.maxLoss).toBeLessThanOrEqual(5));
    });

    it('should filter by minAmount', async () => {
      const listings = await listMarketplaceListings({ minAmount: 100000 });
      listings.forEach(l => expect(l.amount).toBeGreaterThanOrEqual(100000));
    });

    it('should filter by maxAmount', async () => {
      const listings = await listMarketplaceListings({ maxAmount: 100000 });
      listings.forEach(l => expect(l.amount).toBeLessThanOrEqual(100000));
    });

    it('should sort by remainingDays ascending', async () => {
      const listings = await listMarketplaceListings({ sortBy: 'remainingDays' });
      for (let i = 0; i < listings.length - 1; i++) {
        expect(listings[i].remainingDays).toBeLessThanOrEqual(listings[i+1].remainingDays);
      }
    });
  });
});

describe('MarketplaceService', () => {
  // Reset service state before each test
  beforeEach(() => {
    // Clear internal state by creating listings and then accessing private members
    // Since we can't directly access private members, we'll work with the public API
  });

  describe('createListing', () => {
    it('should create a valid listing', async () => {
      const request: CreateListingRequest = {
        commitmentId: 'commitment_123',
        price: '1000.50',
        currencyAsset: 'USDC',
        sellerAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      };

      const listing = await marketplaceService.createListing(request);

      expect(listing).toBeDefined();
      expect(listing.id).toBeTruthy();
      expect(listing.commitmentId).toBe(request.commitmentId);
      expect(listing.price).toBe(request.price);
      expect(listing.currencyAsset).toBe(request.currencyAsset);
      expect(listing.sellerAddress).toBe(request.sellerAddress);
      expect(listing.status).toBe('Active');
      expect(listing.createdAt).toBeTruthy();
      expect(listing.updatedAt).toBeTruthy();
    });

    it('should throw ValidationError when commitmentId is missing', async () => {
      const request = {
        price: '1000.50',
        currencyAsset: 'USDC',
        sellerAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      } as CreateListingRequest;

      await expect(marketplaceService.createListing(request)).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError when price is missing', async () => {
      const request = {
        commitmentId: 'commitment_123',
        currencyAsset: 'USDC',
        sellerAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      } as CreateListingRequest;

      await expect(marketplaceService.createListing(request)).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError when price is not a positive number', async () => {
      const request: CreateListingRequest = {
        commitmentId: 'commitment_123',
        price: '-100',
        currencyAsset: 'USDC',
        sellerAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      };

      await expect(marketplaceService.createListing(request)).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError when price is zero', async () => {
      const request: CreateListingRequest = {
        commitmentId: 'commitment_123',
        price: '0',
        currencyAsset: 'USDC',
        sellerAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      };

      await expect(marketplaceService.createListing(request)).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError when price is not a valid number', async () => {
      const request: CreateListingRequest = {
        commitmentId: 'commitment_123',
        price: 'invalid',
        currencyAsset: 'USDC',
        sellerAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      };

      await expect(marketplaceService.createListing(request)).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError when currencyAsset is missing', async () => {
      const request = {
        commitmentId: 'commitment_123',
        price: '1000.50',
        sellerAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      } as CreateListingRequest;

      await expect(marketplaceService.createListing(request)).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError when sellerAddress is missing', async () => {
      const request = {
        commitmentId: 'commitment_123',
        price: '1000.50',
        currencyAsset: 'USDC',
      } as CreateListingRequest;

      await expect(marketplaceService.createListing(request)).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ConflictError when commitment is already listed', async () => {
      const request: CreateListingRequest = {
        commitmentId: 'commitment_duplicate',
        price: '1000.50',
        currencyAsset: 'USDC',
        sellerAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      };

      // Create first listing
      await marketplaceService.createListing(request);

      // Try to create duplicate listing
      await expect(marketplaceService.createListing(request)).rejects.toThrow(
        ConflictError
      );
    });
  });

  describe('cancelListing', () => {
    it('should cancel an active listing', async () => {
      const request: CreateListingRequest = {
        commitmentId: 'commitment_cancel_test',
        price: '500.00',
        currencyAsset: 'XLM',
        sellerAddress: 'GSELLERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      };

      const listing = await marketplaceService.createListing(request);

      await expect(
        marketplaceService.cancelListing(listing.id, request.sellerAddress)
      ).resolves.not.toThrow();

      // Verify listing is cancelled
      const cancelledListing = await marketplaceService.getListing(listing.id);
      expect(cancelledListing?.status).toBe('Cancelled');
    });

    it('should throw NotFoundError when listing does not exist', async () => {
      await expect(
        marketplaceService.cancelListing('nonexistent_listing', 'GXXXXXXX')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError when seller address does not match', async () => {
      const request: CreateListingRequest = {
        commitmentId: 'commitment_wrong_seller',
        price: '750.00',
        currencyAsset: 'USDC',
        sellerAddress: 'GSELLERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      };

      const listing = await marketplaceService.createListing(request);

      await expect(
        marketplaceService.cancelListing(listing.id, 'GWRONGSELLER')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ConflictError when trying to cancel a non-active listing', async () => {
      const request: CreateListingRequest = {
        commitmentId: 'commitment_already_cancelled',
        price: '300.00',
        currencyAsset: 'USDC',
        sellerAddress: 'GSELLERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      };

      const listing = await marketplaceService.createListing(request);

      // Cancel once
      await marketplaceService.cancelListing(listing.id, request.sellerAddress);

      // Try to cancel again
      await expect(
        marketplaceService.cancelListing(listing.id, request.sellerAddress)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('getListing', () => {
    it('should return a listing by ID', async () => {
      const request: CreateListingRequest = {
        commitmentId: 'commitment_get_test',
        price: '1500.00',
        currencyAsset: 'USDC',
        sellerAddress: 'GSELLERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      };

      const createdListing = await marketplaceService.createListing(request);
      const retrievedListing = await marketplaceService.getListing(createdListing.id);

      expect(retrievedListing).toBeDefined();
      expect(retrievedListing?.id).toBe(createdListing.id);
      expect(retrievedListing?.commitmentId).toBe(request.commitmentId);
    });

    it('should return null when listing does not exist', async () => {
      const listing = await marketplaceService.getListing('nonexistent_id');
      expect(listing).toBeNull();
    });
  });

  describe('getPurchasePreflight', () => {
    const sellerAddress = 'GSELLERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    const buyerAddress = 'GBUYERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

    it('should return eligible when listing is active and buyer is not seller', async () => {
      const request: CreateListingRequest = {
        commitmentId: 'commitment_preflight_ok',
        price: '100.00',
        currencyAsset: 'USDC',
        sellerAddress,
      };

      const listing = await marketplaceService.createListing(request);
      const preflight = await marketplaceService.getPurchasePreflight(listing.id, buyerAddress);

      expect(preflight.eligible).toBe(true);
      expect(preflight.reasons).toHaveLength(0);
    });

    it('should throw NotFoundError when listing does not exist', async () => {
      await expect(
        marketplaceService.getPurchasePreflight('nonexistent_id', buyerAddress)
      ).rejects.toThrow(NotFoundError);
    });

    it('should return ineligible when buyer is the seller', async () => {
      const request: CreateListingRequest = {
        commitmentId: 'commitment_preflight_seller',
        price: '100.00',
        currencyAsset: 'USDC',
        sellerAddress,
      };

      const listing = await marketplaceService.createListing(request);
      const preflight = await marketplaceService.getPurchasePreflight(listing.id, sellerAddress);

      expect(preflight.eligible).toBe(false);
      expect(preflight.reasons).toContain('buyer_is_seller');
    });

    it('should return ineligible when listing is not active', async () => {
      const request: CreateListingRequest = {
        commitmentId: 'commitment_preflight_inactive',
        price: '100.00',
        currencyAsset: 'USDC',
        sellerAddress,
      };

      const listing = await marketplaceService.createListing(request);
      await marketplaceService.cancelListing(listing.id, sellerAddress);

      const preflight = await marketplaceService.getPurchasePreflight(listing.id, buyerAddress);

      expect(preflight.eligible).toBe(false);
      expect(preflight.reasons).toContain('listing_inactive');
    });

    it('should return ineligible when commitment is non-transferable', async () => {
      const request: CreateListingRequest = {
        commitmentId: 'commitment_non-transferable_123',
        price: '100.00',
        currencyAsset: 'USDC',
        sellerAddress,
      };

      const listing = await marketplaceService.createListing(request);
      const preflight = await marketplaceService.getPurchasePreflight(listing.id, buyerAddress);

      expect(preflight.eligible).toBe(false);
      expect(preflight.reasons).toContain('non_transferable');
    });

    it('should return multiple reasons if applicable', async () => {
      const request: CreateListingRequest = {
        commitmentId: 'commitment_non-transferable_dual',
        price: '100.00',
        currencyAsset: 'USDC',
        sellerAddress,
      };

      const listing = await marketplaceService.createListing(request);
      await marketplaceService.cancelListing(listing.id, sellerAddress);

      const preflight = await marketplaceService.getPurchasePreflight(listing.id, sellerAddress);

      expect(preflight.eligible).toBe(false);
      expect(preflight.reasons).toContain('listing_inactive');
      expect(preflight.reasons).toContain('buyer_is_seller');
      expect(preflight.reasons).toContain('non_transferable');
    });
  });
});
