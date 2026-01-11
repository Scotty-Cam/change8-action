export interface DependencyChange {
    package: string;
    fromVersion: string;
    toVersion: string;
    ecosystem: 'npm' | 'pypi';
}

/**
 * Parse dependency changes between old and new file content.
 */
export function parseDependencyChanges(
    filename: string,
    oldContent: string,
    newContent: string
): DependencyChange[] {
    if (filename.endsWith('requirements.txt')) {
        return parseRequirementsTxt(oldContent, newContent);
    } else if (filename.endsWith('package.json')) {
        return parsePackageJson(oldContent, newContent);
    } else if (filename.endsWith('pyproject.toml')) {
        return parsePyprojectToml(oldContent, newContent);
    }
    return [];
}

/**
 * Parse requirements.txt format: package==1.0.0 or package>=1.0.0
 */
function parseRequirementsTxt(oldContent: string, newContent: string): DependencyChange[] {
    const oldDeps = parseReqLines(oldContent);
    const newDeps = parseReqLines(newContent);

    const changes: DependencyChange[] = [];

    for (const [pkg, newVersion] of Object.entries(newDeps)) {
        const oldVersion = oldDeps[pkg];
        if (oldVersion && oldVersion !== newVersion) {
            changes.push({
                package: pkg,
                fromVersion: oldVersion,
                toVersion: newVersion,
                ecosystem: 'pypi'
            });
        }
    }

    return changes;
}

function parseReqLines(content: string): Record<string, string> {
    const deps: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;

        // Match: package==1.0.0, package>=1.0.0, package~=1.0.0
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*([=~<>!]+)\s*([0-9.]+)/);
        if (match) {
            deps[match[1].toLowerCase()] = match[3];
        }
    }

    return deps;
}

/**
 * Parse package.json dependencies
 */
function parsePackageJson(oldContent: string, newContent: string): DependencyChange[] {
    const changes: DependencyChange[] = [];

    try {
        const oldPkg = oldContent ? JSON.parse(oldContent) : {};
        const newPkg = newContent ? JSON.parse(newContent) : {};

        const oldDeps = { ...oldPkg.dependencies, ...oldPkg.devDependencies };
        const newDeps = { ...newPkg.dependencies, ...newPkg.devDependencies };

        for (const [pkg, newVersionRaw] of Object.entries(newDeps)) {
            const oldVersionRaw = oldDeps[pkg];
            if (oldVersionRaw && oldVersionRaw !== newVersionRaw) {
                // Strip ^ or ~ prefix
                const oldVersion = String(oldVersionRaw).replace(/^[\^~]/, '');
                const newVersion = String(newVersionRaw).replace(/^[\^~]/, '');

                if (oldVersion !== newVersion) {
                    changes.push({
                        package: pkg,
                        fromVersion: oldVersion,
                        toVersion: newVersion,
                        ecosystem: 'npm'
                    });
                }
            }
        }
    } catch {
        // Invalid JSON
    }

    return changes;
}

/**
 * Parse pyproject.toml dependencies
 */
function parsePyprojectToml(oldContent: string, newContent: string): DependencyChange[] {
    // Simplified parser - looks for package = ">=1.0.0" patterns
    const oldDeps = parsePyprojectDeps(oldContent);
    const newDeps = parsePyprojectDeps(newContent);

    const changes: DependencyChange[] = [];

    for (const [pkg, newVersion] of Object.entries(newDeps)) {
        const oldVersion = oldDeps[pkg];
        if (oldVersion && oldVersion !== newVersion) {
            changes.push({
                package: pkg,
                fromVersion: oldVersion,
                toVersion: newVersion,
                ecosystem: 'pypi'
            });
        }
    }

    return changes;
}

function parsePyprojectDeps(content: string): Record<string, string> {
    const deps: Record<string, string> = {};

    // Match: "package>=1.0.0" or 'package>=1.0.0'
    const regex = /["']([a-zA-Z0-9_-]+)\s*([><=~!]+)\s*([0-9.]+)/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
        deps[match[1].toLowerCase()] = match[3];
    }

    return deps;
}
