import { NextRequest, NextResponse } from 'next/server';
import { withApiHandler } from '@/lib/backend/withApiHandler';
import { verifySessionToken, revokeSessionToken } from '@/lib/backend/auth';
import { UnauthorizedError } from '@/lib/backend/errors';

export const POST = withApiHandler(async (req: NextRequest) => {
    // Get session token from cookie
    const sessionToken = req.cookies.get('session')?.value;
    
    if (!sessionToken) {
        throw new UnauthorizedError('No session token provided');
    }
    
    // Verify and revoke the session token
    const verification = verifySessionToken(sessionToken);
    if (!verification.valid) {
        throw new UnauthorizedError(verification.error || 'Invalid session token');
    }
    
    revokeSessionToken(sessionToken);
    
    // Create response that clears cookies
    const response = NextResponse.json({
        loggedOut: true,
        message: 'Session terminated successfully',
    });
    
    // Clear session cookie
    response.cookies.set('session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 0, // Immediately expire
        path: '/',
    });
    
    // Clear CSRF cookie
    response.cookies.set('csrf', '', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 0, // Immediately expire
        path: '/',
    });
    
    return response;
});
