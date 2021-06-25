const scramjet = require('scramjet')

module.exports = class NoResponse {
  constructor (context, config, logger) {
    this.context = context
    this.github = context.github
    this.config = config
    this.logger = logger
  }

  async sweep () {
    this.logger.debug('Starting sweep')

    await this.ensureLabelExists(this.context.repo({
      name: this.config.responseRequiredLabel,
      color: this.config.responseRequiredColor
    }))

    await this.ensureLabelExists(this.context.repo({
      name: this.config.collaboratorReactionRequiredLabel,
      color: this.config.collaboratorReactionRequiredColor
    }))

    const issues = await this.getClosableIssues()
    issues.forEach(issue => this.close(this.context.repo({number: issue.number})))
  }

  async unmark (issue) {
    const {perform, responseRequiredLabel, collaboratorReactionRequiredLabel} = this.config
    const {owner, repo, number} = issue
    const comment = this.context.payload.comment

    const performWet = async (message, action) => {
      if (perform) {
        this.logger.info('%s/%s#%d ' + message, owner, repo, number)
        await action()
      } else {
        this.logger.info('%s/%s#%d [SKIP] ' + message, owner, repo, number)
      }
    }

    const { data: issueInfo } = await this.github.issues.get(issue)
    const { responseRequired, collaboratorReactionRequired } = await this.getRelevantLabels(issue)
    const isOriginalPoster = issueInfo.user.login === comment.user.login
    const hasReplyFromOriginalPoster = responseRequired && isOriginalPoster
    const hasReplyFromCollaborator = collaboratorReactionRequired && !isOriginalPoster && await this.isCollaborator(issue, comment.user.login)

    if (hasReplyFromOriginalPoster) {
      await performWet('got an original poster response, now removing label', async () => {
        await this.github.issues.removeLabel({owner, repo, number, name: responseRequiredLabel})
      })

      if (issueInfo.state === 'closed') {
        if (issueInfo.user.login !== issueInfo.closed_by.login) {
          await performWet('reopening issue assuming it was a late original poster response', async () => {
            await this.github.issues.edit({ owner, repo, number, state: 'open' })
          })
        }
      } else {
        await performWet('adding a label requiring a reaction from collaborators', async () => {
          await this.github.issues.addLabels({ owner, repo, number, labels: [collaboratorReactionRequiredLabel] })
        })
      }
    }

    if (hasReplyFromCollaborator) {
      await performWet('got a collaborator response, now removing label', async () => {
        await this.github.issues.removeLabel({ owner, repo, number, name: collaboratorReactionRequiredLabel })
      })

      if (issueInfo.state !== 'closed') {
        await performWet('now needs an original poster response again, adding a label', async () => {
          await this.github.issues.addLabels({ owner, repo, number, labels: [responseRequiredLabel] })
        })
      }
    }
  }

  async close (issue) {
    const {closeComment, perform} = this.config

    if (perform) {
      this.logger.info('%s/%s#%d is being closed', issue.owner, issue.repo, issue.number)
      if (closeComment) {
        await this.github.issues.createComment(Object.assign({}, issue, {body: closeComment}))
      }
      return this.github.issues.edit(Object.assign({}, issue, {state: 'closed'}))
    } else {
      this.logger.info('%s/%s#%d would have been closed (dry-run)', issue.owner, issue.repo, issue.number)
    }
  }

  async ensureLabelExists ({name, color}) {
    return this.github.issues.getLabel(this.context.repo({name})).catch(() => {
      return this.github.issues.createLabel(this.context.repo({name, color}))
    })
  }

  async findLastLabeledEvent (owner, repo, number) {
    const {responseRequiredLabel} = this.config
    const params = {owner, repo, issue_number: number, per_page: 100}
    const events = await this.github.paginate(this.github.issues.getEvents(params))
    return events[0].data.reverse()
                 .find(event => event.event === 'labeled' && event.label.name === responseRequiredLabel)
  }

  async getClosableIssues () {
    const {owner, repo} = this.context.repo()
    const {daysUntilClose, responseRequiredLabel} = this.config
    const q = `repo:${owner}/${repo} is:issue is:open label:"${responseRequiredLabel}"`
    const params = {q, sort: 'updated', order: 'desc', per_page: 30}
    const labeledEarlierThan = this.since(daysUntilClose)

    const issues = await this.github.search.issues(params)
    const closableIssues = scramjet.fromArray(issues.data.items).filter(async issue => {
      const event = await this.findLastLabeledEvent(owner, repo, issue.number)
      const creationDate = new Date(event.created_at)

      return creationDate < labeledEarlierThan
    }).toArray()
    return closableIssues
  }

  async getRelevantLabels (issue) {
    const labels = await this.github.issues.getIssueLabels(issue)
    const labelNames = labels.data.map(label => label.name)

    return {
      responseRequired: labelNames.includes(this.config.responseRequiredLabel),
      collaboratorReactionRequired: labelNames.includes(this.config.collaboratorReactionRequiredLabel)
    }
  }

  async isCollaborator ({owner, repo}, username) {
    return this.github.repos.checkCollaborator({ owner, repo, username })
      .then(() => true, () => false)
  }

  since (days) {
    const ttl = days * 24 * 60 * 60 * 1000
    return new Date(new Date() - ttl)
  }
}
