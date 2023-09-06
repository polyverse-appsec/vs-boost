import * as vscode from "vscode";
import { BoostExtension } from "./BoostExtension";
import { NOTEBOOK_TYPE } from "../data/jupyter_notebook";
import { boostLogging } from "../utilities/boostLogging";
import { BoostCommands } from "./extension";
import { getCurrentOrganization } from "../utilities/authorization";
import {
    getCustomerStatus
} from "../controllers/customerPortal";

const gitHubAuthorizationFailureToolTip =
    "Unable to access your current account status. Please check your GitHub Authorization status, then network connection status.";

export async function updateBoostStatusColors(
    context: vscode.ExtensionContext,
    extraData: any,
    closure: BoostExtension
): Promise<string> {
    if (closure.statusBar === undefined) {
        return "unknown";
    }

    // if the caller provided the account data, we can use it, otherwise fetch it
    // today the caller only provides status and enabled - so if want full info we
    // need to fetch it
    const callerAccountInfo = extraData?.response?.data?.account;
    if (callerAccountInfo) {
        // we'll update whatever fields/info we got (shallow update)
        // in case the deep-get fails (network issue or bigger account problem)
        closure.updateAccountInfo(callerAccountInfo);
    }

    // then do a deep update to get more details of the account
    const accountInfo = await getCustomerStatus(context);

    if (accountInfo === undefined || accountInfo instanceof Error) {
        if (!accountInfo) {
            boostLogging.log(`Unable to retrieve current customer status.`);
        } else {
            boostLogging.log(
                `Unable to retrieve current customer status. ${accountInfo}`
            );
        }
        closure.statusBar.color = new vscode.ThemeColor(
            "statusBarItem.errorForeground"
        );
        closure.statusBar.backgroundColor = new vscode.ThemeColor(
            "statusBarItem.errorBackground"
        );
        closure.statusBar.tooltip = gitHubAuthorizationFailureToolTip;
        if (!accountInfo) {
            return "unknown";
        } else {
            return accountInfo.message;
        }
    } else {
        closure.updateAccountInfo(accountInfo);
        switch (accountInfo["status"]) {
            case "unregistered":
                closure.statusBar.color = new vscode.ThemeColor(
                    "statusBarItem.errorForeground"
                );
                closure.statusBar.backgroundColor = new vscode.ThemeColor(
                    "statusBarItem.errorBackground"
                );
                closure.statusBar.tooltip =
                    "Cannot find your Polyverse Boost account. Please verify your GitHub email is authorized in Visual Studio Code and retry.";
                break;
            case "expired":
                closure.statusBar.color = new vscode.ThemeColor(
                    "statusBarItem.errorForeground"
                );
                closure.statusBar.backgroundColor = new vscode.ThemeColor(
                    "statusBarItem.errorBackground"
                );
                closure.statusBar.tooltip =
                    "Your Boost trial has expired. Please visit the Account Dashboard to update payment info.";
                break;
            case "suspended":
                closure.statusBar.color = new vscode.ThemeColor(
                    "statusBarItem.errorForeground"
                );
                closure.statusBar.backgroundColor = new vscode.ThemeColor(
                    "statusBarItem.errorBackground"
                );
                closure.statusBar.tooltip =
                    "Your account payment is expired. Please visit the Account Dashboard to update payment info.";
                break;
            case "canceled":
                closure.statusBar.color = new vscode.ThemeColor(
                    "statusBarItem.errorForeground"
                );
                closure.statusBar.backgroundColor = new vscode.ThemeColor(
                    "statusBarItem.errorBackground"
                );
                closure.statusBar.tooltip =
                    "Your account subscription has been canceled. Please visit the Account Dashboard to restart your subscription.";
                break;
            case "paid":
                closure.statusBar.color = new vscode.ThemeColor(
                    "statusBarItem.prominentForeground"
                );
                closure.statusBar.backgroundColor = new vscode.ThemeColor(
                    "statusBarItem.prominentBackground"
                );
                closure.statusBar.tooltip =
                    "Your account is an active paid subscription.";
                break;
            case "trial":
            case "active":
            default:
                closure.statusBar.color = new vscode.ThemeColor(
                    "statusBarItem.warningForeground"
                );
                closure.statusBar.backgroundColor = new vscode.ThemeColor(
                    "statusBarItem.warningBackground"
                );
                closure.statusBar.tooltip =
                    "Your account is an active trial subscription. Please visit the Account Dashboard to add payment info.";
                break;
        }
        boostLogging.log(
            `Customer Status refresh: ${closure.statusBar.tooltip}`
        );
        return accountInfo["status"];
    }
}

export const pendingBoostStatusBarText = "Boost: Organization is *PENDING*";
const errorBoostStatusBarText = "Boost: Organization is *ERROR*";


export async function refreshBoostOrgStatus(
    context: vscode.ExtensionContext,
    closure: BoostExtension
) {
    if (!closure.statusBar) {
        return;
    }

    try {
        if (
            closure.statusBar.text === pendingBoostStatusBarText ||
            closure.statusBar.text === errorBoostStatusBarText
        ) {
            closure.statusBar.tooltip =
                "Current account status check *PENDING*. If problem persists, please check your GitHub Authorization status, then network connection status.";
        }
        const currentOrganization = await getCurrentOrganization(context);
        closure.statusBar.text = `Boost: Organization is ${
            currentOrganization ?? "*UNKNOWN*"
        }`;
    } catch (e: any) {
        boostLogging.log(
            `Error during Activation: Unable to retrieve current organization. ${
                (e as Error).message
            }`
        );
        closure.statusBar.text = errorBoostStatusBarText;
        closure.statusBar.tooltip = `Current account status check *ERROR*. ${
            (e as Error).message
        }\nIf problem persists, please check your GitHub Authorization status, then network connection status.`;
    }
    try {
        await updateBoostStatusColors(context, undefined, closure);
    } catch (e: any) {
        boostLogging.log(
            `Error during Activation: Unable to check account status. ${
                (e as Error).message
            }`
        );
    }
}

export function boostStatusCommand(this: any) {
    // if the org hasn't been set yet, retry setting it
    if (
        this.statusBar.text === pendingBoostStatusBarText ||
        this.statusBar.text === errorBoostStatusBarText ||
        this.statusBar.tooltip === gitHubAuthorizationFailureToolTip
    ) {
        refreshBoostOrgStatus(this.context, this);
    }

    // Define the message and button labels
    const openAccountDashboardButton = "Open Account Dashboard";
    const changeBillingOrganizationButton = "Change Billing Organization";

    const message = `Status of Polyverse Boost Extension : \n\n${this.statusBar.tooltip}`;

    // Show the information message with buttons
    vscode.window
        .showInformationMessage(
            message,
            openAccountDashboardButton,
            changeBillingOrganizationButton
        )
        .then((selection) => {
            // Handle the user's response
            if (selection === openAccountDashboardButton) {
                // The user clicked the "Open Account Dashboard" button
                // Perform the appropriate action, e.g., open a URL or show a webview
                vscode.commands.executeCommand(
                    NOTEBOOK_TYPE + "." + BoostCommands.customerPortal
                );
            } else if (selection === changeBillingOrganizationButton) {
                // The user clicked the "Change Billing Organization" button
                // Perform the appropriate action, e.g., open a URL or show a webview
                vscode.commands.executeCommand(
                    NOTEBOOK_TYPE + "." + BoostCommands.selectOrganization
                );
            } else {
                // The user dismissed the message without clicking any button
                // Perform any necessary cleanup or logging
            }
        });
}
