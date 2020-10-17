import pkgAuth from 'salesforce-alm/dist/commands/force/auth/jwt/grant.js';
const { AuthJwtGrantCommand } = pkgAuth;
import pkgCreate from 'salesforce-alm/dist/commands/force/org/create.js';
const { OrgCreateCommand } = pkgCreate;
import pkgLimitsDisplay from 'salesforce-alm/dist/commands/force/limits/api/display.js';
const { LimitsApiDisplayCommand } = pkgLimitsDisplay;
import pkgDeploy from 'salesforce-alm/dist/commands/force/source/deploy.js';
const { SourceDeployCommand } = pkgDeploy;
import pkgSoql from 'salesforce-alm/dist/commands/force/data/soql/query.js';
const { DataSoqlQueryCommand } = pkgSoql;
import pkgRecordDelete from 'salesforce-alm/dist/commands/force/data/record/delete.js';
const { DataRecordDeleteCommand } = pkgRecordDelete;
import pkgRecordCreate from 'salesforce-alm/dist/commands/force/data/record/create.js';
const { DataRecordCreateCommand } = pkgRecordCreate;
import pkgRecordUpdate from 'salesforce-alm/dist/commands/force/data/record/update.js';
const { DataRecordUpdateCommand } = pkgRecordUpdate;
import pkgDeployReport from 'salesforce-alm/dist/commands/force/mdapi/deploy/report.js';
const { MdapiDeployReportCommand } = pkgDeployReport;
import pkgOrgDisplay from 'salesforce-alm/dist/commands/force/org/display.js';
const { OrgDisplayCommand } = pkgOrgDisplay
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as xml2js from 'xml2js';
import * as fs from 'fs';
import * as rimraf from "rimraf";

