import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError, Org } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { Raf } from "../../../raf";
import { RecordResult, ErrorResult, SuccessResult } from "jsforce/record-result";
import { MetadataInfo, SaveResult } from "jsforce/api/metadata";
import { singleRecordQuery } from '../../../shared/queries';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raf-dx-plugin', 'sharing_set');

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
    accesslevel: flags.string({
      char: "l",
      description: "Default access level for the specified Salesforce Object",
      required: true
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

  private static standardObjectApiNames = new Set([
    'Account',
    'Calendar',
    'Campaign',
    'Case',
    'Contact',
    'Lead',
    'Opportunity',
    'Pricebook'
  ])

  private static stdObjApiNamesToOptions = {
    "Account": new Set([
      "None",
      "Read",
      "Edit",
      "ControlledByLeadOrContact",
      "ControlledByCampaign"
    ]),
    'Calendar': new Set([
      "HideDetails",
      "HideDetailsInsert",
      "ShowDetails",
      "ShowDetailsInsert",
      "AllowEdits"
    ]),
    'Campaign': new Set([
      "None",
      "Read",
      "Edit",
      "All"
    ]),
    'Case': new Set([
      "None",
      "Read",
      "Edit",
      "ReadEditTransfer"
    ]),
    'Contact': new Set([
      "None",
      "Read",
      "Edit",
      "ControlledByParent"
    ]),
    'Lead': new Set([
      "None",
      "Read",
      "Edit",
      "ReadEditTransfer"
    ]),
    'Opportunity': new Set([
      "None",
      "Read",
      "Edit",
      "ControlledByLeadOrContact",
      "ControlledByCampaign"
    ]),
    'Pricebook': new Set([
      "None",
      "Read",
      "ReadSelect",
    ])
  }

  private static customObjectOptions = new Set([
    'Private',
    'Read',
    'ReadWrite'
  ])

  public async run(): Promise<AnyJson> {
    Raf.setLogLevel(this.flags.loglevel, this.flags.json);

    if (this.flags.targetorg) {
      this.org = await Org.create({ aliasOrUsername: this.flags.targetorg });
    }

    if (!this.org) {
      throw new Error("No target Org specified and no default Org found");
    }
    let updateResult: SaveResult;
    if (Migrate.standardObjectApiNames.has(this.flags.apiname) && Migrate.stdObjApiNamesToOptions[this.flags.apiname].has(this.flags.accesslevel)) {
      // is one of the standaerd objects manageable in the Organization record?
      /*const conn = this.org.getConnection();
      let orgUpdateRecord = {
        Id: this.org.getOrgId()
      };
      orgUpdateRecord[`Default${this.flags.apiname}Access`] = this.flags.accesslevel;
      updateResult = await conn.sobject('Organization').update(orgUpdateRecord);
*/
    } else if (this.flags.apiname.endsWith('__c') && Migrate.customObjectOptions.has(this.flags.accesslevel)) {
      // is a custom object?
      const conn = this.org.getConnection()
      const entityDefinitionRecord = await singleRecordQuery({conn, query: `SELECT Id, Metadata FROM EntityDefinition WHERE DeveloperName = '${this.flags.apiname.substring(0, this.flags.apiname.lastIndexOf('__c'))}'`, tooling: true})
      var md = [{
        fullName: this.flags.apiname,
        label: entityDefinitionRecord['Metadata'].label,
        pluralLabel: entityDefinitionRecord['Metadata'].pluralLabel,
        nameField: {
          type: entityDefinitionRecord['Metadata'].nameField.type,
          label: entityDefinitionRecord['Metadata'].nameField.label
        },
        deploymentStatus: entityDefinitionRecord['Metadata'].deploymentStatus,
        sharingModel: this.flags.accesslevel
      }]
      console.log(md)
      updateResult = await conn.metadata.update('CustomObject', md) as SaveResult
    } else {
      throw new Error("Supplied Salesforce Object API Name is unknown");
    }

    this.ux.log(updateResult.success ? 'SUCCESS' : 'ERROR');

    return updateResult.success;
  }
}
