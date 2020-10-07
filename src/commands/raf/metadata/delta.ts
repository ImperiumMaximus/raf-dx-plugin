import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { Raf } from "../../../raf";
import * as xml2js from 'xml2js';
import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import * as _ from 'lodash';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raf-dx-plugin', 'delta');

export default class Migrate extends SfdxCommand {

  // Comment this out if your command does not require an org username
  // protected static requiresUsername = true;

  // Comment this out if your command does not support a hub org username
  //protected static supportsDevhubUsername = true;

  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  //protected static requiresProject = true;

  protected static flagsConfig = {
    indeltacsv: flags.string({
      required: true,
      char: "f",
      description: "File path of datastore.json with push/pull info",
    }),
    outsourcedir: flags.string({
      required: true,
      char: "d",
      description: "The path to the file where the results of the command are stored",
    }),
    outmanifestdir: flags.string({
      required: true,
      char: "m",
      description: "The path to the file where the results of the command are stored",
    }),
    rootdir: flags.string({
      required: true,
      char: "r",
      description: "The path to the file where the results of the command are stored",
    }),
    inmanifestdir: flags.string({
      required: true,
      char: "x",
      description: "The path to the file where the results of the command are stored",
    }),
    packagemappingfile: flags.string({
      required: true,
      char: "p",
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

  protected manifest;
  protected packageMapping;

  public async run(): Promise<AnyJson> {
    Raf.setLogLevel(this.flags.loglevel, this.flags.json);

    this.manifest = await this.readManifest()
    this.packageMapping = _.keyBy(JSON.parse(fs.readFileSync(this.flags.packagemappingfile).toString()), 'directoryName')

    const ignoreDiffs = new Set([
      'package.xml',
      'lwc/.eslintrc.json',
      'lwc/jsconfig.json'
    ])

    let files = []
    let self = this

    files = (!fs.existsSync(this.flags.indeltacsv) && []) || _(fs
    .readFileSync('diffs.csv')
    .toString('utf8')
    .split('\n'))
    .filter(x => x.startsWith(`${self.flags.rootdir}/`))
    .map(x => x.replace(new RegExp(`^${self.flags.rootdir.replace('/', '\/')}\/`), ''))
    //.map(x => x.replace(/-meta.xml$/, ''))
    .filter(x => { console.log(x)
      return !ignoreDiffs.has(x)})
    .flatMap(x => {
      const key = x.substring(0, x.indexOf('/'))
      const res = []
      if (self.packageMapping[key].metaFile === 'true') res.push(x + '-meta.xml')
      const subx = x.replace(key + '/', '')
      if (self.packageMapping[key].inFolder !== 'true' && subx.indexOf('/') !== -1) res.push(key + '/' + subx.substring(0, subx.indexOf('/')) + '/**')
      res.push(x)
      return res
    })
    .uniq()
    .value()

    console.log(files)

    this.buildFilteredPackageXml(files)

    this.copyFilteredSource(files)

    this.writeManifest()

    return ''
  }

  public async readManifest() {
    return await this.parseXml(`${this.flags.inmanifestdir}/package.xml`)
  }

  public async parseXml(xmlFile) {
    return new Promise((resolve, reject) => {
      var parser = new xml2js.Parser({ explicitArray: true });
      const data = fs.readFileSync(xmlFile)
      parser.parseString(data, (err, result) => {
        if (err) {
          reject(err)
        }
        resolve(result)
      })
    })
  }

  public async buildFilteredPackageXml(files) {
    const self = this
    const metaMap = _(files)
      .filter(x => !x.endsWith('/**'))
      //.filter(x => !x.endsWith('-meta.xml'))
      .groupBy(f => self.packageMapping[f.substring(0, f.indexOf('/'))].xmlName)
      .mapValues(x => x.map(y => {
        const key = y.substring(0, y.indexOf('/'))
        y = y.replace(key + '/', '').replace('-meta.xml', '').replace(self.packageMapping[key].suffix && '.' + self.packageMapping[key].suffix || '', '')
        if (self.packageMapping[key].inFolder !== 'true' && y.indexOf('/') !== -1) y = y.substring(0, y.indexOf('/'))
        return y
      }))
      .value()
    this.manifest.Package.types = Object.entries(metaMap).map(x => ({
      members: [...new Set(x[1])],
      name: x[0]
    }))
  }

  public async copyFilteredSource(files) {
    let self = this
    await fsExtra.emptyDir(this.flags.outsourcedir)
    await fsExtra.copy(this.flags.rootdir, this.flags.outsourcedir, { filter: filterFunc })
    function filterFunc(path) {
      if (fs.lstatSync(path).isDirectory()) {
        return true
      }
      return files.includes(path.replace(`${self.flags.rootdir}/`, ''))
    }
  }

  public async writeManifest()  {
    await fsExtra.emptyDir(this.flags.outmanifestdir)
    await this.writeXml(`${this.flags.outmanifestdir}/package.xml`, this.manifest)
  }

  public async writeXml(xmlFile, obj) {
    var builder = new xml2js.Builder({
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
}
