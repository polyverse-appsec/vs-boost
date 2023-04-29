import { NOTEBOOK_TYPE } from "./extension";
import { workspace } from "vscode";
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
    public static readonly cloudServiceStageValue = "dev";

    // specify 0-100 for the % of service requests to randomly fail at runtime
    public static readonly serviceFaultInjectionName = "serviceFaultInjection";
    public static readonly serviceFaultInjectionValue = "0";

    public static readonly useSourceFileForProblemsName = "useSourceFileForProblems";
    public static readonly useSourceFileForProblemsValue = true;
    
    public static readonly serializationOfCellsContainingErrorsName = "serializationOfCellsContainingErrors";
    public static readonly serializationOfCellsContainingErrorsValue = true;
    
    public static readonly processFoldersInASingleNotebookName = "processFoldersInASingleNotebook";
    public static readonly processFoldersInASingleNotebookValue = true;
}

//keep a global variable for the extension version, start as empty string
let cachedVersion = "";

export function getCurrentExtensionVersion(): string | undefined {
    const extensionId = 'polyversecorporation.polyverse-boost-notebook'; // Replace this with your extension's ID
    const extension = vscode.extensions.getExtension(extensionId);

    if (cachedVersion !== "") {
        return cachedVersion;
    }

    if (!extension) {
        vscode.window.showErrorMessage('Extension not found.');
        return undefined;
    }

    const packageJsonPath = path.join(extension.extensionPath, 'package.json');
    
    try {
        const packageJsonData = fs.readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonData);
        const version = packageJson.version;

        if (!version) {
            vscode.window.showErrorMessage('Extension version not found.');
            return undefined;
        }
        cachedVersion = version;
        return version;
    } catch (error) {
        vscode.window.showErrorMessage('Error reading package.json: ' + (error as Error).message);
        return undefined;
    }
}
