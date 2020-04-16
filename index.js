const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const util = require('util');
const child_process = require('child_process');

const updateOrCreateComment = async (githubClient, commentId, body) => {
    const repoName = github.context.repo.repo;
    const repoOwner = github.context.repo.owner;
    const prNumber = github.context.issue.number;

    if (commentId) {
        await githubClient.issues.updateComment({
            issue_number: prNumber,
            comment_id: commentId,
            repo: repoName,
            owner: repoOwner,
            body: body,
        });
    } else {
        await githubClient.issues.createComment({
            repo: repoName,
            owner: repoOwner,
            body: body,
            issue_number: prNumber,
        });
    }
};

const createKarmaCoverage = (coverageThreshold) => {
    const path = core.getInput('karma-summary-path');

    const data = fs.readFileSync(
        `${process.env.GITHUB_WORKSPACE}/${path}`,
        "utf8"
    );
    const coverageJson = JSON.parse(data);

    const statements = `${coverageJson.total.statements.pct}% (${coverageJson.total.statements.covered}/${coverageJson.total.statements.total})`;
    const branches = `${coverageJson.total.branches.pct}% (${coverageJson.total.branches.covered}/${coverageJson.total.branches.total})`;
    const functions = `${coverageJson.total.functions.pct}% (${coverageJson.total.functions.covered}/${coverageJson.total.functions.total})`;
    const lines = `${coverageJson.total.lines.pct}% (${coverageJson.total.lines.covered}/${coverageJson.total.lines.total})`;

    if (
        coverageJson.total.statements.pct < coverageThreshold ||
        coverageJson.total.branches.pct < coverageThreshold ||
        coverageJson.total.functions.pct < coverageThreshold ||
        coverageJson.total.lines.pct < coverageThreshold
    ) {
        core.setFailed('Your Code Coverage was below the threshold');
    }

    return `## Code Coverage Summary
|    % Stmts    |    % Branch   |    % Funcs    |    % Lines    |
|---|---|---|---|
| ${statements} | ${branches} | ${functions} | ${lines}         |      
`;
};

const createJestCoverage = (coverageThreshold) => {
    const testCommand = core.getInput('test-command') || 'npx jest --coverage';
    const codeCoverage = child_process.execSync(testCommand).toString();
    return `## Code Coverage Summary
\`\`\`${codeCoverage}\`\`\``;
};

const main = async () => {
    const repoName = github.context.repo.repo;
    const repoOwner = github.context.repo.owner;
    const githubToken = core.getInput('github-token');
    const prNumber = github.context.issue.number;
    const githubClient = new github.GitHub(githubToken);
    const testFramework = core.getInput('test-framework');
    const coverageThreshold = parseInt(core.getInput('passing-threshold') || '80');

    // Only comment if we have a PR Number
    if (prNumber != null) {
        const issueResponse = await githubClient.issues.listComments({
            issue_number: prNumber,
            repo: repoName,
            owner: repoOwner
        });

        const existingComment = issueResponse.data.find(function (comment) {
            return comment.user.type === 'Bot' && comment.body.indexOf('## Code Coverage Summary') === 0;
        });

        let commentId = false;
        if (existingComment && existingComment.id) {
            commentId = existingComment.id;
        }

        let commentBody = '';
        switch (testFramework) {
            case 'karma':
                commentBody = createKarmaCoverage(coverageThreshold);
                break;

            case 'jest':
                commentBody = createJestCoverage(coverageThreshold);
                break;

            default:
                commentBody = `Framework ${testFramework} not supported, sorry!`;
                break;
        }

        await updateOrCreateComment(githubClient, commentId, commentBody);
    }
};

main().catch((error) => {
    core.debug(util.inspect(error));
    core.setFailed(error.message)
});
