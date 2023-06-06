import { NOTEBOOK_TYPE } from "./extension";
import { workspace, extensions, ConfigurationTarget } from "vscode";

export class BoostConfiguration {
  
    public static get defaultOutputLanguage(): string {
        let command = workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.defaultOutputLanguageName) as any;
        if (command) {
            command = command.local?command.local as string:command as string;
        } else {
            command = Defaults.defaultOutputLanguageValue;
        }
        return command;
    }
  
    public static get testFramework(): string {
        let command = workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.testFrameworkName) as any;
        if (command) {
            command = command.local?command.local as string:command as string;
        } else {
            command = Defaults.testFrameworkValue;
        }
        return command;
    }
  
    public static get defaultDir(): string {
        let command = workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.defaultDirName) as any;
        if (command) {
            command = command.local?command.local as string:command as string;
        } else {
            command = Defaults.defaultDirValue;
        }
        return command;
    }
  
    public static get cloudServiceStage(): string {
        let command = workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.cloudServiceStageName) as any;
        if (command) {
            command = command.local?command.local as string:command as string;
        } else {
            command = Defaults.cloudServiceStageValue;
        }
        return command;
    }
  
    public static get serviceFaultInjection(): number {
      return (workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.serviceFaultInjectionName) as number)??
        Number(Defaults.serviceFaultInjectionValue);
    }

    public static get serializationOfCellsContainingErrors(): boolean {
        return (workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.serializationOfCellsContainingErrorsName) as boolean)??
            Defaults.serializationOfCellsContainingErrorsValue;
    }

    public static get useSourceFileForProblems(): boolean {
        return (workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.useSourceFileForProblemsName) as boolean)??
            Defaults.useSourceFileForProblemsValue;
    }

    public static get processFoldersInASingleNotebook(): boolean {
        return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.processFoldersInASingleNotebookName)??
            Defaults.processFoldersInASingleNotebookValue;
    }

    public static get defaultOrganization(): string {
        let command = workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.defaultOrganizationName) as any;
        if (command) {
            command = command.local?command.local as string:command as string;
        } else {
            command = Defaults.defaultOrganizationValue;
        }
        return command;
    }

    public static get enableDevOnlyKernels(): boolean {
        return (workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.enableDevOnlyKernelsName) as boolean)??
            Defaults.enableDevOnlyKernelsValue;
    }

    public static get currentKernelCommand(): string {
        let command = workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.currentKernelCommandName) as any;
        if (command) {
            command = command.local?command.local as string:command as string;
        } else {
            command = Defaults.currentKernelCommandValue;
        }
        return command;
    }
    public static set currentKernelCommand(value: string) {
        workspace.getConfiguration(NOTEBOOK_TYPE, null)
            .update(Defaults.currentKernelCommandName, value, ConfigurationTarget.Global);
    }

    public static get logLevel(): string {
        return (workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.logLevelName) as string)??
            Defaults.logLevelValue;
    }
    public static set logLevel(value: string) {
        workspace.getConfiguration(NOTEBOOK_TYPE, null)
            .update(Defaults.logLevelName, value, ConfigurationTarget.Global);
    }

    public static get analysisTemperature(): string {
        return (workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.analysisTemperatureName) as string)??
            Defaults.analysisTemperatureValue;
    }

    public static get analysisRankedProbability(): string {
        return (workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.analysisRankedProbabilityName) as string)??
            Defaults.analysisRankedProbabilityValue;
    }

    public static analysisTemperatureByKernel(kernel: string): string {
        return (workspace.getConfiguration(NOTEBOOK_TYPE, null).get(kernel + "." + Defaults.analysisTemperatureName) as string)??
            Defaults.analysisTemperatureValue;
    }

    public static analysisRankedProbabilityByKernel(kernel: string): string {
        return (workspace.getConfiguration(NOTEBOOK_TYPE, null).get(kernel + "." + Defaults.analysisRankedProbabilityName) as string)??
            Defaults.analysisRankedProbabilityValue;
    }

    public static get analysisModel(): string {
        return (workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.analysisModelName) as string)??
            Defaults.analysisModelValue;
    }

    public static analysisModelByKernel(kernel: string): string {
        return (workspace.getConfiguration(NOTEBOOK_TYPE, null).get(kernel + "." + Defaults.analysisModelName) as string)??
            Defaults.analysisModelValue;
    }

    public static get refreshAnalysisAlways(): boolean {
        return (workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.refreshAnalysisAlwaysName) as boolean)??
            Defaults.refreshAnalysisAlwaysValue;
    }

    public static refreshAnalysisAlwaysByKernel(kernel: string): boolean {
        return (workspace.getConfiguration(NOTEBOOK_TYPE, null).get(kernel + "." + Defaults.refreshAnalysisAlwaysName) as boolean)??
            Defaults.refreshAnalysisAlwaysValue;
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

    public static readonly defaultOrganizationName : string = "defaultOrganization";
    public static readonly defaultOrganizationValue : string = "";

    public static readonly enableDevOnlyKernelsName : string = "enableDevOnlyKernels";
    public static readonly enableDevOnlyKernelsValue : boolean = false;

    public static readonly currentKernelCommandName : string = "currentKernelCommand";
    public static readonly currentKernelCommandValue : string = "";

    public static readonly logLevelName : string = "logLevel";
    public static readonly logLevelValue : string = "info";

    public static readonly analysisTemperatureName : string = "analysisTemperature";
    public static readonly analysisTemperatureValue : string = "";

    public static readonly analysisRankedProbabilityName : string = "analysisRankedProbability";
    public static readonly analysisRankedProbabilityValue : string = "";

    public static readonly analysisModelName : string = "analysisModel";
    public static readonly analysisModelValue : string = "";

    public static readonly refreshAnalysisAlwaysName : string = "refreshAnalysisAlways";
    public static readonly refreshAnalysisAlwaysValue : boolean = false;
}