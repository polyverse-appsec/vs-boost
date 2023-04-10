import axios from 'axios';
import * as vscode from 'vscode';

export const DEBUG_BOOST_LAMBDA_LOCALLY = false;

export async function makeBoostServiceRequest(
    explainUrl: string,
    code: string,
    session : vscode.AuthenticationSession): Promise<any> {
    try {
        const response = await axios.post(
            explainUrl,
            { code: code, session: session.accessToken });
        return response.data;
    } catch (err : any) {
        if (err.response && err.response.status === 401) {
            throw new Error(
                "Unable to use your GitHub authorized account to access the Boost Cloud Service. " +
                "Please check your GitHub account settings, and try again.");
        } else {
            throw err;
        }
    }
}
