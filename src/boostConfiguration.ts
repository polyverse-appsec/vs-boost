import { NOTEBOOK_TYPE } from "./extension";
import { workspace, extensions, ConfigurationTarget } from "vscode";

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
  
    public static get cloudServiceStage(): string {
      return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.cloudServiceStageName)??
        Defaults.cloudServiceStageValue;
    }
  
    public static get serviceFaultInjection(): number {
      return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.serviceFaultInjectionName)??
        Number(Defaults.serviceFaultInjectionValue);
    }

    public static get serializationOfCellsContainingErrors(): boolean {
        return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.serializationOfCellsContainingErrorsName)??
            Defaults.serializationOfCellsContainingErrorsValue;
    }

    public static get useSourceFileForProblems(): boolean {
        return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.useSourceFileForProblemsName)??
            Defaults.useSourceFileForProblemsValue;
    }

    public static get processFoldersInASingleNotebook(): boolean {
        return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.processFoldersInASingleNotebookName)??
            Defaults.processFoldersInASingleNotebookValue;
    }

    public static get defaultOrganization(): string {
        return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.defaultOrganizationName)??
            Defaults.defaultOrganizationValue;
    }

    public static get enableDevOnlyKernels(): boolean {
        return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.enableDevOnlyKernelsName)??
            Defaults.enableDevOnlyKernelsValue;
    }

    public static get enableKernelPicker(): boolean {
        return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.enableKernelPickerName)??
            Defaults.enableKernelPickerValue;
    }

    public static get currentKernelCommand(): string {
        return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.currentKernelCommandName)??
            Defaults.currentKernelCommandValue;
    }
    public static set currentKernelCommand(value: string) {
        workspace.getConfiguration(NOTEBOOK_TYPE, null)
            .update(Defaults.currentKernelCommandName, value, ConfigurationTarget.Global);
    }

    public static get logLevel(): string {
        return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.logLevelName)??
            Defaults.logLevelValue;
    }

    static _cachedVersion: string = "";
    public static get version(): string | undefined {
        if (this._cachedVersion) {
            return this._cachedVersion;
        }
        const extensionId = 'polyversecorporation.polyverse-boost-notebook';

        const extension = extensions.getExtension(extensionId);
        if (extension) {
          this._cachedVersion = extension.packageJSON.version;
          return this._cachedVersion;
        }

        return undefined;
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
    public static readonly cloudServiceStageName = "cloudServiceStage";
    public static readonly cloudServiceStageValue = "prod";

    // specify 0-100 for the % of service requests to randomly fail at runtime
    public static readonly serviceFaultInjectionName = "serviceFaultInjection";
    public static readonly serviceFaultInjectionValue = "0";

    public static readonly useSourceFileForProblemsName = "useSourceFileForProblems";
    public static readonly useSourceFileForProblemsValue = true;
    
    public static readonly serializationOfCellsContainingErrorsName = "serializationOfCellsContainingErrors";
    public static readonly serializationOfCellsContainingErrorsValue = true;
    
    public static readonly processFoldersInASingleNotebookName = "processFoldersInASingleNotebook";
    public static readonly processFoldersInASingleNotebookValue = false;

    public static readonly defaultOrganizationName = "defaultOrganization";
    public static readonly defaultOrganizationValue = "";

    public static readonly enableDevOnlyKernelsName = "enableDevOnlyKernels";
    public static readonly enableDevOnlyKernelsValue = false;

    public static readonly enableKernelPickerName = "enableKernelPicker";
    public static readonly enableKernelPickerValue = false;

    public static readonly currentKernelCommandName = "currentKernelCommand";
    public static readonly currentKernelCommandValue = "";

    public static readonly logLevelName = "logLevel";
    public static readonly logLevelValue = "info";
}