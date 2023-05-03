import * as vscode from 'vscode';
import axios from 'axios';
import { Remote } from './git.d';
import { getCurrentExtensionVersion } from './version';
import { BoostConfiguration } from './boostConfiguration';

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
    let org: string = context.globalState?.get("organization") ?? "";
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
  
function orgServiceEndpoint(): string {
    switch (BoostConfiguration.cloudServiceStage)
    {
        case "local":
            return 'http://127.0.0.1:8000/user_organizations';
        case 'dev':
            return '';
        case "test":
            return '';
        case 'staging':
        case 'prod':
        default:
            return '';
    }
  }
  
  // Define a type for the orgs object
  export type UserOrgs = {
    organizations: string[];
    personal: string;
  };