// eslint-disable-next-line @typescript-eslint/naming-convention
let BoostConfiguration: any;

try {
    // Try to require vscode
    require("vscode");

    // If the above line doesn't throw an error, vscode exists, so load BoostConfiguration
    BoostConfiguration =
        require("../extension/boostConfiguration").BoostConfiguration;
} catch (e) {
    // vscode module doesn't exist; continue without loading BoostConfiguration
}

export function mapError(err: any): Error {
    if (err.response) {
        switch (err.response.status) {
            case 400: // bad request - potential bad input from Boost extension or invalid source
            case 500: // internal server error, likely OpenAI timeout/issue
                return new Error(
                    "Unable to process this source code. This can be caused by a temporary issue with the " +
                        "Boost Cloud Service, or by an issue in the source input. Please try again, and if the " +
                        "problem persists, please contact Boost Support."
                );
            case 401: // authorization error - likely GitHub or Billing issue
                if (err.response.data && err.response.data.error) {
                    return new Error(err.response.data.error);
                } else {
                    return new Error(
                        "Unable to use your GitHub authorized account to access the Boost Cloud Service. " +
                            "Please check your GitHub account and Billing settings, and try again. Also note that your Polyverse " +
                            "license must use the same email address as your GitHub account."
                    );
                }
            case 404: // not found - server API is missing
            case 405: // method not allowed - server API is missing
                return new Error(
                    "Boost code analysis service is currently unavailable. " +
                        "Please try your request again. If the problem persists please contact Boost Support."
                );
            case 501: // account usage limit exceeded - need credit card or access upgraded
                return new Error(
                    "Current account usage/billing limit reached. " +
                        "Please visit your Customer Account portal to update your account."
                );
            case 502: // bad gateway, possible timeout
                return new Error(
                    "Boost code analysis service is currently unavailable. " +
                        "Please try your request again."
                );
            default:
                throw err;
        }
    } else if (err.code) {
        switch (err.code) {
            case "ECONNREFUSED": // connection refused
                return new Error(
                    "Unable to connect to the Boost Cloud Service. " +
                        "Please check your internet connection, and try again."
                );
            case "ENOTFOUND": // service domain/endpoint not found
                return new Error(
                    "Boost Cloud Service could not be resolved. " +
                        "Please check your internet connection, and try again."
                );
            case "ECONNRESET": // connection reset
                return new Error(
                    "Boost code analysis service is currently unavailable. " +
                        "Please try your request again."
                );
            case "ETIMEOUT": // connection timeout
                return new Error(
                    "Boost code analysis service is currently unavailable due to network timeout. " +
                        "Please try your request again."
                );
            default:
                throw err;
        }
    } else {
        throw err;
    }
}

export function errorToString(err: any): string {
    if (err instanceof Error) {
        if (
            !BoostConfiguration ||
            BoostConfiguration.cloudServiceStage === "local" ||
            BoostConfiguration.logLevel === "debug"
        ) {
            return `${err.message}\n${err.stack}`;
        } else {
            return err.message;
        }
    } else {
        return String(err);
    }
}
