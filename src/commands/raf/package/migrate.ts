import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, Org } from '@salesforce/core';
import { PackageInstallCommand } from 'salesforce-alm/dist/commands/force/package/install';
import { AnyJson } from '@salesforce/ts-types';
import { LoggerLevel, Raf } from "../../../raf";
import { PackageInstallRequest } from "../../../shared/typeDefs";

const cliProgress = require('cli-progress');

const defaultWait = 10;

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raf-dx-plugin', 'raf');

export default class Migrate extends SfdxCommand {

  public static description = messages.getMessage("package.migrate.description");

  // Comment this out if your command does not require an org username
  protected static requiresUsername = true;

  protected static flagsConfig = {
    apexcompile: flags.enum({
      char: 'a',
      default: 'all',
      required: false,
      description: messages.getMessage("package.migrate.flags.apexcompile"),
      options: ['all', 'package']
    }),
    targetorg: flags.string({
      required: true,
      char: "d",
      description: messages.getMessage("package.migrate.flags.targetorg"),
    }),
    sourceorg: flags.string({
      required: false,
      char: "s",
      description: messages.getMessage("package.migrate.flags.sourceorg"),
    }),
    excludelist: flags.string({
      required: false,
      char: "e",
      description:  messages.getMessage("package.migrate.flags.excludelist")
    }),
    loglevel: flags.enum({
      description:  messages.getMessage("general.flags.loglevel"),
      default: "info",
      required: false,
      options: [
        "trace",
        "debug",
        "info",
        "warn",
        "error",
        "fatal",
        "TRACE",
        "DEBUG",
        "INFO",
        "WARN",
        "ERROR",
        "FATAL"
      ]
    }),
    wait: flags.number({ char: 'w', required: false, description: 'wait' })
  }

  private sourceorg: Org;

  public async run(): Promise<AnyJson> {
    Raf.setLogLevel(this.flags.loglevel, this.flags.json);

    this.sourceorg = await Org.create({ aliasOrUsername: this.flags.sourceorg });

    if (this.flags.targetorg) {
      this.org = await Org.create({ aliasOrUsername: this.flags.targetorg });
    }

    const sourceconn = this.sourceorg.getConnection();

    const installedPackages = await sourceconn.tooling.query('SELECT Id, SubscriberPackage.Name, SubscriberPackageVersion.Id FROM InstalledSubscriberPackage ORDER BY SubscriberPackageId')

    if (installedPackages.totalSize) {
      Raf.log(messages.getMessage("package.migrate.infos.workToBeDone", [installedPackages.totalSize, this.flags.sourceorg]), LoggerLevel.INFO);
      const packageIds = installedPackages.records.map(p => {
        return p['SubscriberPackageVersion']['Id']
      })
      const bar = new cliProgress.SingleBar({
        format: 'Installing [{bar}] {percentage}% | {value}/{total} | Package: {packageid}'
      }, cliProgress.Presets.shades_classic);
      bar.start(installedPackages.totalSize, 0, {packageid: packageIds[0]})
      for (let i = 0; i < packageIds.length; i++) {
        // Split arguments to be used by the OCLIF command -- PackageInstallCommand
        const args = [];

        // USERNAME
        args.push('-u');
        args.push(`${this.flags.targetorg}`);

        // PACKAGE ID
        args.push('--package');
        args.push(`${packageIds[i]}`);

        // INSTALLATION KEY
        /*if (installationKeys && installationKeys[i]) {
          args.push('--installationkey');
          args.push(`${installationKeys[i]}`);
        }*/

        // WAIT
        const wait = this.flags.wait ? this.flags.wait : defaultWait;
        args.push('--wait');
        args.push(`${wait}`);
        args.push('--publishwait');
        args.push(`${wait}`);

        // SECURITYTYPE
        if (this.flags.securitytype) {
          args.push('--securitytype');
          args.push(`${this.flags.securitytype}`);
        }

        // PROMPT
        if (!this.flags.prompt) {
          // add the "--noprompt" flag by default as long as this command's "prompt" flag is false.
          args.push('--noprompt');
        }

        // APEXCOMPILE
        if (this.flags.apexcompile) {
          args.push('--apexcompile');
          args.push(`${this.flags.apexcompile}`);
        }

        // JSON
        if (this.flags.json) {
          args.push('--json');
        }

        const intercept = require('intercept-stdout');

        // setup the intercept function to silence the output of PackageInstallCommand call
        // tslint:disable-next-line: only-arrow-functions
        const unhookIntercept = intercept(function(text) {
          return '';
        });

        const installationResultJson = await PackageInstallCommand.run(args) as PackageInstallRequest;

        // reactivate the output to console.
        unhookIntercept();

        if (installationResultJson === undefined || installationResultJson.Status !== 'SUCCESS') {
          throw Error(messages.getMessage("package.migrate.infos.installError", [packageIds[i]]));
        }

        bar.increment(1, { packageid: (i + 1) === packageIds.length ? 'Completed' : packageIds[i + 1] })
      }
      bar.stop()
    }

    return ''
  }

}
