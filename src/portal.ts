import * as vscode from 'vscode';
import axios from 'axios';
import { BoostConfiguration } from './boostConfiguration';
import { fetchGithubSession } from './base_controller';
import { getCurrentExtensionVersion } from './boostConfiguration';


function serviceEndpoint(): string {
    switch (BoostConfiguration.cloudServiceStage)
    {
        case "local":
            return 'http://127.0.0.1:8000/customer_portal';
        case 'dev':
            return 'http://127.0.0.1:8000/customer_portal';
        case "test":
            return 'http://127.0.0.1:8000/customer_portal';
        case 'staging':
        case 'prod':
        default:
            return 'http://127.0.0.1:8000/customer_portal';
    }
}

export function registerCustomerPortalCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('polyverse-boost-notebook.customerPortal', async () => {
            let session = await fetchGithubSession();       // get the session
            let version = getCurrentExtensionVersion();     // get the extension version
            let payload = {
                "session": session.accessToken,
                "organization": "polyverse",
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

