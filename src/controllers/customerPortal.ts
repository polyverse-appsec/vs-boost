
import axios from "axios";
import * as vscode from "vscode";

import { BoostConfiguration } from "../extension/boostConfiguration";
import { fetchGithubSession, getCurrentOrganization } from "../utilities/authorization";
import { mapError } from "../utilities/error";
import { boostLogging } from "../utilities/boostLogging";

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