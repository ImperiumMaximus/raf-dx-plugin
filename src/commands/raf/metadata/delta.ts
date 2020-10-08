import { flags, SfdxCommand } from '@salesforce/command';
import { Messages } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { LoggerLevel, Raf } from "../../../raf";
import * as xml2js from 'xml2js';
import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import * as _ from 'lodash';
import * as cliProgress from 'cli-progress';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raf-dx-plugin', 'raf');

export default class Migrate extends SfdxCommand {

  public static description = messages.getMessage("metadata.delta.description");

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
      description: messages.getMessage("metadata.delta.flags.indeltacsv"),
    }),
    outsourcedir: flags.string({
      required: true,
      char: "d",
      description: messages.getMessage("metadata.delta.flags.outsourcedir"),
    }),
    outmanifestdir: flags.string({
      required: true,
      char: "m",
      description: messages.getMessage("metadata.delta.flags.outmanifestdir"),
    }),
    rootdir: flags.string({
      required: true,
      char: "r",
      description: messages.getMessage("metadata.delta.flags.rootdir"),
    }),
    inmanifestdir: flags.string({
      required: true,
      char: "x",
      description: messages.getMessage("metadata.delta.flags.inmanifestdir"),
    }),
    packagemappingfile: flags.string({
      required: true,
      char: "p",
      description: messages.getMessage("metadata.delta.flags.packagemappingfile"),

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

  protected manifest;
  protected packageMapping;
  protected multibar: any;
  protected multibars: any = {};

  public async run(): Promise<AnyJson> {
    Raf.setLogLevel(this.flags.loglevel, this.flags.json);

    this.multibar = new cliProgress.MultiBar({
      clearOnComplete: false,
      hideCursor: true,
      fps: 500,
      format: '{name} [{bar}] {percentage}% | {value}/{total} | {file} '
    }, cliProgress.Presets.shades_grey);
    if (this.multibar.terminal.isTTY()) {
      this.multibars.total = this.multibar.create(0, 0, { name: messages.getMessage("metadata.delta.multibars.total").padEnd(30, ' '), file: messages.getMessage("metadata.delta.multibars.na") });
      this.multibars.total.setTotal(4)
    } else {
      Raf.log(messages.getMessage("metadata.delta.infos.buildingDelta"), LoggerLevel.INFO)
    }

    this.manifest = await this.readManifest()
    this.packageMapping = _.keyBy(JSON.parse(fs.readFileSync(this.flags.packagemappingfile).toString()).metadataObjects, 'directoryName')

    const ignoreDiffs = new Set([
      'package.xml',
      'lwc/.eslintrc.json',
      'lwc/jsconfig.json'
    ])

    let files = []
    let self = this

    const rows = (!fs.existsSync(this.flags.indeltacsv) && []) || fs
    .readFileSync(this.flags.indeltacsv)
    .toString('utf8')
    .split('\n')

    if (this.multibar.terminal.isTTY()) {
      this.multibars.diffs = this.multibar.create(rows.length, 0, { name: messages.getMessage("metadata.delta.multibars.calculatingDiffs").padEnd(30, ' '), file: messages.getMessage("metadata.delta.multibars.na") });
    } else {
      Raf.log(messages.getMessage("metadata.delta.infos.calculatingDiffs", [rows.length]), LoggerLevel.INFO)
    }

    files = _(rows)
    .filter(x => x.startsWith(`${self.flags.rootdir}/`))
    .map(x => x.replace(new RegExp(`^${self.flags.rootdir.replace('/', '\/')}\/`), ''))
    //.map(x => x.replace(/-meta.xml$/, ''))
    .filter(x => !ignoreDiffs.has(x))
    .flatMap(x => {
      if (self.multibar.terminal.isTTY()) {
        self.multibars.diffs.update(null, { file: x })
      }
      const key = x.substring(0, x.indexOf('/'))
      const res = []
      if (self.packageMapping[key].metaFile === 'true') res.push(x + '-meta.xml')
      const subx = x.replace(key + '/', '')
      if (self.packageMapping[key].inFolder !== 'true' && subx.indexOf('/') !== -1) res.push(key + '/' + subx.substring(0, subx.indexOf('/')) + '/**')
      res.push(x)
      if (self.multibar.terminal.isTTY()) {
        self.multibars.diffs.increment()
        self.multibar.update()
      }
      return res
    })
    .uniq()
    .value()

    if (this.multibar.terminal.isTTY()) {
      this.multibars.total.increment()
      this.multibar.update()
    }

    await this.buildFilteredPackageXml(files)

    if (this.multibar.terminal.isTTY()) {
      this.multibars.total.increment()
      this.multibar.update()
    }

    await this.copyFilteredSource(files)

    if (this.multibar.terminal.isTTY()) {
      this.multibars.total.increment()
      this.multibar.update()
    }

    await this.writeManifest()

    if (this.multibar.terminal.isTTY()) {
      this.multibars.total.increment()
      this.multibar.update()

      this.multibar.stop();
    } else {
      Raf.log(messages.getMessage("general.infos.done"), LoggerLevel.INFO)
    }

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
    const metaMapGroup = _(files)
      .filter(x => !x.endsWith('/**'))
      //.filter(x => !x.endsWith('-meta.xml'))
      .groupBy(f => self.packageMapping[f.substring(0, f.indexOf('/'))].xmlName)

    if (this.multibar.terminal.isTTY()) {
      this.multibars.filteredPackage = this.multibar.create(Object.keys(metaMapGroup.toJSON()).length, 0, { name: messages.getMessage("metadata.delta.multibars.buildingFiltMan").padEnd(30, ' '), file: messages.getMessage("metadata.delta.multibars.na") });
    } else {
      Raf.log(messages.getMessage("metadata.delta.infos.buildingFiltMan", [Object.keys(metaMapGroup.toJSON()).length]), LoggerLevel.INFO)
    }

    const metaMap = metaMapGroup.mapValues(x => {
      if (self.multibar.terminal.isTTY()) {
        self.multibars.filteredPackage.update(null, { file: x })
        self.multibars.filteredPackage.increment()
        self.multibar.update()
      }
      return x.map(y => {
        const key = y.substring(0, y.indexOf('/'))
        y = y.replace(key + '/', '').replace('-meta.xml', '').replace(self.packageMapping[key].suffix && '.' + self.packageMapping[key].suffix || '', '')
        if (self.packageMapping[key].inFolder !== 'true' && y.indexOf('/') !== -1) y = y.substring(0, y.indexOf('/'))
        return y
      })})
      .value()
    this.manifest.Package.types = Object.entries(metaMap).map(x => ({
      members: [...new Set(x[1])],
      name: x[0]
    }))
  }

  public async copyFilteredSource(files) {
    if (this.multibar.terminal.isTTY()) {
      this.multibars.copyFilteredSourceBar = this.multibar.create(files.filter(x => !x.endsWith('/**')).length, 0, { name: messages.getMessage("metadata.delta.multibars.copyingToTarget").padEnd(30, ' '), file: messages.getMessage("metadata.delta.multibars.na") });
    } else {
      Raf.log(messages.getMessage("metadata.delta.infos.copyingToTarget", [files.filter(x => !x.endsWith('/**')).length]), LoggerLevel.INFO)
    }
    let self = this
    await fsExtra.emptyDir(this.flags.outsourcedir)
    await fsExtra.copy(this.flags.rootdir, this.flags.outsourcedir, { filter: filterFunc })

    function filterFunc(path) {
      if (fs.lstatSync(path).isDirectory()) {
        return true
      }
      const basename = path.replace(`${self.flags.rootdir}/`, '')
      const include = files.includes(basename)
      if (include) {
        if (self.multibar.terminal.isTTY()) {
          self.multibars.copyFilteredSourceBar.update(null, { file: basename })
          self.multibars.copyFilteredSourceBar.increment()
          self.multibar.update()
        }
      }
      return include
    }
  }

  public async writeManifest()  {
    if (this.multibar.terminal.isTTY()) {
      this.multibars.writeManifestBar = this.multibar.create(1, 0, { name: messages.getMessage("metadata.delta.multibars.writingFiltMan").padEnd(30, ' '), file: `${this.flags.outmanifestdir}/package.xml` });
    } else {
      Raf.log(messages.getMessage("metadata.delta.infos.writingFiltMan"), LoggerLevel.INFO)
    }

    await fsExtra.emptyDir(this.flags.outmanifestdir)
    await this.writeXml(`${this.flags.outmanifestdir}/package.xml`, this.manifest)

    if (this.multibar.terminal.isTTY()) {
      this.multibars.writeManifestBar.increment()
      this.multibar.update()
    }
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
