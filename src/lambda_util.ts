import axios from 'axios';
import * as vscode from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import { fetchGithubSession, getCurrentOrganization } from './authorization';

//helper function to make a call to a service endpoint
export async function callServiceEndpoint(context: vscode.ExtensionContext,  serviceEndpoint: string, command: string, payload: any, ): Promise<any> {
    const session = await fetchGithubSession();
    const organization = await getCurrentOrganization(context);

    let authpayload = {
        session: session.accessToken,
        organization: organization
    };

    let aiPayload = {};
    // pass temperature through
    if (BoostConfiguration.analysisRankedProbabilityByKernel(command)) {
        aiPayload = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            top_p: BoostConfiguration.analysisRankedProbabilityByKernel(command)};    
    } else if (BoostConfiguration.analysisRankedProbability) {
        aiPayload = { 
            // eslint-disable-next-line @typescript-eslint/naming-convention
            top_p: BoostConfiguration.analysisRankedProbability};    
    } else if (BoostConfiguration.analysisTemperatureByKernel(command)) {
        aiPayload = {
            temperature: BoostConfiguration.analysisTemperatureByKernel(command)};    
    } else if (BoostConfiguration.analysisTemperature) {
        aiPayload = {
            temperature: BoostConfiguration.analysisTemperature};    
    } 

    // specify the 3.5 model for faster chat interaction
/*
    aiPayload = {
        ...aiPayload, model: "gpt-3.5-turbo"
    };
*/

    //now merge the three payloads
    let newPayload = { ...authpayload, ...aiPayload, ...payload };

    const headers = {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'User-Agent': `Boost-VSCE/${BoostConfiguration.version}`
    };
    
    return axios.post(
        serviceEndpoint,
        newPayload, { headers }).then((response) => {
            return response.data;
        }).catch((error) => {
            throw error;
        });
}
