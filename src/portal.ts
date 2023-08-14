import * as vscode from "vscode";
import axios from "axios";
import { BoostConfiguration } from "./extension/boostConfiguration";
import { fetchGithubSession, getCurrentOrganization } from "./utilities/authorization";
import { BoostExtension } from "./extension/BoostExtension";
import {
    fetchUserOrganizationsServiceRequest,
    UserOrgs,
} from "./controllers/user_organizations";
import { NOTEBOOK_TYPE } from "./data/jupyter_notebook";
import { boostLogging } from "./utilities/boostLogging";
import { mapError } from "./utilities/error";
import { BoostCommands } from "./extension/extension";

function serviceEndpoint(): string {
    switch (BoostConfiguration.cloudServiceStage) {
        case "local":
            return "http://127.0.0.1:8000/customer_portal";
        case "dev":
            return "https://hry4lqp3ktulatehaowyzhkbja0mkjob.lambda-url.us-west-2.on.aws/";
        case "test":
            return "https://kpxtpi5swejjt6yiflcpspchim0wrhaa.lambda-url.us-west-2.on.aws/";
        case "staging":
        case "prod":
        default:
            return "https://roxbi254sch3yijt7tqbz4s7jq0jxddr.lambda-url.us-west-2.on.aws/";
    }
}

export class BoostAuthenticationException extends Error {
    constructor(message?: string) {
        super(message);
        this.name = "BoostAuthenticationException";
    }
}

export async function preflightCheckForCustomerStatus(
    context: vscode.ExtensionContext,
    extension: BoostExtension
) {
    const accountStatus = await updateBoostStatusColors(
        context,
        undefined,
        extension
    );
    if (
        accountStatus === "paid" ||
        accountStatus === "trial" ||
        accountStatus === "active"
    ) {
        return;
    } else {
        boostLogging.error(
            `Unable to access Boost Cloud Service due to account status. Please check your account settings.`,
            false
        );
        throw new BoostAuthenticationException(
            `Unable to access Boost Cloud Service due to account status. Please check your account settings.`
        );
    }
}

export async function getCustomerStatus(
    context: vscode.ExtensionContext
): Promise<any> {
    let session = await fetchGithubSession(!context); // get the session
    let organization = await getCurrentOrganization(context);
    if (!organization) {
        boostLogging.warn("Unable to identify current organization", false);
    } else if (!session) {
        boostLogging.warn("Unable to identify current GitHub session", false);
    }
    let payload = {
        session: session.accessToken,
        organization: organization,
    };
    const headers = {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "User-Agent": `Boost-VSCE/${BoostConfiguration.version}`,
    };

    try {
        if (
            BoostConfiguration.serviceFaultInjection > 0 &&
            Math.floor(Math.random() * 100) <
                BoostConfiguration.serviceFaultInjection
        ) {
            boostLogging.debug(
                `Injecting fault into service request fetching organizations`
            );
            await axios.get("https://serviceFaultInjection/synthetic/error/");
        }

        const result = await axios.post(serviceEndpoint(), payload, {
            headers,
        });
        if (result && result.data && result.data.error) {
            // if we have an error, throw it - this is generally happens with the local service shim
            throw new Error(
                `Boost Service failed with a network error: ${result.data.error}`
            );
        }
        return result.data;
    } catch (err: any) {
        return mapError(err);
    }
}

export function registerCustomerPortalCommand(
    context: vscode.ExtensionContext
) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            NOTEBOOK_TYPE + "." + BoostCommands.customerPortal,
            async () => {
                let url;
                try {
                    let response = await getCustomerStatus(context);
                    url = response["portal_url"];
                } catch (err: any) {
                    boostLogging.error(
                        `Unable to launch customer portal: ${err.message}. Please contact Polyverse Boost Support`,
                        true
                    );
                    return;
                }
                vscode.env.openExternal(vscode.Uri.parse(url));
            }
        )
    );
}

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

const pendingBoostStatusBarText = "Boost: Organization is *PENDING*";
const errorBoostStatusBarText = "Boost: Organization is *ERROR*";

export async function setupBoostStatus(
    context: vscode.ExtensionContext,
    closure: BoostExtension
) {
    const boostStatusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        10
    );
    closure.statusBar = boostStatusBar;
    closure.statusBar.text = pendingBoostStatusBarText;
    closure.statusBar.color = new vscode.ThemeColor(
        "statusBarItem.warningForeground"
    );
    closure.statusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
    );
    closure.statusBar.show();

    await refreshBoostOrgStatus(context, closure);

    vscode.commands.registerCommand(
        NOTEBOOK_TYPE + ".boostStatus",
        boostStatusCommand.bind(closure)
    );
    closure.statusBar.command = NOTEBOOK_TYPE + ".boostStatus";
    registerSelectOrganizationCommand(context, closure);
    context.subscriptions.push(closure.statusBar);
}

async function refreshBoostOrgStatus(
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

function boostStatusCommand(this: any) {
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

function registerSelectOrganizationCommand(
    context: vscode.ExtensionContext,
    closure: BoostExtension
) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            NOTEBOOK_TYPE + "." + BoostCommands.selectOrganization,
            async () => {
                try {
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
                    if (selected && selected.label) {
                        organization = selected.label;

                        //put the organization in the metadata for the extension
                        context.globalState.update(
                            "organization",
                            organization
                        );

                        BoostConfiguration.defaultOrganization = organization;

                        //now set the selectOrgnanizationButton text
                        if (closure.statusBar) {
                            closure.statusBar.text =
                                "Boost: Organization is " + organization;

                            await updateBoostStatusColors(
                                context,
                                undefined,
                                closure
                            );
                        }
                    }
                } catch (err: any) {
                    boostLogging.error(
                        `Unable to select organization: ${err.message}.`,
                        true
                    );
                }
            }
        )
    );
}
