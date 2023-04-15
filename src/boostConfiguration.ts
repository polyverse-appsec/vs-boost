import { NOTEBOOK_TYPE } from "./extension";
import { workspace } from "vscode";

export class BoostConfiguration {
  
    public static get defaultOutputLanguage(): string {
      return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.defaultOutputLanguageName)??
        Defaults.defaultOutputLanguageValue;
    }
  
    public static get testFramework(): string {
      return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.testFrameworkName)??
        Defaults.defaultOutputLanguageValue;
    }
  
    public static get defaultDir(): string {
      return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.defaultDirName)??
        Defaults.testFrameworkValue;
    }
  
    public static get localServiceDebug(): boolean {
      return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.localServiceDebugName)??
        Boolean(Defaults.localServiceDebugValue);
    }
  
    public static get serviceFaultInjection(): number {
      return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.serviceFaultInjectionName)??
        Number(Defaults.serviceFaultInjectionValue);
    }
}
class Defaults {
    public static readonly defaultOutputLanguageName = "outputLanguage";

    public static readonly defaultOutputLanguageValue = "python";

    public static readonly testFrameworkName = "testFramework";
    public static readonly testFrameworkValue = "pytest";

    // default directory to write Boost files
    public static readonly defaultDirName = "defaultDir";
    public static readonly defaultDirValue = ".boost";

    // specify true to use the local Boost service for debugging
    public static readonly localServiceDebugName = "localServiceDebug";
    public static readonly localServiceDebugValue = "false";

    // specify 0-100 for the % of service requests to randomly fail at runtime
    public static readonly serviceFaultInjectionName = "serviceFaultInjection";
    public static readonly serviceFaultInjectionValue = "0";
}
  