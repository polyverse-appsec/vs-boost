import axios from 'axios';
import { boostLogging } from './boostLogging';
import { BoostConfiguration } from './boostConfiguration';
import { fetchGithubSession } from './authorization';

function orgServiceEndpoint(): string {
    switch (BoostConfiguration.cloudServiceStage)
    {
        case "local":
            return 'http://127.0.0.1:8000/user_organizations';
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

// Define a type for the orgs object
export type UserOrgs = {
    organizations: string[];
    personal: string;
};

export async function fetchUserOrganizationsServiceRequest(): Promise<UserOrgs> {
    try {
        if (BoostConfiguration.serviceFaultInjection > 0 &&
            (Math.floor(Math.random() * 100) < BoostConfiguration.serviceFaultInjection)) {;
            boostLogging.debug(`Injecting fault into service request fetching organizations`);
            await axios.get('https://serviceFaultInjection/synthetic/error/');
        }

        let session = await fetchGithubSession();       // get the session
        let version = BoostConfiguration.version;     // get the extension version
        let payload = {
            "session": session.accessToken,
            "version": version
        };
    
        const result = await axios.post(orgServiceEndpoint(), payload);
        if (result && result.data && result.data.error) { // if we have an error, throw it - this is generally happens with the local service shim
            throw new Error(`Boost Service failed with a network error: ${result.data.error}`);
        }
        return result.data;
    } catch (err : any) {
        if (err.response) {
            switch (err.response.status) {
                case 400: // bad request - potential bad input from Boost extension or invalid source
                case 500: // internal server error, likely OpenAI timeout/issue
                    throw new Error(
                        "Unable to process this source code. This can be caused by a temporary issue with the " +
                        "Boost Cloud Service, or by an issue in the source input. Please try again, and if the " +
                        "problem persists, please contact Boost Support.");

                case 401: // authorization error - likely GitHub issue
                    throw new Error(
                        "Unable to use your GitHub authorized account to access the Boost Cloud Service. " +
                        "Please check your GitHub account settings, and try again. Also note that your Polyverse " +
                        "license must use the same email address as your GitHub account.");
                case 501: // account usage limit exceeded - need credit card or access upgraded
                    throw new Error(
                        "Current account usage/billing limit reached. " +
                        "Please visit your Customer Account portal to update your account.");
            case 502: // bad gateway, possible timeout
                    throw new Error(
                        "Boost code analysis service is currently unavailable. " +
                        "Please try your request again.");
                default:
                    throw err;
            }
        } else if (err.code) {
            switch (err.code) {
                case 'ECONNREFUSED': // connection refused
                    throw new Error(
                        "Unable to connect to the Boost Cloud Service. " +
                        "Please check your internet connection, and try again.");
                case 'ENOTFOUND': // service domain/endpoint not found
                    throw new Error(
                        "Boost Cloud Service could not be resolved. " +
                        "Please check your internet connection, and try again.");
                case 'ECONNRESET': // connection reset
                    throw new Error(
                        "Boost code analysis service is currently unavailable. " +
                        "Please try your request again.");
                case 'ETIMEOUT': // connection timeout
                    throw new Error(
                        "Boost code analysis service is currently unavailable due to network timeout. " +
                        "Please try your request again.");
                default:
                    throw err;
            }
        } else {
            throw err;
        }
    }
}