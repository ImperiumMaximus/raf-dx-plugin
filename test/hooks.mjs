import pkgAuth from 'salesforce-alm/dist/commands/force/auth/jwt/grant.js';
const { AuthJwtGrantCommand } = pkgAuth;
import pkgCreate from 'salesforce-alm/dist/commands/force/org/create.js';
const { OrgCreateCommand } = pkgCreate;
import pkgDelete from 'salesforce-alm/dist/commands/force/org/delete.js';
const { OrgDeleteCommand } = pkgDelete;
import pkgDeploy from 'salesforce-alm/dist/commands/force/source/deploy.js';
const { SourceDeployCommand } = pkgDeploy;


export const mochaHooks = {
  beforeAll: [
    async function () {
      const authArgs = ['--clientid', process.env.CONSUMER_KEY, '--username', process.env.DEVORG_USERNAME, '--jwtkeyfile', process.env.JWT_KEY_FILE, '--setdefaultdevhubusername']
      const authOutput = await AuthJwtGrantCommand.run(authArgs)

      if (!authOutput.orgId) {
        throw Error(`Can't login to ${process.env.DEVORG_USERNAME}`)
      }

      process.env.SCRATCH_ORG_NAME = `testScratchOrg${Math.floor(Date.now() / 1000)}`
      const orgCreateArgs = ['edition=Developer', '-a', process.env.SCRATCH_ORG_NAME, '-s', '-d', '1']
      await OrgCreateCommand.run(orgCreateArgs)

      const deployArgs = ['-p', 'test/data/force-app']
      await SourceDeployCommand.run(deployArgs)
    }
  ],

  afterAll: [
    async function () {
      const deleteArgs = ['-u', process.env.SCRATCH_ORG_NAME, '-p']
      await OrgDeleteCommand.run(deleteArgs)
    }
  ]
}
