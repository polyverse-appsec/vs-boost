import * as vscode from "vscode";
import axios from "axios";
import { Remote } from "./git.d";
import { BoostConfiguration } from "./boostConfiguration";
import { boostLogging } from "./boostLogging";
import { fetchUserOrganizationsServiceRequest } from "./user_organizations";
import { getExtensionMode } from "./extension_state";

import { exec } from "child_process";

function getGithubToken(): Promise<string> {
    return new Promise((resolve, reject) => {
        // Execute the command to get the token status.
        exec("gh auth status --show-token", (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                reject(new Error("Failed to execute command."));
                return;
            }

            // Parse the output to extract the token.
            const tokenMatch = stdout.match(/✓ Token: (\S+)/);
            if (tokenMatch && tokenMatch[1]) {
                const token = tokenMatch[1];
                resolve(token);
            } else {
                console.error("Failed to parse GitHub token.");
                reject(new Error("Failed to parse GitHub token."));
            }
        });
    });
}

// create a mock class for the vscode.AuthenticationSession interface for testing
export class MockAuthenticationSession implements vscode.AuthenticationSession {
    accessToken: string;
    account: any;
    id: string;
    scopes: string[];
    constructor(accessToken: string) {
        this.accessToken = accessToken;
        this.account = "";
        this.id = "";
        this.scopes = [];
    }
}

export async function fetchMockGithubSession(): Promise<vscode.AuthenticationSession> {
    // first see if we have the session passed to us, and if so, use it
    let token = await getGithubToken();

    return new MockAuthenticationSession(token);
}

export async function fetchGithubSession(
    forceNewSession: boolean = false
): Promise<vscode.AuthenticationSession> {
    //if context is set, and the extensionMode is Test, then use the mock session
    if (getExtensionMode() === vscode.ExtensionMode.Test) {
        return fetchMockGithubSession();
    }
    const GITHUB_AUTH_PROVIDER_ID = "github";
    // The GitHub Authentication Provider accepts the scopes described here:
    // https://developer.github.com/apps/building-oauth-apps/understanding-scopes-for-oauth-apps/
    const SCOPES = ["user:email", "read:org"];

    let session = undefined;
    let errorMessage = undefined;
    try {
        session = await vscode.authentication.getSession(
            GITHUB_AUTH_PROVIDER_ID,
            SCOPES,
            { createIfNone: !forceNewSession, forceNewSession: forceNewSession }
        );
    } catch (err: any) {
        if ((err.message as string).includes("Git model not found")) {
            // don't show error UI popup since we may running in an API, batch mode operation
            const errorMessage =
                "Please verify local installation of Git software. Git is required for Visual Studio Code to access GitHub.";
            boostLogging.error(errorMessage, false);
            throw new Error(errorMessage);
        }
        // otherwise rethrow the error
        boostLogging.warn(
            `Error fetching GitHub session from Visual StudioCode: ${
                boostLogging.shouldLog("debug") ? (err as Error).stack : err
            }`,
            false
        );
        errorMessage = err.message;
    }
    if (!session || errorMessage) {
        const userError =
            "Unable to retrieve GitHub session token from Visual Studio Code - please re-authorize GitHub and try again.";
        if (errorMessage) {
            errorMessage = `${userError} ${errorMessage}`;
        }
        throw new Error(userError);
    }
    return session;
}

export async function getCurrentOrganization(
    organizationCache: vscode.ExtensionContext | undefined = undefined
): Promise<string> {
    // if we have a cached value, return it
    let org: string = organizationCache?.globalState?.get("organization") ?? "";
    if (org) {
        // if we have an extension cache org, then update the default boost config org as well to keep in sync
        if (BoostConfiguration.defaultOrganization !== org) {
            BoostConfiguration.defaultOrganization = org;
        }
        return org;
    }

    // otherwise, look in the config file
    org = BoostConfiguration.defaultOrganization;
    if (org) {
        boostLogging.log(`Using User Settings Configured Organization: ${org}`);
        return org;
    }

    // if we still don't have a value, try looking in the environment and getting the organization
    // of the current repository
    org = await getCurrentGithubOrganizationFromWorkspace();
    if (org) {
        boostLogging.log(`Using Workspace Organization: ${org}`);
        return org;
    }

    let orgs = await fetchUserOrganizationsServiceRequest();
    if (orgs && orgs.organizations && orgs.organizations.length > 0) {
        org = orgs.organizations[0];
        boostLogging.debug(`Using GitHub.com Organization: ${org}`);
        return org;
    }

    org = orgs["personal"];
    if (!org) {
        boostLogging.error(`No GitHub Organization or Personal Id found`);
    }
    return org;
}

export async function getCurrentGithubOrganizationFromWorkspace(): Promise<string> {
    // Get the Git extension API.
    const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
    if (!gitExtension) {
        // Git extension is not available.
        return "";
    }

    // Get the Git API from the Git extension.
    const gitApi = gitExtension.getAPI(1);
    if (!gitApi) {
        // Git API is not available.
        return "";
    }

    // Get the active repository.
    const activeRepo = gitApi.repositories[0];
    //if there is no remote set, getRemotes will no be available
    if (!activeRepo || !activeRepo.getRemotes) {
        // No active repository.
        return "";
    }

    // Get the remote URL of the active repository.
    const remotes = await activeRepo.getRemotes();
    const originRemote = remotes.find(
        (remote: Remote) => remote.name === "origin"
    );
    if (!originRemote) {
        // No 'origin' remote found.
        return "";
    }

    // Extract the GitHub organization from the remote URL.
    const remoteUrl = originRemote.fetchUrl;
    if (!remoteUrl) {
        // Remote URL is not available.
        return "";
    }

    // Use a regular expression to match the GitHub organization from the remote URL.
    const match = remoteUrl.match(/github\.com[/:](\w+)/);
    if (!match || match.length < 2) {
        // GitHub organization not found in the remote URL.
        return "";
    }

    // Return the GitHub organization.
    return match[1];
}
