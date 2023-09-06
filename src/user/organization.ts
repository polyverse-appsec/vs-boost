import * as vscode from "vscode";

import { BoostConfiguration } from "../extension/boostConfiguration";
import { getCurrentOrganization } from "../utilities/authorization";
import { boostLogging } from "../utilities/boostLogging";

import {
    fetchUserOrganizationsServiceRequest,
    UserOrgs,
} from "../controllers/user_organizations";

export async function promptUserForOrganization(
    context: vscode.ExtensionContext) : Promise<boolean> {

    // first, fetch the organizations from the portal
    const orgs: UserOrgs =
        await fetchUserOrganizationsServiceRequest();

    const current = await getCurrentOrganization(context);

    // Use the vscode.window.showQuickPick method to let the user select a language
    // Create an array of QuickPickItem objects
    const quickPickItems: vscode.QuickPickItem[] = [];

    // Add the "Personal" label and the personal organization
    quickPickItems.push({
        label: "Personal",
        kind: vscode.QuickPickItemKind.Separator,
    });
    quickPickItems.push({ label: orgs.personal });
    quickPickItems.push({
        label: " ",
        kind: vscode.QuickPickItemKind.Separator,
    });

    // Add a divider
    quickPickItems.push({
        label: "Organizations",
        kind: vscode.QuickPickItemKind.Separator,
    });

    // Add the "Organizations" label and the list of organizations
    orgs.organizations.forEach((org) => {
        quickPickItems.push({ label: org });
    });

    // Use the vscode.window.showQuickPick method to let the user select an organization
    const selected = await vscode.window.showQuickPick(
        quickPickItems,
        {
            canPickMany: false,
            placeHolder: "Select an organization",
        }
    );

    //check that selected.label is not undefined
    let organization = undefined;
    if (!selected || !selected.label) {
        return false;
    }

    organization = selected.label;

    //put the organization in the metadata for the extension
    context.globalState.update(
        "organization",
        organization
    );

    BoostConfiguration.defaultOrganization = organization;

    return true;
}

export async function setUserOrganization(
    context: vscode.ExtensionContext,
    organizationName: string) : Promise<boolean> {

    if (!organizationName) {
        boostLogging.error(
            `Please provide a valid organization name.`);
        return false;
    }

    // first, fetch the organizations from the portal
    const orgs: UserOrgs =
        await fetchUserOrganizationsServiceRequest();

        // if organization requested isn't valid, then fail
    if (orgs.personal !== organizationName &&
        orgs.organizations.indexOf(organizationName) === -1) {
        boostLogging.error(
            `Unable to set organization to ${organizationName}:  not a valid organization.`);
        return false;
    }

    const current = await getCurrentOrganization(context);

    if (current === organizationName) {
        boostLogging.log(`Organization is already set to ${organizationName}`);
        return true;
    }

    //put the organization in the metadata for the extension
    context.globalState.update(
        "organization",
        organizationName
    );

    BoostConfiguration.defaultOrganization = organizationName;

    return true;
}