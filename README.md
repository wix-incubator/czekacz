# Čekač / Чекач / Waiter

[Probot app](https://probot.github.io/) for maintaining a healthy user-maintainer feedback loop.

Mostly, it is based off [probot/no-response](https://github.com/probot/no-response) application.

![logo](docs/img/logo.png)

## Bot Workflow

The intent of this bot is to close issues that have not received a response to a maintainer's request for more information.
Many times issues will be filed without enough information to be properly investigated.
This allows maintainers to label an issue as requiring more information from the original author.
If the information is not received in a timely manner, the issue will be closed.
If the original author comes back and gives more information, the label is replaced with another one (maintainer attention
required) and the issue is reopened if necessary.
The original repo would just delete the label, but this form alternates labels instead.

### Scheduled

Once per hour, it searches for issues that are:

* Open
* Have a label named the same as the `responseRequiredLabel` value in the configuration
* The `responseRequiredLabel` was applied more than `daysUntilClose` ago

For each issue found, it:

1. If `closeComment` is not `false`, posts the contents of `closeComment`
1. Closes the issue

### `issue_comment` Event

When an `issue_comment` event is received.

#### Case 1

If all of the following are true:
* The author of the comment is the original author of the issue
* The issue has a label named the same as the `responseRequiredLabel` value in the configuration

It will:

1. Remove the `responseRequiredLabel`
1. Reopen the issue if it was closed by someone other than the original author of the issue

#### Case 2

If all of the following are true:

* The author of the comment is the mainter of the repository
* The issue has a label named the same as the `maintainerReactionRequiredLabel` value in the configuration

It will:

1. Remove the `maintainerReactionRequiredLabel`.
1. If the issue is not closed, it will add again a `responseRequiredLabel`.

## Usage

1. **[Configure the GitHub App](https://github.com/apps/czekacz)**
2. Create `.github/czekacz.yml`

A `.github/czekacz.yml` file is required to enable the app. The file can be empty, or it can override any of these default settings:

```yml
# Configuration for probot-czekacz - https://github.com/wix-incubator/czekacz

# Number of days of inactivity before an Issue is closed for lack of response
daysUntilClose: 14
# Label requiring a response
responseRequiredLabel: more-information-needed
# Label requiring a reaction from maintainer
maintainerReactionRequiredLabel: waiting-for-maintainer
# Comment to post when closing an Issue for lack of response. Set to `false` to disable
closeComment: >
  This issue has been automatically closed because there has been no response
  to our request for more information from the original author. With only the
  information that is currently in the issue, we don't have enough information
  to take action. Please reach out if you have or find the answers we need so
  that we can investigate further.
```

See [docs/deploy.md](docs/deploy.md) if you would like to run your own instance of this app.
