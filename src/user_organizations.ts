import axios from 'axios';
import { boostLogging } from './boostLogging';
import { BoostConfiguration } from './boostConfiguration';
import { fetchGithubSession } from './authorization';
import { mapError } from './error';

function orgServiceEndpoint(): string {
    switch (BoostConfiguration.cloudServiceStage)
    {
        case "local":
            return 'http://127.0.0.1:8000/user_organizations';
        case 'dev':
            return 'https://cro3oyez4g56b33hvglfwytg3q0alxrz.lambda-url.us-west-2.on.aws/';
        case "test":
            return 'https://cx7j5efr47xhnyyusattghf3q40hewnv.lambda-url.us-west-2.on.aws/';
        case 'staging':
        case 'prod':
        default:
            return 'https://ptb5spl6kvsuioc5zkrgyncrve0jyrew.lambda-url.us-west-2.on.aws/';
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
        throw mapError(err);
    }
}