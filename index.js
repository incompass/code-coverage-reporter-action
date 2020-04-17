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

const createCoverage = (coverageThreshold) => {
    const path = core.getInput('summary-path');
    let coverageResults = {
        thresholds: true,
        report: '',
    };

    const data = fs.readFileSync(
        `${process.env.GITHUB_WORKSPACE}/${path}`,
        "utf8"
    );
    const coverageJson = JSON.parse(data);

    let statements = `${coverageJson.total.statements.pct}% (${coverageJson.total.statements.covered}/${coverageJson.total.statements.total})`;
    let branches = `${coverageJson.total.branches.pct}% (${coverageJson.total.branches.covered}/${coverageJson.total.branches.total})`;
    let functions = `${coverageJson.total.functions.pct}% (${coverageJson.total.functions.covered}/${coverageJson.total.functions.total})`;
    let lines = `${coverageJson.total.lines.pct}% (${coverageJson.total.lines.covered}/${coverageJson.total.lines.total})`;

    // Failed Threshold
    if (coverageJson.total.statements.pct < coverageThreshold)  {
        coverageResults.thresholds = false;
        statements = `:thumbsdown: ${statements}`;
    }
    if (coverageJson.total.branches.pct < coverageThreshold)  {
        coverageResults.thresholds = false;
        branches = `:thumbsdown: ${branches}`;
    }
    if (coverageJson.total.functions.pct < coverageThreshold)  {
        coverageResults.thresholds = false;
        functions = `:thumbsdown: ${functions}`;
    }
    if (coverageJson.total.lines.pct < coverageThreshold)  {
        coverageResults.thresholds = false;
        lines = `:thumbsdown: ${lines}`;
    }

    // Perfect 100%
    if (coverageJson.total.statements.pct === 100)  {
        statements = `:100: ${statements}`;
    }
    if (coverageJson.total.branches.pct === 100)  {
        branches = `:100: ${branches}`;
    }
    if (coverageJson.total.functions.pct === 100)  {
        functions = `:100: ${functions}`;
    }
    if (coverageJson.total.lines.pct === 100)  {
        lines = `:100: ${lines}`;
    }

    coverageResults.report = `## Code Coverage Summary
| Statements | Branch | Functions | Lines |
|---|---|---|---|
| ${statements} | ${branches} | ${functions} | ${lines}  |      
`;

    return coverageResults;
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

        let coverageResults;
        switch (testFramework) {
            case 'karma':
                coverageResults = createCoverage(coverageThreshold);
                break;

            case 'jest':
                const testCommand = core.getInput('test-command') || 'npx jest --coverage';
                child_process.execSync(testCommand);
                coverageResults = createCoverage(coverageThreshold);
                break;

            default:
                coverageResults = {
                    thresholds: true,
                    report:  `Framework ${testFramework} not supported, sorry!`,
                };
                break;
        }
        const commentBody = coverageResults.report;

        await updateOrCreateComment(githubClient, commentId, commentBody);

        if (!coverageResults.thresholds) {
            core.setFailed('Your Code Coverage was below the threshold');
        }
    }
};

main().catch((error) => {
    core.debug(util.inspect(error));
    core.setFailed(error.message)
});
