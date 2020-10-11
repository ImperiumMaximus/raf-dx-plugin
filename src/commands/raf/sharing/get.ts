import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, Org } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { Raf } from "../../../raf";
import { singleRecordQuery } from '../../../shared/queries';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raf-dx-plugin', 'migrate');

export default class Migrate extends SfdxCommand {

  public static description = messages.getMessage("commandDescription");

  // Comment this out if your command does not require an org username
  protected static requiresUsername = true;

  // Comment this out if your command does not support a hub org username
  //protected static supportsDevhubUsername = true;

  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  //protected static requiresProject = true;

  protected static flagsConfig = {
    apiname: flags.string({
      required: true,
      char: "n",
      description: "API Name of the Salesforce Object"
    }),
    targetorg: flags.string({
      char: "u",
      description: "Org against the sharing settings will be altered. If not specified default Org will be used.",
      required: false
    }),
    loglevel: flags.enum({
      description: "logging level for this command invocation",
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
    })
  }

  public async run(): Promise<AnyJson> {
    Raf.setLogLevel(this.flags.loglevel, this.flags.json);

    if (this.flags.targetorg) {
      this.org = await Org.create({ aliasOrUsername: this.flags.targetorg });
    }

    if (!this.org) {
      throw new Error("No target Org specified and no default Org found");
    }

    const conn = this.org.getConnection()

    const entityDefinitionRecord = await singleRecordQuery({ conn, query: `SELECT Id, Metadata FROM EntityDefinition WHERE DeveloperName = '${this.flags.apiname.endsWith('__c') ? this.flags.apiname.substring(0, this.flags.apiname.lastIndexOf('__c')) : this.flags.apiname}'`, tooling: true })

    this.ux.log(JSON.stringify({
      fullname: this.flags.apiname,
      sharingModel: entityDefinitionRecord['Metadata'].sharingModel,
      externalSharingModel: entityDefinitionRecord['Metadata'].externalSharingModel
    }, null, 2))

    return ''
  }

}
