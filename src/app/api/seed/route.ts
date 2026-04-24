import { withApiHandler } from '@/lib/backend/withApiHandler';
import { ok, methodNotAllowed } from '@/lib/backend/apiResponse';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const POST = withApiHandler(async () => {
    // Only allow this route in development mode
    if (process.env.NODE_ENV !== 'development') {
        return ok({ message: 'Not Found' }, 404);
    }

    try {
        await execAsync('npm run seed:mock');
        return ok({ message: 'Mock data seeded successfully.' }, 200);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return ok({ message: 'Failed to seed mock data', error: msg }, 500);
    }
});

const _405 = methodNotAllowed(['POST']);
export { _405 as GET, _405 as PUT, _405 as PATCH, _405 as DELETE };
