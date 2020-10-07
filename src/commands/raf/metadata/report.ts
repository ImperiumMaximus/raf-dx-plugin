import { core, flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { DescribeMetadataResult, ListMetadataQuery, FileProperties } from 'jsforce/api/metadata';
import xl = require('excel4node');

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raf-dx-plugin', 'report');

export default class Report extends SfdxCommand {

  public static description = messages.getMessage("commandDescription");

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
      description: "The path to the file where the results of the command are stored",
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

    //const describeMetadataCommand = 'sfdx force:mdapi:describemetadata --json'

    const conn = this.org.getConnection()

    let result: DescribeMetadataResult
    try {
      result = await conn.metadata.describe()

      /*console.log(result.result)
      console.log(!result || !!result.status || result.result || result.result.metadataObjects)
      if (!result || !!result.status || result.result || result.result.metadataObjects) {
        throw new Error('Describe Metadata Command Failed!')
      }*/

      let metadataTypes: ListMetadataQuery[] = result.metadataObjects.map(o => o.xmlName).sort().map(o => { return { 'type' : o } })
      console.log(metadataTypes)

      let wb = new xl.Workbook()
      await metadataTypes.reduce(async(curPromise, t) => {
        await curPromise
        console.log(`Processing Metadata Type "${t.type}"`)
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
            let ws = wb.addWorksheet(t.type)
            // set header
            Object.keys(fp).forEach((c, idx) => {
              ws.cell(1, idx + 1).string(c)
            })

            lmResult = lmResult.sort((a, b) => { return a.fullName.localeCompare(b.fullName)})

            lmResult.forEach((r, rIdx) => {
              Object.keys(fp).forEach((c, cIdx) => {
                ws.cell(rIdx + 2, cIdx + 1).string(r.hasOwnProperty(c) ? r[c] : "")
              })
            })
        }


        }
      }, Promise.resolve())
      wb.write(this.flags.outfile)
    } catch (error) {
      console.log(error)
      //result = error.stderr

      // Remove line breaks from string
      //result = result.replace(/(\r\n\t|\n|\r\t)/gm,'');

      throw new core.SfdxError(error)
    }

    return ''
  }

}
