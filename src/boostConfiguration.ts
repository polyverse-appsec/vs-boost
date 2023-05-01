import { NOTEBOOK_TYPE } from "./extension";
import { workspace } from "vscode";
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Remote } from './git.d';

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
        return workspace.getConfiguration(NOTEBOOK_TYPE, null).get(Defaults.defaultOrganizationName)?? ""
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

    public static readonly defaultOrganizationName = "defaultOrganization";
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

function orgServiceEndpoint(): string {
  switch (BoostConfiguration.cloudServiceStage)
  {
      case "local":
          return 'http://127.0.0.1:8000/user_organizations';
      case 'dev':
          return 'http://127.0.0.1:8000/user_organizations';
      case "test":
          return 'http://127.0.0.1:8000/user_organizations';
      case 'staging':
      case 'prod':
      default:
          return 'http://127.0.0.1:8000/user_organizations';
  }
}

// Define a type for the orgs object
export type UserOrgs = {
  organizations: string[];
  personal: string;
};

export async function fetchOrganizations(): Promise<UserOrgs> {
  let session = await fetchGithubSession();       // get the session
  let version = getCurrentExtensionVersion();     // get the extension version
  let payload = {
      "session": session.accessToken,
      "version": version
  };

  let endpoint = orgServiceEndpoint();

  const response = await axios.post(
      endpoint,
      payload);
  
  return response.data;
}

export async function fetchGithubSession(): Promise<vscode.AuthenticationSession> {
  const GITHUB_AUTH_PROVIDER_ID = 'github';
  // The GitHub Authentication Provider accepts the scopes described here:
  // https://developer.github.com/apps/building-oauth-apps/understanding-scopes-for-oauth-apps/
  const SCOPES = ['user:email', 'read:org'];

  const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: true });

  return session;
}

export async function getCurrentOrganization(context: vscode.ExtensionContext): Promise<string> 
{
  //if we have a cached value, return it
  let org: string = context.globalState.get("organization") ?? "";
  if (org === undefined) {
    org = "";
  }
  //otherwise, look in the config file
  if (org === "") {
    org = BoostConfiguration.defaultOrganization;
  }
  //if we still don't have a value, try looking in the environment and getting the organizaiton
  //of the current repository
  if (org === "" || org === undefined) {
    org = await getCurrentGithubOrganizationFromWorkspace();
  }
  //if we still don't have a value, default the user's personal organization
  if (org === "" || org === undefined) {
    let orgs = await fetchOrganizations();
    org = orgs["personal"];
  }

  return org;
}



export async function getCurrentGithubOrganizationFromWorkspace(): Promise<string> {
  // Get the Git extension API.
  const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
  if (!gitExtension) {
    // Git extension is not available.
    return '';
  }

  // Get the Git API from the Git extension.
  const gitApi = gitExtension.getAPI(1);
  if (!gitApi) {
    // Git API is not available.
    return '';
  }

  // Get the active repository.
  const activeRepo = gitApi.repositories[0];
  if (!activeRepo) {
    // No active repository.
    return '';
  }

  // Get the remote URL of the active repository.
  const remotes = await activeRepo.getRemotes();
  const originRemote = remotes.find((remote: Remote) => remote.name === 'origin');
  if (!originRemote) {
    // No 'origin' remote found.
    return '';
  }

  // Extract the GitHub organization from the remote URL.
  const remoteUrl = originRemote.fetchUrl;
  if (!remoteUrl) {
    // Remote URL is not available.
    return '';
  }

  // Use a regular expression to match the GitHub organization from the remote URL.
  const match = remoteUrl.match(/github\.com[/:](\w+)/);
  if (!match || match.length < 2) {
    // GitHub organization not found in the remote URL.
    return '';
  }

  // Return the GitHub organization.
  return match[1];
}
