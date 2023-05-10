import * as vscode from 'vscode';
import axios from 'axios';
import { BoostConfiguration } from './boostConfiguration';
import { fetchGithubSession, getCurrentOrganization } from './authorization';
import { BoostExtension, NOTEBOOK_TYPE } from './extension';
import { fetchUserOrganizationsServiceRequest, UserOrgs } from './user_organizations';
import { boostLogging } from './boostLogging';
import { mapError } from './error';


function serviceEndpoint(): string {
    switch (BoostConfiguration.cloudServiceStage)
    {
        case "local":
            return 'http://127.0.0.1:8000/customer_portal';
        case 'dev':
            return 'https://hry4lqp3ktulatehaowyzhkbja0mkjob.lambda-url.us-west-2.on.aws/';
        case "test":
            return 'https://kpxtpi5swejjt6yiflcpspchim0wrhaa.lambda-url.us-west-2.on.aws/';
        case 'staging':
        case 'prod':
        default:
            return 'https://roxbi254sch3yijt7tqbz4s7jq0jxddr.lambda-url.us-west-2.on.aws/';
    }
}

export async function getCustomerStatus(context: vscode.ExtensionContext): Promise<any> {
    let session = await fetchGithubSession();       // get the session
    let version = BoostConfiguration.version;     // get the extension version
    let organization = await getCurrentOrganization(context);
    let payload = {
        "session": session.accessToken,
        "organization": organization,
        "version": version
    };

    try {
        if (BoostConfiguration.serviceFaultInjection > 0 &&
            (Math.floor(Math.random() * 100) < BoostConfiguration.serviceFaultInjection)) {;
            boostLogging.debug(`Injecting fault into service request fetching organizations`);
            await axios.get('https://serviceFaultInjection/synthetic/error/');
        }

        const result = await axios.post(serviceEndpoint(), payload);
        if (result && result.data && result.data.error) { // if we have an error, throw it - this is generally happens with the local service shim
            throw new Error(`Boost Service failed with a network error: ${result.data.error}`);
        }
        return result.data;
    } catch (err : any) {
        return mapError(err);
    }
}

export function registerCustomerPortalCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand(NOTEBOOK_TYPE + '.customerPortal', async () => {
            let url;
            try {
                let response = await getCustomerStatus(context);
                url = response['portal_url'];
            } catch (err : any) {
                boostLogging.error(`Unable to launch customer portal: ${err.message}. Please contact Polyverse Boost Support`);
                return;
            }
            vscode.env.openExternal(vscode.Uri.parse(url));
        })  
    );
}

export async function updateBoostStatusColors(context: vscode.ExtensionContext, error: any, closure: BoostExtension) {
    if (closure.statusBar === undefined) {
        return;
    }
    const currentOrganization = await getCustomerStatus(context);

    if (currentOrganization === undefined || currentOrganization instanceof Error) {
        boostLogging.log(`"Unable to retrieve current customer status. ${currentOrganization}`);
    } else {
        switch (currentOrganization['status']) {
        case 'suspended':
            closure.statusBar.color = new vscode.ThemeColor('statusBarItem.errorForeground');
            closure.statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            closure.statusBar.tooltip = 'Your account payment is expired. Please visit the Account Dashboard to update payment info.';
            break;
        case 'paid':
            closure.statusBar.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
            closure.statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
            closure.statusBar.tooltip = 'Your account is an active paid subscription.';
            break;
        case 'trial':
        case 'active':
        default:
            closure.statusBar.color = new vscode.ThemeColor('statusBarItem.warningForeground');
            closure.statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            closure.statusBar.tooltip = 'Your account is an active trial subscription. Please visit the Account Dashboard to add payment info.';
            break;
        }
        boostLogging.log(closure.statusBar.tooltip);
    }
}

