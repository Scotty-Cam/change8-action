import { DependencyChange } from './parsers';

const CHANGE8_API = 'https://api.change8.dev/api/v1';

// Service key is optional - set via CHANGE8_SERVICE_KEY env var or action input
let serviceKey: string | undefined;

export function setServiceKey(key: string | undefined) {
    serviceKey = key;
}

function getHeaders(): HeadersInit {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };
    if (serviceKey) {
        headers['Authorization'] = `Bearer ${serviceKey}`;
    }
    return headers;
}

interface BreakingChange {
    change: string;
    fix?: string;
}

export interface BreakingResult {
    package: string;
    fromVersion: string;
    toVersion: string;
    breakingChanges: BreakingChange[];
    migrationUrl: string;
}

export { DependencyChange };

/**
 * Get breaking changes for a list of dependency updates.
 */
export async function getBreakingChanges(changes: DependencyChange[]): Promise<BreakingResult[]> {
    const results: BreakingResult[] = [];

    for (const change of changes) {
        try {
            const result = await getBreakingChangesForPackage(change);
            results.push(result);
        } catch (error) {
            console.warn(`Failed to get breaking changes for ${change.package}: ${error}`);
            // Still include in results with empty breaking changes
            results.push({
                package: change.package,
                fromVersion: change.fromVersion,
                toVersion: change.toVersion,
                breakingChanges: [],
                migrationUrl: buildMigrationUrl(change.package, change.toVersion)
            });
        }
    }

    return results;
}

async function getBreakingChangesForPackage(change: DependencyChange): Promise<BreakingResult> {
    // Map common package names to Change8 source IDs
    const sourceId = mapPackageToSourceId(change.package);

    // Use correct /diff endpoint with proper query params
    const url = `${CHANGE8_API}/diff?package=${encodeURIComponent(sourceId)}&from=${encodeURIComponent(change.fromVersion)}&to=${encodeURIComponent(change.toVersion)}`;

    try {
        const response = await fetch(url, { headers: getHeaders() });

        if (!response.ok) {
            // Try getting releases for the target version instead
            return await getBreakingChangesFromRelease(change, sourceId);
        }

        const data = await response.json() as { breaking_changes?: BreakingChange[] };

        return {
            package: change.package,
            fromVersion: change.fromVersion,
            toVersion: change.toVersion,
            breakingChanges: data.breaking_changes || [],
            migrationUrl: buildMigrationUrl(sourceId, change.toVersion)
        };
    } catch {
        return await getBreakingChangesFromRelease(change, sourceId);
    }
}

async function getBreakingChangesFromRelease(change: DependencyChange, sourceId: string): Promise<BreakingResult> {
    // Fallback: get the specific release
    const url = `${CHANGE8_API}/releases?source=${encodeURIComponent(sourceId)}&limit=50`;

    const response = await fetch(url, { headers: getHeaders() });

    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }

    const releases = await response.json() as Array<{ tag: string; breaking_changes?: unknown[] }>;

    // Find release matching target version
    const targetRelease = releases.find((r) => {
        const tagVersion = r.tag.includes('==') ? r.tag.split('==')[1] : r.tag.replace(/^v/, '');
        return tagVersion === change.toVersion || tagVersion === `v${change.toVersion}`;
    });

    const breakingChanges: BreakingChange[] = [];

    if (targetRelease?.breaking_changes) {
        for (const bc of targetRelease.breaking_changes) {
            if (typeof bc === 'string') {
                breakingChanges.push({ change: bc });
            } else if (bc && typeof bc === 'object') {
                const bcObj = bc as { change?: string; description?: string; fix?: string };
                breakingChanges.push({
                    change: bcObj.change || bcObj.description || JSON.stringify(bc),
                    fix: bcObj.fix
                });
            }
        }
    }

    return {
        package: change.package,
        fromVersion: change.fromVersion,
        toVersion: change.toVersion,
        breakingChanges,
        migrationUrl: buildMigrationUrl(sourceId, change.toVersion)
    };
}

function mapPackageToSourceId(packageName: string): string {
    // Common mappings
    const mappings: Record<string, string> = {
        'langchain': 'langchain',
        'langchain-core': 'langchain',
        'langchain-openai': 'langchain',
        'langchain-community': 'langchain',
        'next': 'next-js',
        'react': 'react',
        'pydantic': 'pydantic',
        'fastapi': 'fastapi',
        'pytorch': 'pytorch',
        'torch': 'pytorch',
        'transformers': 'transformers',
        'openai': 'openai-python-sdk',
        'typescript': 'typescript',
        'vite': 'vite',
        'prisma': 'prisma',
        'tailwindcss': 'tailwind-css',
    };

    return mappings[packageName.toLowerCase()] || packageName.toLowerCase();
}

function buildMigrationUrl(sourceId: string, version: string): string {
    // Clean version - remove v prefix if present
    const cleanVersion = version.replace(/^v/, '');
    return `https://www.change8.dev/guides/${sourceId}/migrating-to-${cleanVersion}`;
}
