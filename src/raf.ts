import Logger = require("pino");
import { UX } from "@salesforce/command";

export enum LoggerLevel {
  TRACE = 10,
  DEBUG = 20,
  INFO = 30,
  WARN = 40,
  ERROR = 50,
  FATAL = 60
}

export class Raf {
  private static logger: Logger;
  private static defaultFolder: string;
  private static projectDirectories: string[];
  private static pluginConfig;
  private static isJsonFormatEnabled: boolean;
  private static ux: UX;
  private static sourceApiVersion: any;

  public static setLogLevel(logLevel: string, isJsonFormatEnabled: boolean) {
    logLevel = logLevel.toLowerCase();
    this.isJsonFormatEnabled = isJsonFormatEnabled;

    if (!isJsonFormatEnabled) {
      this.logger = Logger({
        name: "raf",
        level: logLevel,
        prettyPrint: {
          levelFirst: true, // --levelFirst
          colorize: true,
          translateTime: true,
          ignore: "pid,hostname" // --ignore
        }
      });
    } else {
      //do nothing for now, need to put pino to move to file
    }
  }
}
