const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const util = require('util');

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
    }

    await githubClient.issues.createComment({
        repo: repoName,
        owner: repoOwner,
        body: body,
        issue_number: prNumber,
    });
};

const createKarmaCoverage = () => {
    const path = core.getInput('summary-path');

    const data = fs.readFileSync(
        `${process.env.GITHUB_WORKSPACE}/${path}`,
        "utf8"
    );
    const coverageJson = JSON.parse(data);

    const statements = `${coverageJson.total.statements.pct}% (${coverageJson.total.statements.covered}/${coverageJson.total.statements.total})`.padStart(14, ' ');
    const branches = `${coverageJson.total.branches.pct}% (${coverageJson.total.branches.covered}/${coverageJson.total.branches.total})`.padStart(14, ' ');
    const functions = `${coverageJson.total.functions.pct}% (${coverageJson.total.functions.covered}/${coverageJson.total.functions.total})`.padStart(14, ' ');
    const lines = `${coverageJson.total.lines.pct}% (${coverageJson.total.lines.covered}/${coverageJson.total.lines.total})`.padStart(14, ' ');

    return `## Code Coverage Summary
\`\`\`
---------------|---------------|---------------|---------------
    % Stmts    |    % Branch   |    % Funcs    |    % Lines  
---------------|---------------|---------------|---------------
${statements} | ${branches} | ${functions} | ${lines}                
---------------|---------------|---------------|---------------
\`\`\``;
};

const main = async () => {
    const repoName = github.context.repo.repo;
    const repoOwner = github.context.repo.owner;
    const githubToken = core.getInput('github-token');
    const prNumber = github.context.issue.number;
    const githubClient = new github.GitHub(githubToken);

    // Only comment if we have a PR Number
    if (prNumber != null) {
        const runningCommentBody = `## Code Coverage Summary`;
        const issueResponse = await githubClient.issues.listComments({
            issue_number: prNumber,
            repo: repoName,
            owner: repoOwner
        });

        const existingComment = issueResponse.data.find(function (comment) {
            return comment.user.type === 'Bot' && comment.body.indexOf('<h2>Code Coverage Summary</h2>') !== false;
        });
        let commentId = existingComment && existingComment.id;
        const response = await updateOrCreateComment(githubClient, commentId, runningCommentBody);

        commentId = response && response.data && response.data.id;
        const commentBody = createKarmaCoverage();

        await updateOrCreateComment(githubClient, commentId, commentBody);
    }
};

main().catch((error) => {
    core.debug(util.inspect(error));
    core.setFailed(error.message)
});
