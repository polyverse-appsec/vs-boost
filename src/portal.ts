import * as vscode from 'vscode';
import axios from 'axios';
import { BoostConfiguration } from './boostConfiguration';
import { fetchGithubSession, getCurrentOrganization, UserOrgs, fetchOrganizations } from './authorization';
import { BoostExtension } from './extension';


function serviceEndpoint(): string {
    switch (BoostConfiguration.cloudServiceStage)
    {
        case "local":
            return 'http://127.0.0.1:8000/customer_portal';
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

export function registerCustomerPortalCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('polyverse-boost-notebook.customerPortal', async () => {
            let session = await fetchGithubSession();       // get the session
            let version = BoostConfiguration.version;     // get the extension version
            let organization = await getCurrentOrganization(context);
            let payload = {
                "session": session.accessToken,
                "organization": organization,
                "version": version
            };


            let endpoint = serviceEndpoint();

            const response = await axios.post(
                endpoint,
                payload);
            
            let url = response.data['portal_url'];
            vscode.env.openExternal(vscode.Uri.parse(url));
        })  
    );
}

export function setupBoostStatus(context: vscode.ExtensionContext, closure: BoostExtension){
    const boostStatusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left);
    boostStatusBar.text = "Boost: Organization is " + "polyverse"; 
    boostStatusBar.command = 'polyverse-boost-notebook.boostStatus';
    boostStatusBar.show();
    vscode.commands.registerCommand('polyverse-boost-notebook.boostStatus', 
        boostStatusCommand.bind(closure));
    closure.statusBar = boostStatusBar;
    registerSelectOrganizationCommand(context, closure);
}

function boostStatusCommand() {
    // Define the message and button labels
    const message = 'Here is the status of your extension.';
    const openAccountDashboardButton = 'Open Account Dashboard';
    const changeBillingOrganizationButton = 'Change Billing Organization';
  
    // Show the information message with buttons
    vscode.window.showInformationMessage(message, openAccountDashboardButton, changeBillingOrganizationButton)
      .then(selection => {
        // Handle the user's response
        if (selection === openAccountDashboardButton) {
          // The user clicked the "Open Account Dashboard" button
          // Perform the appropriate action, e.g., open a URL or show a webview
          vscode.commands.executeCommand('polyverse-boost-notebook.customerPortal');
        } else if (selection === changeBillingOrganizationButton) {
          // The user clicked the "Change Billing Organization" button
          // Perform the appropriate action, e.g., open a URL or show a webview
          vscode.commands.executeCommand('polyverse-boost-notebook.selectOrganization');
        } else {
          // The user dismissed the message without clicking any button
          // Perform any necessary cleanup or logging
        }
      });
  }

function registerSelectOrganizationCommand(context: vscode.ExtensionContext, closure: BoostExtension) {
    context.subscriptions.push(vscode.commands.registerCommand(
        'polyverse-boost-notebook.selectOrganization', async () => {
        
        // first, fetch the organizations from the portal
        const orgs: UserOrgs = await fetchOrganizations();
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
            }
        }
    }));
}