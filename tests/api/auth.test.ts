import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST as verifyPOST } from '@/app/api/auth/verify/route';
import { POST as logoutPOST } from '@/app/api/auth/logout/route';
import { createMockRequest, parseResponse } from './helpers';
import { _clearStores, verifySessionToken, AUTH_COOKIE_NAME } from '@/lib/backend/auth';
import * as authUtils from '@/lib/backend/auth';

// Mock Stellar SDK because we don't want to actually verify signatures in these tests
// We'll mock the verifySignatureWithNonce function directly for simplicity
vi.mock('@/lib/backend/auth', async () => {
    const actual = await vi.importActual<typeof authUtils>('@/lib/backend/auth');
    return {
        ...actual,
        verifySignatureWithNonce: vi.fn(),
    };
});

describe('Authentication API', () => {
    beforeEach(() => {
        _clearStores();
        vi.clearAllMocks();
    });

    describe('POST /api/auth/verify', () => {
        it('should set session cookie on successful verification', async () => {
            // Setup mock
            (authUtils.verifySignatureWithNonce as any).mockReturnValue({
                valid: true,
                address: 'GBTEST123',
            });

            const request = createMockRequest('http://localhost:3000/api/auth/verify', {
                method: 'POST',
                body: {
                    address: 'GBTEST123',
                    signature: 'validsignature',
                    message: 'Sign in to CommitLabs: 12345',
                },
            });

            const response = await verifyPOST(request);
            const result = await parseResponse(response);

            expect(result.status).toBe(200);
            expect(result.data.success).toBe(true);
            expect(result.data.data.sessionToken).toBeDefined();

            // Check if cookie was set
            const setCookie = response.headers.get('set-cookie');
            expect(setCookie).toContain(AUTH_COOKIE_NAME);
            expect(setCookie).toContain(result.data.data.sessionToken);
        });

        it('should return 401 on failed verification', async () => {
            (authUtils.verifySignatureWithNonce as any).mockReturnValue({
                valid: false,
                error: 'Invalid signature',
            });

            const request = createMockRequest('http://localhost:3000/api/auth/verify', {
                method: 'POST',
                body: {
                    address: 'GBTEST123',
                    signature: 'invalid',
                    message: 'Sign in to CommitLabs: 12345',
                },
            });

            const response = await verifyPOST(request);
            const result = await parseResponse(response);

            expect(result.status).toBe(401);
            expect(result.data.success).toBe(false);
            expect(result.data.error.code).toBe('UNAUTHORIZED');
        });
    });

    describe('POST /api/auth/logout', () => {
        it('should clear session cookie and revoke session', async () => {
            // 1. Create a session first
            const token = authUtils.createSessionToken('GBTEST123');
            expect(verifySessionToken(token).valid).toBe(true);

            // 2. Call logout with the session cookie
            const request = createMockRequest('http://localhost:3000/api/auth/logout', {
                method: 'POST',
                headers: {
                    cookie: `${AUTH_COOKIE_NAME}=${token}`,
                },
            });

            const response = await logoutPOST(request);
            const result = await parseResponse(response);

            expect(result.status).toBe(200);
            expect(result.data.success).toBe(true);

            // 3. Verify session is revoked in backend
            expect(verifySessionToken(token).valid).toBe(false);

            // 4. Verify cookie is cleared in response
            const setCookie = response.headers.get('set-cookie');
            expect(setCookie).toContain(`${AUTH_COOKIE_NAME}=;`);
            // Either Max-Age=0 or an expiration in 1970 is fine
            const isCleared = setCookie?.includes('Max-Age=0') || setCookie?.includes('1970');
            expect(isCleared).toBe(true);
        });

        it('should be idempotent and return 200 even if no session exists', async () => {
            const request = createMockRequest('http://localhost:3000/api/auth/logout', {
                method: 'POST',
            });

            const response = await logoutPOST(request);
            const result = await parseResponse(response);

            expect(result.status).toBe(200);
            expect(result.data.success).toBe(true);
        });
    });
});
