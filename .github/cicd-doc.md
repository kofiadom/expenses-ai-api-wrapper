# Github Workflows

## Branching Strategy

Branching model is [Scaled Trunk-Based Development](https://trunkbaseddevelopment.com/#scaled-trunk-based-development).

![Branching and release model](https://github.com/papayaglobal/workflows/blob/main/.github/branching-and-release-model.png)
*Branching model*

There are no restrictions on branch names for integration with Jira to work propery, because [Jira wants branch name to include Jira issue key](https://support.atlassian.com/jira-cloud-administration/docs/integrate-with-development-tools/#How-it-works).

### Development flow for new releases

* Create branch from `main` into a new development branch.
* Push your code.
* (optionally) Use manual deploy workflow to deploy intermediate result to integration.
* Create a PR to `main`.
* Rebase from main if needed.
* Merge after requirments are met (PR is approved and CI/CD checks are a success).
* Wait till CI/CD creates new release and deploys it to integration automatically.
* Review deployment to integration.
* (optional) if everything's fine, go to GitHub Actions and approve deployments to staging.
* (optional) if everything's fine, go to GitHub Actions and approve deployments to demo.
* (optional) if everything's fine, go to GitHub Actions and approve deployments to production.

### Development flow for hotfixes

Hotfix (option 1):

* Create branch from latest version tag deployed to production into new hotfix branch
* Push your code.
* Use manual deploy workflow to deploy result to integration / staging / production / demo from the hotfix branch.
* Rebase from main.
* Merge after requirments are met (PR is approved and CI/CD checks are a success).

Hotfix (option 2):

* Push fix to `main`.
* Create branch from latest version tag deployed to production into new hotfix branch.
* Cherry pick hotfix commit from `main` to hotfix branch.
* Use manual deploy workflow to deploy result to integration / staging / production / demo from the hotfix branch.
* Hotfix branch doesn't need to be merged as the code is already up to date in `main`.

## Versioning

Product versions is based on [calver](https://calver.org/).

There is an option to override and use [semver](https://papayaglobal.atlassian.net/wiki/spaces/DOPS/pages/2774368279/Using+semver+instead+of+calver+in+CI+CD)

There should be a git tag for each released version.

Versions for new release (and hotfix) is calculated automatically, see [CI/CD Pipelines](#cicd-pipelines).

## CI/CD Pipelines

We use [GitHub Actions](https://docs.github.com/en/actions) workflows for CI/CD pipelines.

![GitHub Actions Worflow](https://github.com/papayaglobal/workflows/blob/main/.github/cicd-diagram.png)
*GitHub Actions Worflow*

Workflows are trigged by different events: pushing into head branch of PR to main, PR merge into main and manual trigger.

[Tests workflow](/.github/workflows/run-tests.yaml) runs on the last commit in PR branch to `main`.

[Deploy workflow](/.github/workflows/deploy.yaml) runs when PR is merged to `main`. It calculates new version, builds and pushes image to ECR, pushes version tag to main. Then it initiates deployment jobs to all environments.

[Manual deploy workflow](/.github/workflows/manual-deploy.yaml) is triggered manually from GitHub Actions UI. It builds and pushes image to ECR and Then it initiates deployment jobs to chosen environments. Useful when you want to test your code from PR before merge or when need to release a hotfix.

## GitHub Repository Settings

Default branch: `main`.

### Pull Requests Settings

* Allow merge commits.
* Allow squash merging.
* Allow rebase merging.
* Updating pull request branches is enforced.
* Allow auto-merge.
* Require Branch and PR name to include Jira issue ID.

### Branch Protection Rules for `main`

* Require a pull request before merging.
* Require approvals.
* Dismiss stale pull request approvals when new commits are pushed.
* Require status checks to pass before merging: `test`.
* Require branches to be up to date before merging.
* Require conversation resolution before merging.

### Environments protection rules

Integration: no approvers required.

Staging: requires approval from stg-approvers that are set for this repo specifically through cloud-infra repository.

Production: requires approval from prod-approvers that are set for this repo specifically through cloud-infra repository.

### Interested in adding more of your services to the new CI/CD?

Follow the following guide: https://papayaglobal.atlassian.net/wiki/spaces/PR/pages/2671968268/How+to+self+onboard+to+the+new+CI+CD+process.
