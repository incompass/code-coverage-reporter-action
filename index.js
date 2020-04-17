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

    let coverageString = '';
    let coverageResults = {
        statements: '',
        branches: '',
        functions: '',
        lines: '',
        thresholds: true,
        report: '',
    };
    coverageJson.total.forEach((item, key) => {
        // Get all the coverage values into human readable strings
        coverageString = `${item.pct}% (${item.covered}/${item.total})`;

        // Add thumbs down and mark tests as failed if anything is below threshold
        if (item.pct < coverageThreshold)  {
            coverageResults.thresholds = false;
            coverageString = `:thumbsdown: ${coverageString}`;
        }

        // Give anything that passed 100% an extra special emoji
        if (item.pct === 100)  {
            coverageString = `:100: ${coverageString}`;
        }

        coverageResults[key] = coverageString;
    });

    // Create the markdown for the comment
    coverageResults.report = `## Code Coverage Summary
| Statements | Branch | Functions | Lines |
|---|---|---|---|
| ${coverageResults.statements} | ${coverageResults.branches} | ${coverageResults.functions} | ${coverageResults.lines}  |      
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
