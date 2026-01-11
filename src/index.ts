import * as core from '@actions/core';
import * as github from '@actions/github';
import { parseDependencyChanges } from './parsers';
import { getBreakingChanges, DependencyChange } from './api';

async function run(): Promise<void> {
    try {
        const token = core.getInput('github-token', { required: true });
        const failOnBreaking = core.getInput('fail-on-breaking') === 'true';

        const octokit = github.getOctokit(token);
        const context = github.context;

        if (!context.payload.pull_request) {
            core.info('Not a pull request, skipping');
            return;
        }

        const prNumber = context.payload.pull_request.number;
        const owner = context.repo.owner;
        const repo = context.repo.repo;
        const baseSha = context.payload.pull_request.base.sha;
        const headSha = context.payload.pull_request.head.sha;

        core.info(`Analyzing PR #${prNumber} for dependency changes...`);

        // Get the diff for dependency files
        const { data: files } = await octokit.rest.pulls.listFiles({
            owner,
            repo,
            pull_number: prNumber
        });

        const depFiles = files.filter(f =>
            f.filename === 'requirements.txt' ||
            f.filename === 'package.json' ||
            f.filename === 'pyproject.toml' ||
            f.filename.endsWith('/requirements.txt') ||
            f.filename.endsWith('/package.json')
        );

        if (depFiles.length === 0) {
            core.info('No dependency files changed');
            return;
        }

        core.info(`Found ${depFiles.length} dependency file(s) changed`);

        // Parse dependency changes
        const allChanges: DependencyChange[] = [];

        for (const file of depFiles) {
            try {
                // Get old file content
                let oldContent = '';
                try {
                    const { data: oldFile } = await octokit.rest.repos.getContent({
                        owner,
                        repo,
                        path: file.filename,
                        ref: baseSha
                    });
                    if ('content' in oldFile) {
                        oldContent = Buffer.from(oldFile.content, 'base64').toString();
                    }
                } catch {
                    // File didn't exist before
                }

                // Get new file content
                let newContent = '';
                try {
                    const { data: newFile } = await octokit.rest.repos.getContent({
                        owner,
                        repo,
                        path: file.filename,
                        ref: headSha
                    });
                    if ('content' in newFile) {
                        newContent = Buffer.from(newFile.content, 'base64').toString();
                    }
                } catch {
                    // File deleted
                }

                const changes = parseDependencyChanges(file.filename, oldContent, newContent);
                allChanges.push(...changes);
            } catch (error) {
                core.warning(`Failed to parse ${file.filename}: ${error}`);
            }
        }

        if (allChanges.length === 0) {
            core.info('No dependency version changes detected');
            return;
        }

        core.info(`Found ${allChanges.length} dependency change(s), checking for breaking changes...`);

        // Get breaking changes from Change8 API
        const breakingResults = await getBreakingChanges(allChanges);

        // Generate comment
        const comment = generateComment(breakingResults);

        if (comment) {
            // Find existing comment
            const { data: comments } = await octokit.rest.issues.listComments({
                owner,
                repo,
                issue_number: prNumber
            });

            const existingComment = comments.find(c =>
                c.body?.includes('<!-- change8-action -->')
            );

            if (existingComment) {
                await octokit.rest.issues.updateComment({
                    owner,
                    repo,
                    comment_id: existingComment.id,
                    body: comment
                });
                core.info('Updated existing comment');
            } else {
                await octokit.rest.issues.createComment({
                    owner,
                    repo,
                    issue_number: prNumber,
                    body: comment
                });
                core.info('Posted new comment');
            }

            // Fail if configured and breaking changes found
            const hasBreaking = breakingResults.some(r => r.breakingChanges.length > 0);
            if (failOnBreaking && hasBreaking) {
                core.setFailed('Breaking changes detected in dependencies');
            }
        }

    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
    }
}

interface BreakingResult {
    package: string;
    fromVersion: string;
    toVersion: string;
    breakingChanges: Array<{ change: string; fix?: string }>;
    migrationUrl: string;
}

function generateComment(results: BreakingResult[]): string | null {
    const withBreaking = results.filter(r => r.breakingChanges.length > 0);

    if (withBreaking.length === 0) {
        return null;
    }

    let comment = `<!-- change8-action -->
## 🔄 Change8 Dependency Analysis

`;

    for (const result of withBreaking) {
        comment += `### ${result.package}: ${result.fromVersion} → ${result.toVersion}\n\n`;
        comment += `⚠️ **${result.breakingChanges.length} breaking change(s) detected**\n\n`;

        if (result.breakingChanges.length <= 3) {
            comment += '| Issue | Fix |\n|-------|-----|\n';
            for (const bc of result.breakingChanges) {
                const change = bc.change.substring(0, 80) + (bc.change.length > 80 ? '...' : '');
                const fix = bc.fix ? bc.fix.substring(0, 60) + (bc.fix.length > 60 ? '...' : '') : '-';
                comment += `| ${change} | ${fix} |\n`;
            }
            comment += '\n';
        }

        comment += `📖 **[Full Migration Guide →](${result.migrationUrl})**\n\n---\n\n`;
    }

    comment += `\n<sub>Powered by [Change8](https://change8.dev) - AI-powered changelog analysis</sub>`;

    return comment;
}

run();