export async function setupBoostStatus(context: vscode.ExtensionContext, closure: BoostExtension) {
    const boostStatusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left, 10);
    closure.statusBar = boostStatusBar;
    try {
        const currentOrganization = await getCurrentOrganization(context);
        closure.statusBar.text = "Boost: Organization is " + currentOrganization??"*UNKNOWN*"; 
    } catch (e : any) {
        boostLogging.log(`Error during Activation: Unable to retrieve current organization. ${(e as Error).message}`);
        closure.statusBar.text = "Boost: Organization is *UNKNOWN*";
    }
    await updateBoostStatusColors(context, undefined, closure);

    closure.statusBar.command = NOTEBOOK_TYPE + '.boostStatus';
    closure.statusBar.show();
    vscode.commands.registerCommand(NOTEBOOK_TYPE + '.boostStatus', 
        boostStatusCommand.bind(closure));
    registerSelectOrganizationCommand(context, closure);
    context.subscriptions.push(closure.statusBar);
}

function boostStatusCommand(this: any) {
    // Define the message and button labels
    const openAccountDashboardButton = 'Open Account Dashboard';
    const changeBillingOrganizationButton = 'Change Billing Organization';

    const message = `Status of Polyverse Boost Extension : \n\n${this?.statusBar?.tooltip}`;

    // Show the information message with buttons
    vscode.window.showInformationMessage(
        message,
        openAccountDashboardButton, changeBillingOrganizationButton)
      .then(selection => {
        // Handle the user's response
        if (selection === openAccountDashboardButton) {
          // The user clicked the "Open Account Dashboard" button
          // Perform the appropriate action, e.g., open a URL or show a webview
          vscode.commands.executeCommand(NOTEBOOK_TYPE + '.customerPortal');
        } else if (selection === changeBillingOrganizationButton) {
          // The user clicked the "Change Billing Organization" button
          // Perform the appropriate action, e.g., open a URL or show a webview
          vscode.commands.executeCommand(NOTEBOOK_TYPE + '.selectOrganization');
        } else {
          // The user dismissed the message without clicking any button
          // Perform any necessary cleanup or logging
        }
    });
}

function registerSelectOrganizationCommand(context: vscode.ExtensionContext, closure: BoostExtension) {
    context.subscriptions.push(vscode.commands.registerCommand(
        NOTEBOOK_TYPE + '.selectOrganization', async () => {
        
        try
        {
            // first, fetch the organizations from the portal
            const orgs: UserOrgs = await fetchUserOrganizationsServiceRequest();
            const current = await getCurrentOrganization(context);
            // Use the vscode.window.showQuickPick method to let the user select a language
            // Create an array of QuickPickItem objects
            const quickPickItems: vscode.QuickPickItem[] = [];        
            // Add the "Personal" label and the personal organization
            quickPickItems.push({ label: 'Personal', kind: vscode.QuickPickItemKind.Separator });
            quickPickItems.push({ label: orgs.personal });
            quickPickItems.push({ label: ' ', kind: vscode.QuickPickItemKind.Separator});

            // Add a divider
            quickPickItems.push({ label: 'Organizations', kind: vscode.QuickPickItemKind.Separator });

            // Add the "Organizations" label and the list of organizations
            orgs.organizations.forEach(org => {
                quickPickItems.push({ label: org });
            });

            // Use the vscode.window.showQuickPick method to let the user select an organization
            const selected = await vscode.window.showQuickPick(quickPickItems, {
                canPickMany: false,
                placeHolder: 'Select an organization'
            });

            //check that selected.label is not undefined
            let organization = undefined;
            if( selected && selected.label  ) {
                organization = selected.label;

                //put the organization in the metadata for the extension
                context.globalState.update('organization', organization);
                //now set the selectOrgnanizationButton text
                if( closure.statusBar){
                    closure.statusBar.text = "Boost: Organization is " + organization;

                    await updateBoostStatusColors(context, undefined, closure);
                }
            }
        } catch (err : any) {
            boostLogging.error(`Unable to select organization: ${err.message}.`);
        }
    }));
}