export const mochaHooks = {
  beforeAll: [
    async function () {
      const authOutput = await AuthJwtGrantCommand.run(['--clientid', process.env.CONSUMER_KEY, '--username', process.env.DEVORG_USERNAME, '--jwtkeyfile', process.env.JWT_KEY_FILE, '--setdefaultdevhubusername'])

      if (!authOutput.orgId) {
        throw Error(`Can't login to ${process.env.DEVORG_USERNAME}`)
      }

      let soqlOutput = await DataSoqlQueryCommand.run(['-u', process.env.DEVORG_USERNAME, '-q', 'SELECT ConsumerKey__c, SignupUsername FROM ActiveScratchOrg WHERE ConsumerKey__c != null', '--json'])
      console.log(soqlOutput)
      let scratchOrgName = ''
      if (soqlOutput && soqlOutput.done && soqlOutput.totalSize) {
        // let's check if we have an active scratch org free in this DevHub.
        // This is tricky as we have to deal also with possible concurrency.
        // In particular, in the case that an active scratch org has a pending
        // deployment that is setting the TestInProgress__c flag to true,
        // that would be detected as a free one which actually it isn't
        for (let record of soqlOutput.records) {
          // Peform Login via JWT to Scratch Org
          const scratchAuthOutput = await AuthJwtGrantCommand.run(['--clientid', record.ConsumerKey__c, '--username', record.SignupUsername, '--jwtkeyfile', process.env.JWT_KEY_FILE])

          if (!scratchAuthOutput.orgId) {
            throw Error(`Can't login to ${record.SignupUsername}`)
          }

          // Check if there's a deployment id set in this org indicating an ongoing deployment
          const deploymentIdQueryOutput = await DataSoqlQueryCommand.run(['-u', record.SignupUsername, '-q', `SELECT Name FROM Account WHERE Site='raf-dx-plugin-testsuite'`, '--json'])
          if (deploymentIdQueryOutput && deploymentIdQueryOutput.done && !deploymentIdQueryOutput.totalSize) {
            // scratch org has not ongoing deployments, let's see if tests are running
            const testsStatusQueryOutput = await DataSoqlQueryCommand.run(['-u', record.SignupUsername, '-q', 'SELECT count() FROM TestInProgress__mdt WHERE InProgress__c=TRUE', '--json'])
            if (testsStatusQueryOutput && testsStatusQueryOutput.done && !testsStatusQueryOutput.totalSize) {
              // we found a usable scratch org!
              console.log(`Found existing scratch org with username ${record.SignupUsername} that will be used for test execution.`)
              scratchOrgName = record.SignupUsername;
              break
            }
          }
        }
      }

      let created = false
      let consumerKey = ''
      if (scratchOrgName === '') {
        // Okay we didn't find one active free scratch org, let's see if we have space to allocate a new one...
        const apiLimitsOutput = await LimitsApiDisplayCommand.run(['-u', process.env.DEVORG_USERNAME, '--json'])
        for (const apiLimit of apiLimitsOutput) {
          if (apiLimit.name === 'ActiveScratchOrgs' && !apiLimit.remaining) {
            throw Error(`Maximum number of Active Scratch Orgs reached for this DevHub (${apiLimit.max})`)
          } else if (apiLimit.name === 'ActiveScratchOrgs') {
            break;
          }
        }
        console.log(`No existing scratch orgs found. Allocating a new one...`)
        scratchOrgName = `testScratchOrg${Math.floor(Date.now() / 1000)}`
        // it's fine to extend expiration date as far in the future as we can,
        // because sometimes Salesforce takes ages (I've seen taking 15 mins in an instance)
        // to provision new scratch orgs
        const orgCreateArgs = ['edition=Developer', '-a', scratchOrgName, '-s', '-d', '30', '-w', '30']
        await OrgCreateCommand.run(orgCreateArgs)
        created = true
      }

      if (scratchOrgName === '') {
        // We don't have space, we bail out :( Better luck next time!
        throw Error(`Can't find a free scratch org to allocate for testing on DevHub ${process.env.DEVORG_USERNAME}`)
      }

      // Deploy starting package to be used for testing
      // package contains ConnectedApp for JWT login also in scrath orgs.
      // In case of a new scratch org, ConnectedApp metadata needs to be
      // patched with a fresh consumer key that will be saved in DevHub Org
      // othwerise we just skip the specific file while copying the package
      // structure to a temporary directory
      console.log('Deploying test package to scratch org...')
      const tmpForceAppDirName = `force-app-${Math.floor(Date.now() / 1000)}`
      await fsExtra.default.ensureDir(`test/data/raf-dx-plugin-devorg/${tmpForceAppDirName}`)
      await fsExtra.default.copy('test/data/raf-dx-plugin-devorg/force-app', `test/data/raf-dx-plugin-devorg/${tmpForceAppDirName}`, { filter: p => {
        return path.basename(p) !== 'SFDXRafPlugin.connectedApp-meta.xml' || created
      }})

      // patch ConnectedApp metadata with new ConsumerKey
      if (created) {
        const connectedAppFile = `test/data/raf-dx-plugin-devorg/${tmpForceAppDirName}/main/default/connectedApps/SFDXRafPlugin.connectedApp-meta.xml`
        let connectedAppMdata = await parseXml(connectedAppFile)
        consumerKey = getConsumerSecret()
        connectedAppMdata.ConnectedApp.oauthConfig[0].consumerKey[0] = consumerKey;
        await writeXml(connectedAppFile, connectedAppMdata)
      }

      // deploy test package and obtain deployment id
      let deployOutput = await SourceDeployCommand.run(['-p', `test/data/raf-dx-plugin-devorg/${tmpForceAppDirName}`, '-u', scratchOrgName, '-w', '0', '--json']);

      let deployIdRecordId
      if (!deployOutput.done) {
        // save deployment id to current scratch org if deploy is still in progress
        const recordCreateOutput = await DataRecordCreateCommand.run(['-u', scratchOrgName, '-s', 'Account', '-v', `Name='${deployOutput.id}' Site='raf-dx-plugin-testsuite'`, '--json'])
        if (recordCreateOutput.success) {
          deployIdRecordId = recordCreateOutput.id
        } else {
          throw Error(`Can't save deployment id in ${scratchOrgName}`)
        }

        // monitor deployment and delete deployment id record after completion
        deployOutput = await checkDeploymentStatus()
        const recordDeleteOutput = await DataRecordDeleteCommand.run(['-u', scratchOrgName, '-s', 'Account', '-i', deployIdRecordId])
        fsExtra.default.dele
        if (!deployOutput.success) {
          throw Error(`Can't deploy testing package in ${scratchOrgName}`)
        } else if (!recordDeleteOutput.success) {
          throw Error(`Can't delete deployment id in ${scratchOrgName}`)
        }
      }

      rimraf.default.sync(`test/data/raf-dx-plugin-devorg/${tmpForceAppDirName}`)

      // save consumer key to DevHub for subsequent logins in order to possibly reuse the scratch org
      if (created && consumerKey && deployOutput.success) {
        const orgDisplayOutput = await OrgDisplayCommand.run(['-u', scratchOrgName, '--json'])
        const currentActiveScratchOrgRecord = await DataSoqlQueryCommand.run(['-u', process.env.DEVORG_USERNAME, '-q', `SELECT Id FROM ActiveScratchOrg WHERE SignupUsername='${orgDisplayOutput.username}'`, '--json'])
        if (!currentActiveScratchOrgRecord.totalSize) {
          throw Error(`Cannot find Active Scratch Org info for ${scratchOrgName} in DevHub ${process.env.DEVORG_USERNAME}`)
        }
        const consumerKeyUpdateResult = await DataRecordUpdateCommand.run(['-u', process.env.DEVORG_USERNAME, '-s', 'ActiveScratchOrg', '-i', currentActiveScratchOrgRecord.records[0].Id, '-v', `ConsumerKey__c='${consumerKey}'`, '--json'])
        if (!consumerKeyUpdateResult.success) {
          throw Error(`Can't write scratch org consumer key in DevHub ${process.env.DEVORG_USERNAME}`)
        }
      }

      process.env.SCRATCH_ORG_USERNAME = scratchOrgName

      //we are ready for testing!

      async function checkDeploymentStatus() {
        let deployReportOutput = { done: false }
        while (!deployReportOutput.done) {
          deployReportOutput = await MdapiDeployReportCommand.run(['-u', scratchOrgName, '-i', deployOutput.id, '--json'])
          if (!deployReportOutput.done) {
            await delay(5000)
          }
        }
        return deployReportOutput
      }

      async function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }

      async function parseXml(xmlFile) {
        return new Promise((resolve, reject) => {
          var parser = new xml2js.default.Parser({ explicitArray: true });
          const data = fs.readFileSync(xmlFile)
          parser.parseString(data, (err, result) => {
            if (err) {
              reject(err)
            }
            resolve(result)
          })
        })
      }

      async function writeXml(xmlFile, obj) {
        var builder = new xml2js.default.Builder({
          renderOpts: {
            'pretty': true,
            'indent': '    ',
            'newline': '\n'
          },
          xmldec: {
            encoding: 'UTF-8'
          }
        })
        fs.writeFileSync(xmlFile, builder.buildObject(obj))
      }

      function getConsumerSecret() {
        let generatedConsumerSecret = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';
        for (let i = 0; i < 128; i++) {
            generatedConsumerSecret += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return generatedConsumerSecret;
      }
    }
  ],

  afterAll: [
    async function () {
      // deploy cleanup package to scratch org
      const scratchOrgName = process.env.SCRATCH_ORG_USERNAME

       // deploy test package and obtain deployment id
       let deployOutput = await SourceDeployCommand.run(['-p', `test/data/raf-dx-plugin-devorg/force-app-cleanup`, '-u', scratchOrgName, '-w', '0', '--json']);

       let deployIdRecordId
       if (!deployOutput.done) {
         // save deployment id to current scratch org if deploy is still in progress
         const recordCreateOutput = await DataRecordCreateCommand.run(['-u', scratchOrgName, '-s', 'Account', '-v', `Name='${deployOutput.id}' Site='raf-dx-plugin-testsuite'`, '--json'])
         if (recordCreateOutput.success) {
           deployIdRecordId = recordCreateOutput.id
         } else {
           throw Error(`Can't save deployment id in ${scratchOrgName}`)
         }

         // monitor deployment and delete deployment id record after completion
         deployOutput = await checkDeploymentStatus()
         const recordDeleteOutput = await DataRecordDeleteCommand.run(['-u', scratchOrgName, '-s', 'Account', '-i', deployIdRecordId])
         fsExtra.default.dele
         if (!deployOutput.success) {
           throw Error(`Can't deploy testing package in ${scratchOrgName}`)
         } else if (!recordDeleteOutput.success) {
           throw Error(`Can't delete deployment id in ${scratchOrgName}`)
         }
       }

      async function checkDeploymentStatus() {
        let deployReportOutput = { done: false }
        while (!deployReportOutput.done) {
          deployReportOutput = await MdapiDeployReportCommand.run(['-u', scratchOrgName, '-i', deployOutput.id, '--json'])
          if (!deployReportOutput.done) {
            await delay(5000)
          }
        }
        return deployReportOutput
      }

      async function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }
    }
  ]
}
