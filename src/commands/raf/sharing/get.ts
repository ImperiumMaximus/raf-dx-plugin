import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, Org } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { Raf } from "../../../raf";
import { singleRecordQuery } from '../../../shared/queries';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raf-dx-plugin', 'raf');

export default class Migrate extends SfdxCommand {

  public static description = messages.getMessage("sharing.get.description");

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
      description: messages.getMessage("sharing.get.flags.apiname")
    }),
    targetorg: flags.string({
      char: "u",
      description: messages.getMessage("sharing.get.flags.targetorg"),
      required: false
    }),
    loglevel: flags.enum({
      description: messages.getMessage("general.flags.loglevel"),
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
      throw new Error(messages.getMessage("sharing.get.errors.noOrgFound"));
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
