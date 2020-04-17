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

const createCoverage = () => {
    // Check this is a supported framework
    const testFramework = core.getInput('test-framework');
    if (!['jest', 'karma'].includes(testFramework)) {
        return {
            thresholds: true,
            report:  `Framework ${testFramework} not supported, sorry!`,
        };
    }

    const path = core.getInput('summary-path');
    const coverageThreshold = parseInt(core.getInput('passing-threshold') || '80');
    const testCommand = core.getInput('test-command');

    // Run the test suite with coverage
    child_process.execSync(testCommand);

    // Read the coverage report
    const data = fs.readFileSync(
        `${process.env.GITHUB_WORKSPACE}/${path}`,
        "utf8"
    );
    const coverageJson = JSON.parse(data);

    // Get all the coverage values into human readable strings
    let statements = `${coverageJson.total.statements.pct}% (${coverageJson.total.statements.covered}/${coverageJson.total.statements.total})`;
    let branches = `${coverageJson.total.branches.pct}% (${coverageJson.total.branches.covered}/${coverageJson.total.branches.total})`;
    let functions = `${coverageJson.total.functions.pct}% (${coverageJson.total.functions.covered}/${coverageJson.total.functions.total})`;
    let lines = `${coverageJson.total.lines.pct}% (${coverageJson.total.lines.covered}/${coverageJson.total.lines.total})`;

    let coverageResults = {
        thresholds: true,
        report: '',
    };

    // Add thumbs down and mark tests as failed if anything is below threshold
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

    // Give anything that passed 100% an extra special emoji
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

    // Create the markdown for the comment
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

    // Only comment if we have a PR Number
    if (prNumber != null) {
        // Get all the existing PR comments
        const issueResponse = await githubClient.issues.listComments({
            issue_number: prNumber,
            repo: repoName,
            owner: repoOwner
        });

        // Find the first comment that starts with '## Code Coverage Summary'
        const existingComment = issueResponse.data.find(function (comment) {
            return comment.user.type === 'Bot' && comment.body.indexOf('## Code Coverage Summary') === 0;
        });

        // If we find a comment, get the id
        let commentId = false;
        if (existingComment && existingComment.id) {
            commentId = existingComment.id;
        }

        // Create the coverage comment markdown
        const coverageResults = createCoverage();
        const commentBody = coverageResults.report;

        await updateOrCreateComment(githubClient, commentId, commentBody);

        // Fail the step if the thresholds were not met
        if (!coverageResults.thresholds) {
            core.setFailed('Your Code Coverage was below the threshold');
        }
    }
};

main().catch((error) => {
    core.debug(util.inspect(error));
    core.setFailed(error.message)
});
