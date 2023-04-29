import * as vscode from 'vscode';
import axios from 'axios';

import { fetchGithubSession } from './base_controller'; 


export function registerCustomerPortalCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('polyverse-boost-notebook.customerPortal', async () => {
            let session = await fetchGithubSession();       // get the session
            let payload = {
                "session": session.accessToken,
                "organization": "polyverse",
                "version": "1.0.0"
            };

            const response = await axios.post(
                "http://localhost:8000/customer_portal",
                payload);
            
            let url = response.data['portal_url'];
            vscode.env.openExternal(vscode.Uri.parse(url));
        })  
    );
}

