const { core } = require('@actions/core');
const { GitHub, context } = require('@actions/github');
const { fs } = require('fs');
const { inspect } = require('util');

const updateOrCreateComment = async (githubClient, commentId, body) => {
    const repoName = context.repo.repo;
    const repoOwner = context.repo.owner;
    const prNumber = context.issue.number;

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

const main = async () => {
    const repoName = context.repo.repo;
    const repoOwner = context.repo.owner;
    const githubToken = core.getInput('github-token');
    const prNumber = context.issue.number;
    const githubClient = new GitHub(githubToken);
    const path = core.getInput("path");



    // only comment if we have a prNumber
    if (prNumber != null) {
        const runningCommentBody = `## Code Coverage Summary`;
        const issueResponse = await githubClient.issues.listComments({
            issue_number: prNumber,
            repo        : repoName,
            owner       : repoOwner
        });

        const existingComment = issueResponse.data.find(function (comment) {
            return comment.user.type === 'Bot' && comment.body.indexOf('<p>Total Coverage: <code>') === 0;
        });

        let commentId = existingComment && existingComment.id;
        const response = await updateOrCreateComment(githubClient, commentId, runningCommentBody);

        commentId = response && response.data && response.data.id;
        const data = fs.readFileSync(
            `${process.env.GITHUB_WORKSPACE}/${inputs.path}`,
            "utf8"
        );
        const json = JSON.parse(data);

        const commentBody = `==== **Test Coverage** ====
Statements: ${json.total.statements.pct}% ( ${json.total.statements.covered}/${json.total.statements.total} )
Branches  : ${json.total.branches.pct}%   ( ${json.total.branches.covered}  /${json.total.branches.total} )
Functions : ${json.total.functions.pct}%  ( ${json.total.functions.covered} /${json.total.functions.total} )
Lines     : ${json.total.lines.pct}%      ( ${json.total.lines.covered}     /${json.total.lines.total} )`;

        await updateOrCreateComment(githubClient, commentId, commentBody);
    }
};

main().catch((error) => {
    core.debug(inspect(error));
    core.setFailed(error.message)
});
