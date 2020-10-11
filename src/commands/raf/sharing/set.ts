import { flags, SfdxCommand } from '@salesforce/command';
import { LoggerLevel, Messages, SfdxError, Org } from '@salesforce/core';
import { AsyncResult, DeployResult, Connection } from 'jsforce';
import { AnyJson } from '@salesforce/ts-types';
import { Raf } from "../../../raf";
import { singleRecordQuery } from '../../../shared/queries';
import * as fsExtra from 'fs-extra';
import * as fs from 'fs';
import * as archiver from 'archiver';
import * as rimraf from "rimraf";


// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raf-dx-plugin', 'raf');

export default class Migrate extends SfdxCommand {

  public static description = messages.getMessage("sharing.set.description");

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
      description: messages.getMessage("sharing.set.flags.apiname")
    }),
    targetorg: flags.string({
      char: "u",
      description: messages.getMessage("sharing.set.flags.targetorg"),
      required: false
    }),
    internalaccesslevel: flags.string({
      char: "i",
      description: messages.getMessage("sharing.set.flags.internalaccesslevel"),
      required: true
    }),
    externalaccesslevel: flags.string({
      char: "e",
      description: messages.getMessage("sharing.set.flags.externalaccesslevel"),
      required: true
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

  /*private static stdObjApiNamesToOptions = {
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
  }*/

  /*private static customObjectOptions = new Set([
    'Private',
    'Read',
    'ReadWrite'
  ])*/

  public async run(): Promise<AnyJson> {
    Raf.setLogLevel(this.flags.loglevel, this.flags.json);

    if (this.flags.targetorg) {
      this.org = await Org.create({ aliasOrUsername: this.flags.targetorg });
    }

    if (!this.org) {
      throw new Error(messages.getMessage("sharing.set.errors.noOrgFound"));
    }

    const conn = this.org.getConnection()
    const apiversion = await conn.retrieveMaxApiVersion();

    var customObject_metadata: string;

    if (!Migrate.standardObjectApiNames.has(this.flags.apiname)) {
      const entityDefinitionRecord = await singleRecordQuery({ conn, query: `SELECT Id, Metadata FROM EntityDefinition WHERE DeveloperName = '${this.flags.apiname.substring(0, this.flags.apiname.lastIndexOf('__c'))}'`, tooling: true })
      customObject_metadata = `<?xml version="1.0" encoding="UTF-8"?>
      <CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
        <label>${entityDefinitionRecord['Metadata'].label}</label>
        <pluralLabel>${entityDefinitionRecord['Metadata'].pluralLabel}</pluralLabel>
        <nameField>
          <label>${entityDefinitionRecord['Metadata'].nameField.label}</label>
          <type>${entityDefinitionRecord['Metadata'].nameField.type}</type>
        </nameField>
        <deploymentStatus>${entityDefinitionRecord['Metadata'].deploymentStatus}</deploymentStatus>
        <sharingModel>${this.flags.internalaccesslevel}</sharingModel>
        <externalSharingModel>${this.flags.externalaccesslevel}</externalSharingModel>
      </CustomObject>`
    } else {
      customObject_metadata = `<?xml version="1.0" encoding="UTF-8"?>
      <CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
        <sharingModel>${this.flags.internalaccesslevel}</sharingModel>
        <externalSharingModel>${this.flags.externalaccesslevel}</externalSharingModel>
      </CustomObject>`
    }

    var package_xml: string = `<?xml version="1.0" encoding="UTF-8"?>
     <Package xmlns="http://soap.sforce.com/2006/04/metadata">
         <types>
             <members>*</members>
             <name>CustomObject</name>
         </types>
         <version>${apiversion}</version>
     </Package>`

    await fsExtra.emptyDir('temp_rafdxplugin')
    await fsExtra.ensureDir('temp_rafdxplugin/mdapi/objects')
    let targetmetadatapath = `temp_rafdxplugin/mdapi/objects/${this.flags.apiname}.object`
    fs.writeFileSync(targetmetadatapath, customObject_metadata)

    if (this.flags.apiname === 'Account' && this.flags.internalaccesslevel === 'Private') {
      let targetmetadatapath = 'temp_rafdxplugin/mdapi/objects/Opportunity.object'
      fs.writeFileSync(targetmetadatapath, customObject_metadata)
      targetmetadatapath = 'temp_rafdxplugin/mdapi/objects/Case.object'
      fs.writeFileSync(targetmetadatapath, customObject_metadata)
    }

    let targetpackagepath = "temp_rafdxplugin/mdapi/package.xml"
    fs.writeFileSync(targetpackagepath, package_xml)

    var zipFile = 'temp_rafdxplugin/package.zip'
    await this.zipDirectory('temp_rafdxplugin/mdapi', zipFile)

    //Deploy Rule
    conn.metadata.pollTimeout = 300;
    let deployId: AsyncResult;

    var zipStream = fs.createReadStream(zipFile);
    await conn.metadata.deploy(
      zipStream,
      { rollbackOnError: true, singlePackage: true },
      function (error, result: AsyncResult) {
        if (error) {
          return Raf.log(error, LoggerLevel.ERROR);
        }
        deployId = result;
      }
    );

    let metadata_deploy_result: DeployResult = await this.checkDeploymentStatus(
      conn,
      deployId.id
    );

    if (!metadata_deploy_result.success)
      throw new SfdxError(
        messages.getMessage("sharing.set.errors.deploymentError", [metadata_deploy_result.details["componentFailures"]["problem"]])
      );

    rimraf.sync("temp_rafdxplugin");

    this.ux.log(metadata_deploy_result.success ? 'SUCCESS' : 'ERROR')

    return metadata_deploy_result.success;
  }

  public async zipDirectory(source, out) {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const stream = fs.createWriteStream(out);

    return new Promise((resolve, reject) => {
      archive
        .directory(source, false)
        .on("error", err => reject(err))
        .pipe(stream);

      stream.on("close", () => resolve());
      archive.finalize();
    });
  }

  public async checkDeploymentStatus(
    conn: Connection,
    retrievedId: string
  ): Promise<DeployResult> {
    let metadata_result;
    let self = this
    while (true) {
      await conn.metadata.checkDeployStatus(retrievedId, true, function (
        error,
        result
      ) {
        if (error) {
          throw new SfdxError(error.message);
        }
        metadata_result = result;
      });

      if (!metadata_result.done) {
        Raf.log(messages.getMessage("sharing.set.infos.pollingDeploymentStatus"), LoggerLevel.INFO);
        await self.delay(5000);
      } else {
        break;
      }
    }
    return metadata_result;
  }

  public async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
