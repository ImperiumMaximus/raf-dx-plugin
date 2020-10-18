import { core, flags, SfdxCommand } from '@salesforce/command';
import { Messages } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { DescribeMetadataResult, ListMetadataQuery, FileProperties } from 'jsforce/api/metadata';
import xl = require('excel4node');
import { LoggerLevel, Raf } from "../../../raf";

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raf-dx-plugin', 'raf');

export default class Report extends SfdxCommand {

  public static description = messages.getMessage("metadata.report.description");

  // Comment this out if your command does not require an org username
  protected static requiresUsername = true;

  // Comment this out if your command does not support a hub org username
  //protected static supportsDevhubUsername = true;

  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  //protected static requiresProject = true;

  protected static flagsConfig = {
    outfile: flags.string({
      required: true,
      char: "f",
      description: messages.getMessage("metadata.report.flags.outfile"),
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
    Raf.setLogLevel(this.flags.loglevel, this.flags.json)

    const conn = this.org.getConnection()

    let result: DescribeMetadataResult
    try {
      result = await conn.metadata.describe()

      const metadataTypes: ListMetadataQuery[] = result.metadataObjects.map(o => o.xmlName).sort().map(o => { return { 'type' : o } })

      const wb = new xl.Workbook()
      await metadataTypes.reduce(async(curPromise, t) => {
        await curPromise
        Raf.log(messages.getMessage("metadata.report.infos.processingMetadataType", [t.type]), LoggerLevel.INFO)
        let lmResult = await conn.metadata.list(t)

        const fp: FileProperties = {
          type: "",
          createdById: "",
          createdByName: "",
          createdDate: "",
          fileName: "",
          fullName: "",
          id: "",
          lastModifiedById: "",
          lastModifiedByName: "",
          lastModifiedDate: "",
          manageableState: "",
          namespacePrefix: "",
        }

        if (lmResult) {
          lmResult = Array.isArray(lmResult) ? lmResult : [lmResult]

          if (lmResult.length > 0) {
            const ws = wb.addWorksheet(t.type)
            // set header
            Object.keys(fp).forEach((c, idx) => {
              ws.cell(1, idx + 1).string(c)
            })

            lmResult = lmResult.sort((a, b) => { return a.fullName.localeCompare(b.fullName)})

            lmResult.forEach((r, rIdx) => {
              Object.keys(fp).forEach((c, cIdx) => {
                ws.cell(rIdx + 2, cIdx + 1).string(Object.prototype.hasOwnProperty.call(r, c) ? r[c] : "")
              })
            })
        }


        }
      }, Promise.resolve())
      wb.write(this.flags.outfile)
    } catch (error) {
      Raf.log(messages.getMessage("metadata.report.infos.generalError", [error]), LoggerLevel.ERROR)

      throw new core.SfdxError(error)
    }

    return ''
  }

}
